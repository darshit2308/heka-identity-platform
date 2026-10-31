import { ExecutionContext, Logger } from '@nestjs/common'
import { of } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CorrelationIdInterceptor } from '../correlation-id.interceptor'

function contextFor(
  header: string | undefined,
  statusCode = 201,
): {
  context: ExecutionContext
  setHeader: ReturnType<typeof vi.fn>
} {
  const setHeader = vi.fn()
  const request = { header: (name: string) => (name === 'x-request-id' ? header : undefined) }
  const response = { setHeader, statusCode }
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext
  return { context, setHeader }
}

describe('CorrelationIdInterceptor', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })

  it('replaces an invalid x-request-id and echoes a valid one', async () => {
    const interceptor = new CorrelationIdInterceptor()
    const invalid = contextFor('not a valid id')
    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(invalid.context, { handle: () => of('ok') }).subscribe({ complete: resolve, error: reject })
    })
    const replacement = invalid.setHeader.mock.calls[0]?.[1] as string
    expect(invalid.setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String))
    expect(replacement).not.toBe('not a valid id')
    expect(replacement).toMatch(/^[0-9a-f-]{36}$/)

    const valid = contextFor('req_123')
    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(valid.context, { handle: () => of('ok') }).subscribe({ complete: resolve, error: reject })
    })
    expect(valid.setHeader).toHaveBeenCalledWith('x-request-id', 'req_123')
  })
})
