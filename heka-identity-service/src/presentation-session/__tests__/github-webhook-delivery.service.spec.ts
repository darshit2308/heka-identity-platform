import { UniqueConstraintViolationException } from '@mikro-orm/core'
import { describe, expect, it } from 'vitest'

import { GithubWebhookDelivery } from '../github-webhook-delivery.entity'
import { GithubWebhookDeliveryService, WEBHOOK_DELIVERY_TTL_MS } from '../github-webhook-delivery.service'

function harness(rows: GithubWebhookDelivery[]) {
  const em = {
    fork: () => em,
    findOne: (_entity: unknown, where: { id: string }) =>
      Promise.resolve(rows.find((row) => row.id === where.id) ?? null),
    remove: (row: GithubWebhookDelivery) => {
      const index = rows.indexOf(row)
      if (index >= 0) rows.splice(index, 1)
    },
    persist: (row: GithubWebhookDelivery) => {
      rows.push(row)
    },
    flush: () => Promise.resolve(),
  }
  return { em, service: new GithubWebhookDeliveryService(em as never) }
}

describe('GithubWebhookDeliveryService', () => {
  it('claims a delivery once inside the TTL and allows it again after expiry', async () => {
    const { service } = harness([])
    const now = new Date('2026-10-31T12:00:00.000Z')

    await expect(service.claim('delivery-1', now)).resolves.toBe(true)
    await expect(service.claim('delivery-1', new Date(now.getTime() + 60_000))).resolves.toBe(false)
    await expect(service.claim('delivery-1', new Date(now.getTime() + WEBHOOK_DELIVERY_TTL_MS))).resolves.toBe(true)
  })

  it('treats a unique conflict as an already claimed delivery', async () => {
    const { em, service } = harness([])
    em.flush = () => Promise.reject(new UniqueConstraintViolationException(new Error('duplicate')))

    await expect(service.claim('delivery-1', new Date('2026-10-31T12:00:00.000Z'))).resolves.toBe(false)
  })
})
