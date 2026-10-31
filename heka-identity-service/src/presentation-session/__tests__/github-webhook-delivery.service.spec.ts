import { UniqueConstraintViolationException } from '@mikro-orm/core'
import { describe, expect, it } from 'vitest'

import { GithubWebhookDelivery } from '../github-webhook-delivery.entity'
import {
  GithubWebhookDeliveryService,
  WEBHOOK_JOB_LEASE_MS,
  type WebhookJobEvent,
} from '../github-webhook-delivery.service'

const event: WebhookJobEvent = {
  action: 'opened',
  owner: 'test-org',
  repo: 'test-repo',
  prNumber: 42,
  headSha: 'abc',
  githubAccountId: '12345',
  githubUsername: 'test-contributor',
  installationId: '2',
  draft: false,
  fork: false,
  defaultBranch: 'main',
}

function abandoned(row: GithubWebhookDelivery, now: Date): boolean {
  if (row.status === 'pending') return true
  return row.status === 'processing' && (row.leaseUntil == null || row.leaseUntil < now)
}

function harness(rows: GithubWebhookDelivery[]) {
  const em = {
    fork: () => em,
    findOne: (_entity: unknown, where: { id: string }) =>
      Promise.resolve(rows.find((row) => row.id === where.id) ?? null),
    find: (_entity: unknown, where: { $or?: Array<{ status: string; leaseUntil?: { $lt: Date } }> }) => {
      const now = where.$or?.find((clause) => clause.leaseUntil)?.leaseUntil?.$lt
      return Promise.resolve(rows.filter((row) => (now ? abandoned(row, now) : row.status === 'pending')))
    },
    persist: (row: GithubWebhookDelivery) => {
      rows.push(row)
    },
    nativeUpdate: (_entity: unknown, where: { id: string; $or?: unknown }, data: Partial<GithubWebhookDelivery>) => {
      const row = rows.find((candidate) => candidate.id === where.id)
      if (!row) return Promise.resolve(0)
      if (
        where.$or &&
        !abandoned(row, (where.$or as Array<{ leaseUntil?: { $lt: Date } }>)[1]?.leaseUntil?.$lt ?? new Date(0))
      ) {
        if (row.status !== 'pending') return Promise.resolve(0)
      }
      Object.assign(row, data)
      return Promise.resolve(1)
    },
    flush: () => Promise.resolve(),
  }
  return { em, service: new GithubWebhookDeliveryService(em as never) }
}

describe('GithubWebhookDeliveryService', () => {
  it('leases a delivery once and resumes it only after the lease expires', async () => {
    const { service } = harness([])
    const now = new Date('2026-10-31T12:00:00.000Z')

    await expect(service.accept('delivery-1', event, now)).resolves.toMatchObject({ disposition: 'run' })
    await expect(service.accept('delivery-1', event, new Date(now.getTime() + 1_000))).resolves.toMatchObject({
      disposition: 'skip',
    })
    await expect(service.leaseAbandoned(new Date(now.getTime() + 1_000))).resolves.toEqual([])

    const resumed = await service.leaseAbandoned(new Date(now.getTime() + WEBHOOK_JOB_LEASE_MS + 1))
    expect(resumed.map((job) => job.deliveryId)).toEqual(['delivery-1'])
    await expect(service.leaseAbandoned(new Date(now.getTime() + WEBHOOK_JOB_LEASE_MS + 1))).resolves.toEqual([])
  })

  it('does not resume a job that was completed after the check was stored', async () => {
    const { service } = harness([])
    const now = new Date('2026-10-31T12:00:00.000Z')
    await service.accept('delivery-1', event, now)
    await service.update('delivery-1', { checkRunId: '42' }, now)
    await service.update('delivery-1', { status: 'completed' }, now)

    await expect(service.leaseAbandoned(new Date(now.getTime() + WEBHOOK_JOB_LEASE_MS + 1))).resolves.toEqual([])
    await expect(
      service.accept('delivery-1', event, new Date(now.getTime() + WEBHOOK_JOB_LEASE_MS + 1)),
    ).resolves.toMatchObject({
      disposition: 'skip',
      status: 'completed',
    })
  })

  it('treats a unique conflict while the other lease is live as skip', async () => {
    const rows: GithubWebhookDelivery[] = []
    const { em, service } = harness(rows)
    em.flush = () => Promise.reject(new UniqueConstraintViolationException(new Error('duplicate')))

    await expect(service.accept('delivery-1', event, new Date('2026-10-31T12:00:00.000Z'))).resolves.toMatchObject({
      disposition: 'skip',
    })
  })
})
