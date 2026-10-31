import { OpenId4VciCredentialFormatProfile, OpenId4VcVerificationSessionState } from '@credo-ts/openid4vc'
import { EntityManager } from '@mikro-orm/core'
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Agent, AGENT_TOKEN } from 'common/agent'
import { Role } from 'common/auth'
import { Wallet } from 'common/entities'
import AgentConfig from 'config/agent'
import PresentationSessionConfig from 'config/presentation-session'
import { CONTRIBUTOR_CREDENTIAL_VCT } from 'contributor-credential/contributor-credential.constants'
import { ContributorAuditEvent, ContributorAuditEventType } from 'contributor-onboarding/contributor-audit-event.entity'
import { ContributorOnboardingService } from 'contributor-onboarding/contributor-onboarding.service'
import { OpenId4VcVerificationSessionService } from 'openid4vc/verification-sessions/verification-session.service'
import { OpenId4VcVerifierService } from 'openid4vc/verifier/verifier.service'
import { getWalletId } from 'utils/auth'
import { withTenantAgent } from 'utils/multi-tenancy'

import { GithubCheckNotifier } from './github-check-notifier'
import { PolicyConfigProvider } from './policy-config.provider'
import {
  decidePresentation,
  humanReason,
  PRESENTATION_SESSION_TTL_MS,
  recentSuccessCovers,
} from './presentation-decision'
import { PresentationSession, PresentationSessionState } from './presentation-session.entity'
import { DEFAULT_POLICY, type ResolvedPolicy } from './repository-policy'
import { isUniqueViolation } from './unique-violation'

const OPEN_STATES = [PresentationSessionState.Pending, PresentationSessionState.InProgress]

export interface CreatePresentationSessionInput {
  githubAccountId: string
  githubUsername: string
  installationId: string
  owner: string
  repo: string
  prNumber: number
  headSha: string
  policyYaml?: string
}

export interface PresentationSessionView {
  sessionId: string
  state: PresentationSessionState
  expiresAt: string
  sessionUrl: string
  authorizationRequestUri?: string
  alreadySatisfied: boolean
  failureReason?: string
  warning?: string
  humanReason?: string
  disposition: 'skip' | 'grace' | 'verify'
  configWarning?: string
}

@Injectable()
export class PresentationSessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresentationSessionService.name)
  private timer?: NodeJS.Timeout

  public constructor(
    private readonly em: EntityManager,
    @Inject(AGENT_TOKEN) private readonly agent: Agent,
    @Inject(AgentConfig.KEY) private readonly agentConfig: ConfigType<typeof AgentConfig>,
    @Inject(PresentationSessionConfig.KEY)
    private readonly presentationConfig: ConfigType<typeof PresentationSessionConfig>,
    private readonly verificationSessions: OpenId4VcVerificationSessionService,
    private readonly verifiers: OpenId4VcVerifierService,
    private readonly checks: GithubCheckNotifier,
    private readonly policy: PolicyConfigProvider,
    private readonly onboarding: ContributorOnboardingService,
  ) {}

  public onModuleInit(): void {
    void this.sweep()
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.sweep(), 60_000)
    this.timer.unref?.()
  }

  public onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  public async create(input: CreatePresentationSessionInput, now = new Date()): Promise<PresentationSessionView> {
    const em = this.em.fork()
    const open = await em.findOne(PresentationSession, {
      owner: input.owner,
      repo: input.repo,
      prNumber: input.prNumber,
      headSha: input.headSha,
      state: { $in: OPEN_STATES },
    })
    if (open && open.expiresAt > now) return this.toView(open)

    const recent = await em.findOne(
      PresentationSession,
      { githubAccountId: input.githubAccountId, state: PresentationSessionState.Success },
      { orderBy: { completedAt: 'DESC' } },
    )
    if (recent?.completedAt && recentSuccessCovers(recent.completedAt, now)) {
      const covered = new PresentationSession()
      covered.githubAccountId = input.githubAccountId
      covered.githubUsername = input.githubUsername
      covered.installationId = input.installationId
      covered.owner = input.owner
      covered.repo = input.repo
      covered.prNumber = input.prNumber
      covered.headSha = input.headSha
      covered.state = PresentationSessionState.Success
      covered.satisfiedBySessionId = recent.id
      covered.expiresAt = new Date(now.getTime() + PRESENTATION_SESSION_TTL_MS)
      covered.completedAt = now
      covered.humanReason = 'A presentation from this GitHub account already succeeded within the last 15 minutes.'
      em.persist(covered)
      await em.flush()
      return this.toView(covered)
    }

    const resolved = this.policy.resolve(input.policyYaml)
    const session = this.blankSession(input, now)
    this.rememberPolicy(session, resolved, now)

    if (resolved.mode === 'disabled') {
      session.state = PresentationSessionState.Success
      session.completedAt = now
      session.warning = 'policy_disabled'
      session.humanReason = 'Verification is disabled for this repository.'
      em.persist(session)
      await em.flush()
      return this.toView(session)
    }

    if (resolved.graceEnabled) {
      const binding = await this.onboarding.findVerifiedBindingByGithubAccountId(input.githubAccountId)
      const start = await this.graceStart(em, input, now)
      const until = new Date(start.getTime() + resolved.graceDays * 24 * 60 * 60 * 1000)
      session.graceUntil = until
      if (!binding && now < until) {
        session.state = PresentationSessionState.Success
        session.completedAt = now
        session.warning = 'grace_period_active'
        session.humanReason = `Onboarding grace is active until ${until.toISOString()}.`
        em.persist(session)
        await em.flush()
        return this.toView(session)
      }
    }

    const offer = await this.openAuthorizationRequest()
    session.authorizationRequestUri = offer.authorizationRequestUri
    session.verificationSessionId = offer.verificationSessionId
    session.trustedIssuerDid = offer.trustedIssuerDid
    return this.insertOpen(em, session, now)
  }

  public async closePullRequest(input: { owner: string; repo: string; prNumber: number }): Promise<{ closed: number }> {
    const em = this.em.fork()
    const open = await em.find(PresentationSession, {
      owner: input.owner,
      repo: input.repo,
      prNumber: input.prNumber,
      state: { $in: OPEN_STATES },
    })
    for (const session of open) {
      session.state = PresentationSessionState.Failure
      session.failureReason = 'pull_request_closed'
      session.humanReason = humanReason('pull_request_closed')
      session.completedAt = new Date()
    }
    if (open.length > 0) await em.flush()
    for (const session of open) {
      await this.notify(session, session.policyMode === 'enforce' ? 'failure' : 'neutral')
    }
    return { closed: open.length }
  }

  public async attachCheckRun(sessionId: string, checkRunId: string): Promise<PresentationSessionView> {
    const em = this.em.fork()
    const session = await this.require(em, sessionId)
    session.checkRunId = checkRunId
    await em.flush()
    if (session.state === PresentationSessionState.Success) await this.notify(session)
    return this.toView(session)
  }

  public async getForPage(sessionId: string, now = new Date()): Promise<PresentationSessionView> {
    await this.expireOne(sessionId, now)
    await this.markOpened(sessionId)
    await this.reconcileVerified(sessionId)
    const em = this.em.fork()
    return this.toView(await this.require(em, sessionId))
  }

  public async retry(sessionId: string, now = new Date()): Promise<PresentationSessionView> {
    const em = this.em.fork()
    const session = await this.require(em, sessionId)
    if (session.state === PresentationSessionState.Success) {
      throw new ConflictException('This verification already succeeded.')
    }
    if (session.state === PresentationSessionState.Pending || session.state === PresentationSessionState.InProgress) {
      return this.toView(session)
    }

    const offer = await this.openAuthorizationRequest()
    session.state = PresentationSessionState.Pending
    session.authorizationRequestUri = offer.authorizationRequestUri
    session.verificationSessionId = offer.verificationSessionId
    session.trustedIssuerDid = offer.trustedIssuerDid
    session.failureReason = null
    session.warning = null
    session.humanReason = null
    session.satisfiedBySessionId = null
    session.completedAt = null
    session.expiresAt = new Date(now.getTime() + PRESENTATION_SESSION_TTL_MS)
    try {
      await em.flush()
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error
      throw new ConflictException('An open verification session already exists for this pull request.')
    }
    await this.notify(session, 'action_required')
    return this.toView(session)
  }

  public async sweep(now = new Date()): Promise<number> {
    const em = this.em.fork()
    const open = await em.find(PresentationSession, { state: { $in: OPEN_STATES } })
    let timedOut = 0
    for (const session of open) {
      if (session.expiresAt <= now) {
        this.markTimeout(session, now)
        await this.notify(session)
        timedOut += 1
        continue
      }
      await this.reconcileVerified(session.id)
    }
    if (timedOut > 0) await em.flush()
    return timedOut
  }

  private async markOpened(sessionId: string): Promise<void> {
    const em = this.em.fork()
    const session = await em.findOne(PresentationSession, { id: sessionId })
    if (session?.state !== PresentationSessionState.Pending) return
    session.state = PresentationSessionState.InProgress
    await em.flush()
  }

  private async expireOne(sessionId: string, now: Date): Promise<void> {
    const em = this.em.fork()
    const session = await em.findOne(PresentationSession, { id: sessionId })
    if (!session || !OPEN_STATES.includes(session.state) || session.expiresAt > now) return
    this.markTimeout(session, now)
    await em.flush()
    await this.notify(session)
  }

  private async reconcileVerified(sessionId: string): Promise<void> {
    try {
      await this.applyVerifiedResponse(sessionId)
    } catch (error: unknown) {
      await this.handleReconcileError(sessionId, error)
    }
  }

  /**
   * Credo already caches did:hedera. This method does not add a second DID cache,
   * and GitHub account-id lookup stays uncached on purpose.
   */
  private async handleReconcileError(sessionId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'Presentation reconcile failed'
    const em = this.em.fork()
    const session = await em.findOne(PresentationSession, { id: sessionId })
    if (!session || !OPEN_STATES.includes(session.state)) {
      this.logger.warn(this.sessionLog(sessionId, session, message))
      return
    }
    if (isResolverOutage(error) && session.policyMode === 'enforce') {
      this.finish(
        session,
        {
          outcome: 'failure',
          failureReason: 'resolver_unavailable',
          humanReason: humanReason('resolver_unavailable'),
        },
        em,
      )
      await em.flush()
      await this.notify(session)
      return
    }
    this.logger.warn(this.sessionLog(session.id, session, message))
  }

  private async applyVerifiedResponse(sessionId: string): Promise<void> {
    const em = this.em.fork()
    const session = await em.findOne(PresentationSession, { id: sessionId })
    if (!session?.verificationSessionId || !OPEN_STATES.includes(session.state)) return

    const tenantId = await this.resolveDemoTenantId()
    if (!tenantId) return

    await withTenantAgent({ agent: this.agent, tenantId }, async (tenantAgent) => {
      const record = await this.verificationSessions.getVerificationSession(tenantAgent, session.verificationSessionId!)
      if (record.state === OpenId4VcVerificationSessionState.Error) {
        session.state = PresentationSessionState.Failure
        session.failureReason = 'invalid_vp'
        session.humanReason = humanReason('invalid_vp')
        session.completedAt = new Date()
        return
      }
      if (record.state !== OpenId4VcVerificationSessionState.ResponseVerified) return

      const verified = await tenantAgent.openid4vc.verifier.getVerifiedAuthorizationResponse(
        session.verificationSessionId!,
      )
      const stored = this.storedPolicy(session)
      this.finish(
        session,
        decidePresentation({
          claims: disclosedClaims(verified),
          expectedAccountId: session.githubAccountId,
          trustedIssuerDid: session.trustedIssuerDid ?? '',
          nowSeconds: Math.floor(Date.now() / 1000),
          policyMode: stored.mode === 'enforce' ? 'enforce' : 'warn',
          maxAgeSeconds: stored.maxAgeSeconds,
          allowedIssuerDids: stored.trustedIssuers,
          acceptedIssuerDidMethods: stored.acceptedIssuerDidMethods,
          requiredCredentials: stored.requiredCredentials,
        }),
        em,
      )
    })
    await em.flush()
    if (!OPEN_STATES.includes(session.state)) await this.notify(session)
  }

  private finish(
    session: PresentationSession,
    decision: ReturnType<typeof decidePresentation>,
    em: EntityManager,
  ): void {
    session.completedAt = new Date()
    session.humanReason = decision.humanReason
    session.warning = decision.warning ?? null
    if (decision.outcome === 'success') {
      session.state = PresentationSessionState.Success
      session.failureReason = null
    } else {
      session.state = PresentationSessionState.Failure
      session.failureReason = decision.failureReason ?? 'invalid_vp'
    }
    this.recordPresentationAudit(em, session, decision)
  }

  private recordPresentationAudit(
    em: EntityManager,
    session: PresentationSession,
    decision: ReturnType<typeof decidePresentation>,
  ): void {
    const event = new ContributorAuditEvent()
    event.eventType =
      decision.outcome === 'success'
        ? ContributorAuditEventType.PresentationSucceeded
        : ContributorAuditEventType.PresentationFailed
    event.userId = session.githubAccountId
    event.tenantId = session.owner
    event.githubAccountId = session.githubAccountId
    event.githubUsername = session.githubUsername
    event.metadata = {
      failureReason: decision.failureReason,
      warning: decision.warning,
      owner: session.owner,
      repo: session.repo,
      prNumber: session.prNumber,
    }
    em.persist(event)
  }

  private markTimeout(session: PresentationSession, now: Date): void {
    session.state = PresentationSessionState.Timeout
    session.failureReason = 'session_expired'
    session.humanReason = humanReason('session_expired')
    session.completedAt = now
  }

  private async openAuthorizationRequest(): Promise<{
    authorizationRequestUri: string
    verificationSessionId: string
    trustedIssuerDid: string
  }> {
    const tenantId = await this.resolveDemoTenantId()
    if (!tenantId) {
      throw new NotFoundException('Contributor verifier tenant is not initialised. Call POST /prepare-wallet first.')
    }

    let authorizationRequestUri = ''
    let verificationSessionId = ''
    let trustedIssuerDid = ''
    await withTenantAgent({ agent: this.agent, tenantId }, async (tenantAgent) => {
      const createdDids = await tenantAgent.dids.getCreatedDids()
      const issuerDid = createdDids.find((did) => did.did.startsWith('did:hedera'))?.did ?? createdDids[0]?.did
      if (!issuerDid) {
        throw new NotFoundException('Contributor verifier DID is missing. Call POST /prepare-wallet first.')
      }
      const existing = await this.verifiers.find(tenantAgent, issuerDid)
      if (!existing.length) {
        await this.verifiers.createVerifier(tenantAgent, { publicVerifierId: issuerDid })
      }
      const created = await this.verificationSessions.createRequest(tenantAgent, {
        publicVerifierId: issuerDid,
        requestSigner: { method: 'did', did: issuerDid },
        responseMode: 'direct_post',
        dcql: {
          query: {
            credentials: [
              {
                id: 'GithubContributorCredential',
                format: OpenId4VciCredentialFormatProfile.SdJwtDc,
                meta: { vct_values: [CONTRIBUTOR_CREDENTIAL_VCT] },
                claims: [{ path: ['githubAccountId'] }, { path: ['exp'] }],
                require_cryptographic_holder_binding: true,
              },
            ],
          },
        },
      })
      authorizationRequestUri = created.authorizationRequest
      verificationSessionId = created.verificationSession.id
      trustedIssuerDid = issuerDid
    })
    return { authorizationRequestUri, verificationSessionId, trustedIssuerDid }
  }

  private async notify(
    session: PresentationSession,
    conclusion?: 'success' | 'failure' | 'action_required' | 'neutral',
  ): Promise<void> {
    if (!session.checkRunId) return
    const resolved =
      conclusion ??
      (session.state === PresentationSessionState.Success
        ? 'success'
        : session.state === PresentationSessionState.Pending
          ? 'action_required'
          : 'failure')
    try {
      await this.checks.update({
        installationId: session.installationId,
        owner: session.owner,
        repo: session.repo,
        checkRunId: session.checkRunId,
        conclusion: resolved,
        title: checkTitle(session.state, resolved),
        summary: session.humanReason ?? 'Contributor verification updated.',
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'GitHub check update failed'
      this.logger.warn(this.sessionLog(session.id, session, message))
    }
  }

  private async insertOpen(
    em: EntityManager,
    session: PresentationSession,
    now: Date,
  ): Promise<PresentationSessionView> {
    em.persist(session)
    try {
      await em.flush()
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error
      const winner = await this.em.fork().findOne(PresentationSession, {
        owner: session.owner,
        repo: session.repo,
        prNumber: session.prNumber,
        headSha: session.headSha,
        state: { $in: OPEN_STATES },
      })
      if (winner && winner.expiresAt > now) return this.toView(winner)
      throw error
    }
    return this.toView(session)
  }

  private sessionLog(sessionId: string, session: PresentationSession | null, message: string): string {
    return `sessionId=${sessionId} owner=${session?.owner ?? ''} repo=${session?.repo ?? ''} prNumber=${session?.prNumber ?? ''} ${message}`
  }

  private async require(em: EntityManager, sessionId: string): Promise<PresentationSession> {
    const session = await em.findOne(PresentationSession, { id: sessionId })
    if (!session) throw new NotFoundException('Presentation session not found.')
    return session
  }

  private async resolveDemoTenantId(): Promise<string | undefined> {
    const walletId = getWalletId({ role: Role.User, userId: this.agentConfig.contributorIssuerDemoUser })
    const wallet = await this.em.fork().findOne(Wallet, { id: walletId })
    return wallet?.tenantId
  }

  private toView(session: PresentationSession): PresentationSessionView {
    return {
      sessionId: session.id,
      state: session.state,
      expiresAt: session.expiresAt.toISOString(),
      sessionUrl: `${this.presentationConfig.pageBaseUrl}/contributor/verify/${session.id}`,
      authorizationRequestUri: session.authorizationRequestUri ?? undefined,
      alreadySatisfied: Boolean(session.satisfiedBySessionId),
      failureReason: session.failureReason ?? undefined,
      warning: session.warning ?? undefined,
      humanReason: session.humanReason ?? undefined,
      disposition: this.disposition(session),
      configWarning: session.configWarning ?? undefined,
    }
  }

  private blankSession(input: CreatePresentationSessionInput, now: Date): PresentationSession {
    const session = new PresentationSession()
    session.githubAccountId = input.githubAccountId
    session.githubUsername = input.githubUsername
    session.installationId = input.installationId
    session.owner = input.owner
    session.repo = input.repo
    session.prNumber = input.prNumber
    session.headSha = input.headSha
    session.state = PresentationSessionState.Pending
    session.createdAt = now
    session.expiresAt = new Date(now.getTime() + PRESENTATION_SESSION_TTL_MS)
    return session
  }

  private rememberPolicy(session: PresentationSession, policy: ResolvedPolicy, now: Date): void {
    session.policyMode = policy.mode
    session.configWarning = policy.configWarning ?? null
    session.maxAgeSeconds = policy.maxAgeSeconds
    session.resolvedPolicy = JSON.stringify(policy)
    if (policy.graceEnabled) {
      session.graceUntil = new Date(now.getTime() + policy.graceDays * 24 * 60 * 60 * 1000)
    }
  }

  private async graceStart(em: EntityManager, input: CreatePresentationSessionInput, now: Date): Promise<Date> {
    const prior = await em.find(PresentationSession, {
      owner: input.owner,
      repo: input.repo,
      githubAccountId: input.githubAccountId,
    })
    if (prior.length === 0) return now
    return prior.reduce((oldest, row) => (row.createdAt < oldest ? row.createdAt : oldest), prior[0].createdAt)
  }

  private storedPolicy(session: PresentationSession): ResolvedPolicy {
    if (!session.resolvedPolicy) return { ...DEFAULT_POLICY }
    return JSON.parse(session.resolvedPolicy) as ResolvedPolicy
  }

  private disposition(session: PresentationSession): 'skip' | 'grace' | 'verify' {
    if (session.warning === 'policy_disabled') return 'skip'
    if (session.warning === 'grace_period_active') return 'grace'
    return 'verify'
  }
}

function isResolverOutage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const haystack = message.toLowerCase()
  return (
    haystack.includes('unable to resolve') ||
    haystack.includes('resolver') ||
    haystack.includes('hedera') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    haystack.includes('fetch failed')
  )
}

function checkTitle(state: PresentationSessionState, conclusion: string): string {
  if (conclusion === 'neutral') return 'Contributor verification closed'
  if (conclusion === 'action_required') return 'Contributor verification required'
  if (state === PresentationSessionState.Success) return 'Contributor identity verified'
  if (state === PresentationSessionState.Timeout) return 'Contributor verification timed out'
  return 'Contributor verification failed'
}

function disclosedClaims(verified: { dcql?: { presentations?: unknown } }): Record<string, unknown> | undefined {
  const groups = verified.dcql?.presentations as
    Record<string, Array<{ prettyClaims?: Record<string, unknown> }>> | undefined
  if (!groups) return undefined
  const first = Object.values(groups)[0]?.[0]
  return first?.prettyClaims
}
