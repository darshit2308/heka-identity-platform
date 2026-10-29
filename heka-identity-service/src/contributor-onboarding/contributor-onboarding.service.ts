import { EntityManager } from '@mikro-orm/core'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'

import { AuthInfo } from 'common/auth'

import { ContributorAuditEvent, ContributorAuditEventType } from './contributor-audit-event.entity'
import { ContributorBinding } from './contributor-binding.entity'
import {
  ContributorOnboardingStatus,
  VerifiedContributor,
  toContributorAuditEventView,
  toContributorBindingView,
} from './contributor-onboarding.types'

interface AuditInput {
  eventType: ContributorAuditEventType
  userId: string
  tenantId: string
  githubAccountId?: string
  githubUsername?: string
  walletId?: string
  gpgFingerprint?: string
  metadata?: Record<string, unknown>
}

@Injectable()
export class ContributorOnboardingService {
  private readonly logger = new Logger(ContributorOnboardingService.name)

  public constructor(private readonly em: EntityManager) {}

  public async getStatus(authInfo: AuthInfo): Promise<ContributorOnboardingStatus> {
    const binding = await this.findBinding(authInfo.tenantId, authInfo.userId)
    if (binding) {
      this.assertWallet(binding, authInfo.walletId)
    }

    const auditEvents = await this.em.find(
      ContributorAuditEvent,
      { tenantId: authInfo.tenantId, userId: authInfo.userId },
      { orderBy: { createdAt: 'DESC' }, limit: 20 },
    )

    return {
      github: binding ? { accountId: binding.githubAccountId, username: binding.githubUsername } : undefined,
      binding: binding ? toContributorBindingView(binding) : undefined,
      verificationStatus: binding?.verifiedAt ? 'GpgVerified' : binding ? 'GitHubConnected' : 'NotConnected',
      auditEvents: auditEvents.map(toContributorAuditEventView),
    }
  }

  /**
   * Binding for the authenticated user. GitHub must already be linked.
   * A wallet mismatch is rejected so a copied user id cannot read another wallet.
   */
  public async getRequiredBindingForUser(authInfo: AuthInfo): Promise<ContributorBinding> {
    const binding = await this.findBinding(authInfo.tenantId, authInfo.userId)
    if (!binding) {
      throw new UnauthorizedException('Link a GitHub account before requesting contributor verification.')
    }
    this.assertWallet(binding, authInfo.walletId)
    return binding
  }

  /**
   * Verified binding for credential issuance.
   * The GitHub account id is read from this row, not from the request.
   */
  public async getVerifiedBindingByUser(
    tenantId: string,
    userId: string,
    walletId: string,
  ): Promise<VerifiedContributor> {
    const binding = await this.findBinding(tenantId, userId)
    if (!binding) {
      throw new NotFoundException('No contributor binding found for this user.')
    }
    this.assertWallet(binding, walletId)
    if (!binding.gpgFingerprint || !binding.verifiedAt) {
      throw new ConflictException(`Contributor @${binding.githubUsername} has not completed GPG verification.`)
    }

    return {
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
      gpgFingerprint: binding.gpgFingerprint,
      verifiedAt: binding.verifiedAt.toISOString(),
      walletId: binding.walletId,
    }
  }

  public async recordChallengeRequested(input: {
    userId: string
    tenantId: string
    githubAccountId: string
    githubUsername: string
    walletId: string
    challengeId: string
  }): Promise<void> {
    this.persistAudit({
      eventType: ContributorAuditEventType.ChallengeRequested,
      userId: input.userId,
      tenantId: input.tenantId,
      githubAccountId: input.githubAccountId,
      githubUsername: input.githubUsername,
      walletId: input.walletId,
      metadata: { challengeId: input.challengeId },
    })
    await this.em.flush()
  }

  public async recordProofAccepted(input: {
    userId: string
    tenantId: string
    githubAccountId: string
    githubUsername: string
    walletId: string
    gpgFingerprint: string
    verifiedAt: Date
  }): Promise<ContributorBinding | undefined> {
    this.persistAudit({
      eventType: ContributorAuditEventType.ProofAccepted,
      userId: input.userId,
      tenantId: input.tenantId,
      githubAccountId: input.githubAccountId,
      githubUsername: input.githubUsername,
      walletId: input.walletId,
      gpgFingerprint: input.gpgFingerprint,
      metadata: { verifiedAt: input.verifiedAt.toISOString() },
    })

    const binding = await this.findBinding(input.tenantId, input.userId)
    if (!binding || binding.walletId !== input.walletId || binding.githubAccountId !== input.githubAccountId) {
      await this.em.flush()
      return undefined
    }

    binding.gpgFingerprint = input.gpgFingerprint
    binding.verifiedAt = input.verifiedAt
    this.persistAudit({
      eventType: ContributorAuditEventType.BindingUpdated,
      userId: input.userId,
      tenantId: input.tenantId,
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
      walletId: binding.walletId,
      gpgFingerprint: input.gpgFingerprint,
      metadata: { source: 'gpg-proof' },
    })
    await this.em.flush()
    this.logger.log(`GPG verification stored for user ${input.userId}`)
    return binding
  }

  public async recordProofRejected(input: {
    userId: string
    tenantId: string
    githubAccountId: string
    githubUsername: string
    walletId: string
    challengeId: string
    reason: string
  }): Promise<void> {
    this.persistAudit({
      eventType: ContributorAuditEventType.ProofRejected,
      userId: input.userId,
      tenantId: input.tenantId,
      githubAccountId: input.githubAccountId,
      githubUsername: input.githubUsername,
      walletId: input.walletId,
      metadata: { challengeId: input.challengeId, reason: input.reason },
    })
    await this.em.flush()
  }

  private async findBinding(tenantId: string, userId: string): Promise<ContributorBinding | null> {
    return this.em.findOne(ContributorBinding, { tenantId, userId })
  }

  private assertWallet(binding: ContributorBinding, walletId: string): void {
    if (binding.walletId !== walletId) {
      throw new ForbiddenException('Contributor binding does not belong to this wallet.')
    }
  }

  private persistAudit(input: AuditInput): void {
    const event = new ContributorAuditEvent()
    event.eventType = input.eventType
    event.userId = input.userId
    event.tenantId = input.tenantId
    event.githubAccountId = input.githubAccountId
    event.githubUsername = input.githubUsername
    event.walletId = input.walletId
    event.gpgFingerprint = input.gpgFingerprint
    event.metadata = input.metadata
    this.em.persist(event)
  }
}
