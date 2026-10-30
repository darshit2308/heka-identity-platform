import { Kms, type Agent, type AgentContext } from '@credo-ts/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WebCryptoKeyManagementService } from '../../credo/WebCryptoKeyManagementService'
import { JWK_THUMBPRINT_MAP_KEY } from '../../wallet/storage-keys'
import { createJwkHolderBinding } from '../receive'

const context = {} as AgentContext

describe('createJwkHolderBinding', () => {
  const store = new Map<string, unknown>()

  beforeEach(async () => {
    store.clear()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: store.get(key) }),
          set: async (values: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(values)) store.set(key, value)
          },
        },
      },
    })
  })

  it('binds the credential request to a non-extractable P-256 public JWK', async () => {
    const kms = new WebCryptoKeyManagementService(`heka-wallet-kms-${crypto.randomUUID()}`)
    const agent = {
      kms: {
        createKey: (options: Parameters<WebCryptoKeyManagementService['createKey']>[1]) => kms.createKey(context, options),
      },
    } as unknown as Agent

    const binding = await createJwkHolderBinding(agent)

    expect(binding.method).toBe('jwk')
    expect(binding.keys).toHaveLength(1)
    expect(binding.keys[0]).toBeInstanceOf(Kms.PublicJwk)
    expect(binding.keys[0].kty).toBe('EC')
    const map = store.get(JWK_THUMBPRINT_MAP_KEY) as Record<string, string>
    expect(Object.keys(map)).toHaveLength(1)
    expect(Object.values(map)[0]).toEqual(expect.any(String))
  })
})
