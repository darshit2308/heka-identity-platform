import { HttpException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { consume } from '../fixed-window-rate-limit'

describe('consume', () => {
  it('allows the limit, rejects the next call, and opens a new window', () => {
    const key = `spec-${Date.now()}`
    const start = 1_700_000_000_000
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(() => consume(key, 10, 60_000, start)).not.toThrow()
    }
    expect(() => consume(key, 10, 60_000, start)).toThrow(HttpException)
    try {
      consume(key, 10, 60_000, start)
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException)
      expect((error as HttpException).getStatus()).toBe(429)
      expect((error as HttpException).message).toBe('Too many requests. Retry shortly.')
    }
    expect(() => consume(key, 10, 60_000, start + 60_000)).not.toThrow()
  })
})
