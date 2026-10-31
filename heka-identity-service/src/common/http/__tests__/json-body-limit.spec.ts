import type { AddressInfo } from 'net'

import { createServer, request as httpRequest } from 'http'

import express, { json } from 'express'
import { describe, expect, it } from 'vitest'

describe('JSON body limit', () => {
  it('returns 413 when the JSON body is over 256kb', async () => {
    const app = express()
    app.use(json({ limit: '256kb' }))
    app.post('/', (_req, res) => {
      res.end('ok')
    })
    const server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const body = JSON.stringify({ data: 'x'.repeat(300 * 1024) })

    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
          },
        },
        (res) => resolve(res.statusCode ?? 0),
      )
      req.on('error', reject)
      req.end(body)
    })

    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    expect(status).toBe(413)
  })
})
