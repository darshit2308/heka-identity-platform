import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { GithubWebhookDelivery } from './github-webhook-delivery.entity'
import { isUniqueViolation } from './unique-violation'

/** How long a delivery id suppresses a GitHub redelivery. */
export const WEBHOOK_DELIVERY_TTL_MS = 10 * 60 * 1000

@Injectable()
export class GithubWebhookDeliveryService {
  public constructor(private readonly em: EntityManager) {}

  /**
   * Records this delivery id. A second claim inside the TTL returns false.
   * The row survives a process restart. A crash after a successful claim and
   * before the check run exists suppresses GitHub's retry until the row expires.
   */
  public async claim(deliveryId: string, now = new Date()): Promise<boolean> {
    const em = this.em.fork()
    const existing = await em.findOne(GithubWebhookDelivery, { id: deliveryId })
    if (existing && now.getTime() - existing.createdAt.getTime() < WEBHOOK_DELIVERY_TTL_MS) return false
    if (existing) em.remove(existing)

    const row = new GithubWebhookDelivery()
    row.id = deliveryId
    row.createdAt = now
    em.persist(row)
    try {
      await em.flush()
      return true
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error
      return false
    }
  }
}
