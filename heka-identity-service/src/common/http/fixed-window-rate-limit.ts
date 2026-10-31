import { HttpException, HttpStatus } from '@nestjs/common'

const buckets = new Map<string, { count: number; resetAt: number }>()

/**
 * Counts requests in a fixed window stored in this process.
 * Another instance has its own counters. There is no shared store.
 */
export function consume(key: string, limit: number, windowMs: number, now = Date.now()): void {
  if (buckets.size > 1_000) {
    for (const [bucketKey, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(bucketKey)
    }
  }

  const entry = buckets.get(key)
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }

  entry.count += 1
  if (entry.count > limit) {
    throw new HttpException('Too many requests. Retry shortly.', HttpStatus.TOO_MANY_REQUESTS)
  }
}
