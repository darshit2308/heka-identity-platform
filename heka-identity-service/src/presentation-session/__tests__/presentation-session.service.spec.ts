import { generateKeyPairSync } from 'crypto'

import { OpenId4VcVerificationSessionState } from '@credo-ts/openid4vc'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CONTRIBUTOR_CREDENTIAL_VCT } from 'contributor-credential/contributor-credential.constants'

import { GithubCheckNotifier } from '../github-check-notifier'
import { PolicyConfigProvider } from '../policy-config.provider'
import { PresentationSession, PresentationSessionState } from '../presentation-session.entity'
import { PresentationSessionService } from '../presentation-session.service'

function session(partial: Partial<PresentationSession>): PresentationSession {
  return Object.assign(new PresentationSession(), partial)
}

function matches(row: PresentationSession, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    const current = row[key as keyof PresentationSession]
    if (value && typeof value === 'object' && '$in' in value) {
      return (value.$in as unknown[]).includes(current)
    }
    if (value && typeof value === 'object' && '$lt' in value) {
      return current instanceof Date && current < (value.$lt as Date)
    }
    return current === value
  })
}

function memory(rows: PresentationSession[], tenantId?: string) {
  const api = {
    fork: () => api,
    findOne: (
      entity: { name?: string },
      where: Record<string, unknown>,
      options?: { orderBy?: { completedAt?: 'DESC' } },
    ) => {
      if (entity?.name === 'Wallet') return Promise.resolve(tenantId ? { tenantId } : null)
      const found = rows.filter((row) => matches(row, where))
      if (options?.orderBy?.completedAt === 'DESC') {
        found.sort((left, right) => (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0))
      }
      return Promise.resolve(found[0] ?? null)
    },
    find: (_entity: unknown, where: Record<string, unknown>) =>
      Promise.resolve(rows.filter((row) => matches(row, where))),
    persist: (row: PresentationSession) => {
      rows.push(row)
    },
    flush: () => Promise.resolve(),
  }
  return api
}

const input = {
  githubAccountId: '12345',
  githubUsername: 'test-contributor',
  installationId: '2',
  owner: 'test-org',
  repo: 'test-repo',
  prNumber: 7,
  headSha: 'abc',
}

function policyYaml(options: { mode?: string; grace?: boolean }): string {
  return `
version: 1
contributor_identity:
  mode: ${options.mode ?? 'warn'}
  trusted_issuers: []
  required_credentials:
    - GithubContributorCredential
  accepted_issuer_did_methods:
    - did:hedera
  presentation:
    format: dc+sd-jwt
    max_age_seconds: 900
  grace_period:
    enabled: ${options.grace ? 'true' : 'false'}
    days: 14
`
}

function openSession(id: string, policyMode: string): PresentationSession {
  return session({
    id,
    ...input,
    state: PresentationSessionState.InProgress,
    expiresAt: new Date('2026-10-30T12:30:00.000Z'),
    verificationSessionId: 'credo-1',
    checkRunId: '42',
    policyMode,
  })
}

function failingAgent(message: string) {
  return {
    modules: {
      tenants: {
        withTenantAgent: () => Promise.reject(new Error(message)),
      },
    },
  }
}

function issuingSessions() {
  return {
    tenantId: 'tenant-1',
    agent: {
      modules: {
        tenants: {
          withTenantAgent: async (_query: unknown, callback: (tenantAgent: unknown) => Promise<void>) => {
            await callback({
              dids: { getCreatedDids: () => Promise.resolve([{ did: 'did:hedera:testnet:issuer' }]) },
            })
          },
        },
      },
    },
    verificationSessions: {
      createRequest: vi.fn().mockResolvedValue({
        authorizationRequest: 'openid4vp://request',
        verificationSession: { id: 'credo-session' },
      }),
    },
    verifiers: { find: vi.fn().mockResolvedValue([{}]), createVerifier: vi.fn() },
  }
}

describe('PresentationSessionService', () => {
  const checks = { update: vi.fn().mockResolvedValue(true) }

  beforeEach(() => {
    checks.update.mockClear()
  })

  function build(
    rows: PresentationSession[],
    extras?: {
      tenantId?: string
      agent?: unknown
      verificationSessions?: unknown
      verifiers?: unknown
      binding?: unknown
    },
  ) {
    return new PresentationSessionService(
      memory(rows, extras?.tenantId) as never,
      (extras?.agent ?? {}) as never,
      { contributorIssuerDemoUser: 'demo' } as never,
      { pageBaseUrl: 'http://localhost:8000' } as never,
      (extras?.verificationSessions ?? {}) as never,
      (extras?.verifiers ?? {}) as never,
      checks as never,
      new PolicyConfigProvider(),
      { findVerifiedBindingByGithubAccountId: () => Promise.resolve(extras?.binding) } as never,
    )
  }

  it('reuses an open session for the same pull request and commit', async () => {
    const open = session({
      ...input,
      state: PresentationSessionState.Pending,
      expiresAt: new Date('2026-10-30T12:10:00.000Z'),
      authorizationRequestUri: 'openid4vp://request',
    })
    const rows = [open]
    const view = await build(rows).create(input, new Date('2026-10-30T12:01:00.000Z'))

    expect(view.sessionId).toBe(open.id)
    expect(rows).toHaveLength(1)
  })

  it('closes a new pull request when the same account presented within 15 minutes', async () => {
    const recent = session({
      ...input,
      prNumber: 1,
      state: PresentationSessionState.Success,
      completedAt: new Date('2026-10-30T12:00:00.000Z'),
      expiresAt: new Date('2026-10-30T12:15:00.000Z'),
    })
    const rows = [recent]
    const view = await build(rows).create(
      { ...input, prNumber: 8, headSha: 'def' },
      new Date('2026-10-30T12:10:00.000Z'),
    )

    expect(view.alreadySatisfied).toBe(true)
    expect(view.state).toBe(PresentationSessionState.Success)
    expect(rows[1]?.satisfiedBySessionId).toBe(recent.id)
  })

  it('times out overdue sessions and updates the GitHub check', async () => {
    const open = session({
      ...input,
      state: PresentationSessionState.InProgress,
      checkRunId: '42',
      expiresAt: new Date('2026-10-30T12:00:00.000Z'),
    })
    await build([open]).sweep(new Date('2026-10-30T12:16:00.000Z'))

    expect(open.state).toBe(PresentationSessionState.Timeout)
    expect(open.failureReason).toBe('session_expired')
    expect(checks.update).toHaveBeenCalledWith(expect.objectContaining({ checkRunId: '42', conclusion: 'failure' }))
  })

  it('records a verified presentation during the sweep when the page is closed', async () => {
    const issuer = 'did:hedera:testnet:issuer'
    const open = session({
      ...input,
      state: PresentationSessionState.InProgress,
      checkRunId: '42',
      verificationSessionId: 'credo-session',
      trustedIssuerDid: issuer,
      expiresAt: new Date('2026-10-30T12:20:00.000Z'),
    })
    const verificationSessions = {
      getVerificationSession: vi.fn().mockResolvedValue({ state: OpenId4VcVerificationSessionState.ResponseVerified }),
    }
    const agent = {
      modules: {
        tenants: {
          withTenantAgent: async (_query: unknown, callback: (tenantAgent: unknown) => Promise<void>) => {
            await callback({
              openid4vc: {
                verifier: {
                  getVerifiedAuthorizationResponse: () =>
                    Promise.resolve({
                      dcql: {
                        presentations: {
                          credential: [
                            {
                              prettyClaims: {
                                vct: CONTRIBUTOR_CREDENTIAL_VCT,
                                iss: issuer,
                                githubAccountId: input.githubAccountId,
                                exp: 4_000_000_000,
                              },
                            },
                          ],
                        },
                      },
                    }),
                },
              },
            })
          },
        },
      },
    }
    const service = new PresentationSessionService(
      memory([open], 'tenant-1') as never,
      agent as never,
      { contributorIssuerDemoUser: 'demo' } as never,
      { pageBaseUrl: 'http://localhost:8000' } as never,
      verificationSessions as never,
      {} as never,
      checks as never,
      { mode: () => 'warn' } as never,
      {} as never,
    )

    await service.sweep(new Date('2026-10-30T12:05:00.000Z'))

    expect(open.state).toBe(PresentationSessionState.Success)
    expect(open.failureReason).toBeNull()
    expect(checks.update).toHaveBeenCalledWith(expect.objectContaining({ checkRunId: '42', conclusion: 'success' }))
  })

  it('treats a missing policy document as warn and still opens a wallet request', async () => {
    const sessions = issuingSessions()
    const view = await build([], sessions).create(input, new Date('2026-10-30T12:00:00.000Z'))
    expect(view.disposition).toBe('verify')
    expect(view.configWarning).toBeUndefined()
    expect(sessions.verificationSessions.createRequest).toHaveBeenCalled()
  })

  it('keeps warn mode when the policy document is invalid', async () => {
    const sessions = issuingSessions()
    const view = await build([], sessions).create(
      { ...input, policyYaml: 'version: nope' },
      new Date('2026-10-30T12:00:00.000Z'),
    )
    expect(view.disposition).toBe('verify')
    expect(view.configWarning).toBe('repository_config_invalid')
  })

  it('does not open a wallet request when verification is disabled', async () => {
    const sessions = issuingSessions()
    const view = await build([], sessions).create(
      { ...input, policyYaml: policyYaml({ mode: 'disabled' }) },
      new Date('2026-10-30T12:00:00.000Z'),
    )
    expect(view.disposition).toBe('skip')
    expect(view.state).toBe(PresentationSessionState.Success)
    expect(sessions.verificationSessions.createRequest).not.toHaveBeenCalled()
  })

  it('covers the first pull request inside the grace window without a wallet request', async () => {
    const sessions = issuingSessions()
    const view = await build([], sessions).create(
      { ...input, policyYaml: policyYaml({ grace: true }) },
      new Date('2026-10-30T12:00:00.000Z'),
    )
    expect(view.disposition).toBe('grace')
    expect(sessions.verificationSessions.createRequest).not.toHaveBeenCalled()
  })

  it('asks for a presentation after the grace window', async () => {
    const sessions = issuingSessions()
    const earlier = session({
      ...input,
      prNumber: 1,
      headSha: 'old',
      createdAt: new Date('2026-10-01T12:00:00.000Z'),
      state: PresentationSessionState.Success,
      expiresAt: new Date('2026-10-01T12:15:00.000Z'),
    })
    const view = await build([earlier], sessions).create(
      { ...input, policyYaml: policyYaml({ grace: true }) },
      new Date('2026-10-30T12:00:00.000Z'),
    )
    expect(view.disposition).toBe('verify')
    expect(sessions.verificationSessions.createRequest).toHaveBeenCalled()
  })

  it('does not apply grace when the GitHub account is already verified', async () => {
    const sessions = issuingSessions()
    const view = await build([], { ...sessions, binding: { gpgFingerprint: 'aa', verifiedAt: new Date() } }).create(
      { ...input, policyYaml: policyYaml({ grace: true }) },
      new Date('2026-10-30T12:00:00.000Z'),
    )
    expect(view.disposition).toBe('verify')
    expect(sessions.verificationSessions.createRequest).toHaveBeenCalled()
  })

  it('fails closed when enforce mode cannot resolve the issuer', async () => {
    const open = openSession('sess-enforce', 'enforce')
    await build([open], { tenantId: 'tenant-1', agent: failingAgent('Unable to resolve did:hedera') }).getForPage(
      'sess-enforce',
      new Date('2026-10-30T12:05:00.000Z'),
    )
    expect(open.state).toBe(PresentationSessionState.Failure)
    expect(open.failureReason).toBe('resolver_unavailable')
    expect(checks.update).toHaveBeenCalledWith(expect.objectContaining({ conclusion: 'failure', checkRunId: '42' }))
  })

  it('leaves a warn-mode session open when resolution fails', async () => {
    const open = openSession('sess-warn', 'warn')
    const view = await build([open], {
      tenantId: 'tenant-1',
      agent: failingAgent('Unable to resolve did:hedera'),
    }).getForPage('sess-warn', new Date('2026-10-30T12:05:00.000Z'))
    expect(view.state).toBe(PresentationSessionState.InProgress)
    expect(checks.update).not.toHaveBeenCalled()
  })

  it('leaves an enforce-mode session open when the error is not a resolver outage', async () => {
    const open = openSession('sess-other', 'enforce')
    const view = await build([open], { tenantId: 'tenant-1', agent: failingAgent('query failed') }).getForPage(
      'sess-other',
      new Date('2026-10-30T12:05:00.000Z'),
    )
    expect(view.state).toBe(PresentationSessionState.InProgress)
  })

  it('closes every open session for a pull request', async () => {
    const pending = openSession('open-1', 'enforce')
    const finished = session({
      id: 'done-1',
      ...input,
      state: PresentationSessionState.Success,
      expiresAt: new Date('2026-10-30T12:30:00.000Z'),
    })
    const result = await build([pending, finished]).closePullRequest({
      owner: input.owner,
      repo: input.repo,
      prNumber: input.prNumber,
    })
    expect(result.closed).toBe(1)
    expect(pending.state).toBe(PresentationSessionState.Failure)
    expect(pending.failureReason).toBe('pull_request_closed')
    expect(pending.humanReason).toBe('The pull request was closed before verification finished.')
    expect(finished.state).toBe(PresentationSessionState.Success)
    expect(checks.update).toHaveBeenCalledWith(expect.objectContaining({ conclusion: 'failure', checkRunId: '42' }))
  })

  it('posts a neutral check when a warn-mode pull request is closed', async () => {
    const pending = openSession('open-warn', 'warn')
    await build([pending]).closePullRequest({ owner: input.owner, repo: input.repo, prNumber: input.prNumber })
    expect(checks.update).toHaveBeenCalledWith(expect.objectContaining({ conclusion: 'neutral', checkRunId: '42' }))
  })
})

describe('GithubCheckNotifier', () => {
  it('leaves the check unchanged when the GitHub App credentials are unset', async () => {
    const notifier = new GithubCheckNotifier({ githubAppId: undefined, githubAppPrivateKey: undefined } as never)
    const http = vi.fn()

    await expect(
      notifier.update(
        {
          installationId: '2',
          owner: 'test-org',
          repo: 'test-repo',
          checkRunId: '42',
          conclusion: 'failure',
          title: 'Timed out',
          summary: 'The session expired.',
        },
        http as never,
      ),
    ).resolves.toBe(false)
    expect(http).not.toHaveBeenCalled()
  })

  it('retries a timed-out check update once', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const notifier = new GithubCheckNotifier({ githubAppId: '1', githubAppPrivateKey: pem } as never)
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    const http = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'installation-token' }) })
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce({ ok: true })

    await expect(
      notifier.update(
        {
          installationId: '2',
          owner: 'test-org',
          repo: 'test-repo',
          checkRunId: '42',
          conclusion: 'neutral',
          title: 'Closed',
          summary: 'The pull request was closed.',
        },
        http as never,
      ),
    ).resolves.toBe(true)
    expect(http).toHaveBeenCalledTimes(3)
    const patchInit = http.mock.calls[1]?.[1] as { signal?: AbortSignal }
    expect(patchInit.signal).toBeInstanceOf(AbortSignal)
    expect(http.mock.calls[2][0]).toContain('/check-runs/42')
  })

  it('does not retry a client error from GitHub', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const notifier = new GithubCheckNotifier({ githubAppId: '1', githubAppPrivateKey: pem } as never)
    const http = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'installation-token' }) })
      .mockResolvedValueOnce({ ok: false, status: 422 })

    await expect(
      notifier.update(
        {
          installationId: '2',
          owner: 'test-org',
          repo: 'test-repo',
          checkRunId: '42',
          conclusion: 'failure',
          title: 'Failed',
          summary: 'No.',
        },
        http as never,
      ),
    ).resolves.toBe(false)
    expect(http).toHaveBeenCalledTimes(2)
  })
})
