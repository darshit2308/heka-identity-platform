import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { GithubWebhookDelivery, type WebhookJobStatus } from './github-webhook-delivery.entity'
import { isUniqueViolation } from './unique-violation'

/** How long one App process may hold a delivery before another resume may take it. */
export const WEBHOOK_JOB_LEASE_MS = 2 * 60 * 1000

export interface WebhookJobEvent {
  action: string
  owner: string
  repo: string
  prNumber: number
  headSha: string
  githubAccountId: string
  githubUsername: string
  installationId: string
  draft: boolean
  fork: boolean
  defaultBranch?: string
}

export interface WebhookJobDecision {
  disposition: 'run' | 'skip'
  status: WebhookJobStatus
  checkRunId?: string
}

export interface AbandonedWebhookJob {
  deliveryId: string
  event: WebhookJobEvent
  checkRunId?: string
}

@Injectable()
export class GithubWebhookDeliveryService {
  public constructor(private readonly em: EntityManager) {}

  /**
   * Inserts the delivery as `processing` or takes over an abandoned one.
   * `skip` means a live lease or a finished job already owns this id.
   * The row is not `completed` until `update` says so.
   */
  public async accept(deliveryId: string, event: WebhookJobEvent, now = new Date()): Promise<WebhookJobDecision> {
    const em = this.em.fork()
    const existing = await em.findOne(GithubWebhookDelivery, { id: deliveryId })
    if (!existing) {
      const row = this.processingRow(deliveryId, event, now)
      em.persist(row)
      try {
        await em.flush()
        return { disposition: 'run', status: 'processing' }
      } catch (error: unknown) {
        if (!isUniqueViolation(error)) throw error
      }
    }
    return this.takeover(deliveryId, event, now)
  }

  public async update(
    deliveryId: string,
    change: { checkRunId?: string; status?: 'completed' | 'failed' },
    now = new Date(),
  ): Promise<void> {
    const data: { checkRunId?: string; status?: 'completed' | 'failed'; updatedAt: Date; leaseUntil?: null } = {
      updatedAt: now,
    }
    if (change.checkRunId) data.checkRunId = change.checkRunId
    if (change.status) {
      data.status = change.status
      data.leaseUntil = null
    }
    await this.em.fork().nativeUpdate(GithubWebhookDelivery, { id: deliveryId }, data)
  }

  /** Leases `pending` jobs and `processing` jobs whose lease has expired. */
  public async leaseAbandoned(now = new Date()): Promise<AbandonedWebhookJob[]> {
    const em = this.em.fork()
    const candidates = await em.find(GithubWebhookDelivery, {
      $or: [{ status: 'pending' }, { status: 'processing', leaseUntil: { $lt: now } }],
    })
    const leased: AbandonedWebhookJob[] = []
    for (const row of candidates) {
      const taken = await em.nativeUpdate(
        GithubWebhookDelivery,
        {
          id: row.id,
          $or: [{ status: 'pending' }, { status: 'processing', leaseUntil: { $lt: now } }],
        },
        { status: 'processing', leaseUntil: new Date(now.getTime() + WEBHOOK_JOB_LEASE_MS), updatedAt: now },
      )
      if (taken !== 1) continue
      leased.push({
        deliveryId: row.id,
        event: JSON.parse(row.eventJson) as WebhookJobEvent,
        checkRunId: row.checkRunId ?? undefined,
      })
    }
    return leased
  }

  private async takeover(deliveryId: string, event: WebhookJobEvent, now: Date): Promise<WebhookJobDecision> {
    const em = this.em.fork()
    const taken = await em.nativeUpdate(
      GithubWebhookDelivery,
      {
        id: deliveryId,
        $or: [
          { status: 'pending' },
          { status: 'processing', leaseUntil: { $lt: now } },
          { status: 'processing', leaseUntil: null },
        ],
      },
      {
        status: 'processing',
        eventJson: JSON.stringify(event),
        leaseUntil: new Date(now.getTime() + WEBHOOK_JOB_LEASE_MS),
        updatedAt: now,
      },
    )
    const row = await em.findOne(GithubWebhookDelivery, { id: deliveryId })
    if (taken !== 1 || !row) {
      return { disposition: 'skip', status: row?.status ?? 'processing', checkRunId: row?.checkRunId ?? undefined }
    }
    return { disposition: 'run', status: 'processing', checkRunId: row.checkRunId ?? undefined }
  }

  private processingRow(deliveryId: string, event: WebhookJobEvent, now: Date): GithubWebhookDelivery {
    const row = new GithubWebhookDelivery()
    row.id = deliveryId
    row.eventJson = JSON.stringify(event)
    row.status = 'processing'
    row.leaseUntil = new Date(now.getTime() + WEBHOOK_JOB_LEASE_MS)
    row.createdAt = now
    row.updatedAt = now
    return row
  }
}
