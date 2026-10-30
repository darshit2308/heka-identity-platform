import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GithubCheckNotifier } from '../github-check-notifier'
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

function memory(rows: PresentationSession[]) {
  const api = {
    fork: () => api,
    findOne: (_entity: unknown, where: Record<string, unknown>, options?: { orderBy?: { completedAt?: 'DESC' } }) => {
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

describe('PresentationSessionService', () => {
  const checks = { update: vi.fn().mockResolvedValue(true) }

  beforeEach(() => {
    checks.update.mockClear()
  })

  function build(rows: PresentationSession[]) {
    return new PresentationSessionService(
      memory(rows) as never,
      {} as never,
      { contributorIssuerDemoUser: 'demo' } as never,
      { pageBaseUrl: 'http://localhost:8000' } as never,
      {} as never,
      {} as never,
      checks as never,
      { mode: () => 'warn' } as never,
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
})
