import { SdJwtVcRecord, type AgentContext } from '@credo-ts/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WebCryptoKeyManagementService } from '../../credo/WebCryptoKeyManagementService'

const requestToken = vi.fn()
const requestCredentials = vi.fn()
const store = vi.fn()
const deleteById = vi.fn()
const deleted: string[] = []
const dbName = 'heka-wallet-kms-cleanup'
const context = {} as AgentContext
let kms: WebCryptoKeyManagementService

vi.mock('../../credo/lazy-agent', () => ({
  getOrCreateAgent: async () => ({
    kms: {
      createKey: (options: Parameters<WebCryptoKeyManagementService['createKey']>[1]) => kms.createKey(context, options),
      deleteKey: async (options: { keyId: string }) => {
        deleted.push(options.keyId)
        return kms.deleteKey(context, options)
      },
    },
    openid4vc: { holder: { requestToken, requestCredentials } },
    sdJwtVc: { store, deleteById },
  }),
}))

import { acceptCredentialOffer } from '../receive'

describe('acceptCredentialOffer', () => {
  beforeEach(() => {
    kms = new WebCryptoKeyManagementService(dbName)
    deleted.length = 0
    requestToken.mockReset()
    requestCredentials.mockReset()
    store.mockReset()
    deleteById.mockReset()
    deleteById.mockResolvedValue(undefined)
    vi.stubGlobal('chrome', { storage: { local: { set: vi.fn().mockResolvedValue(undefined) } } })
  })

  it('deletes the holder key when the credential request fails', async () => {
    requestToken.mockResolvedValue({ accessToken: 'token', cNonce: 'nonce' })
    requestCredentials.mockImplementation(
      async (options: { credentialBindingResolver: (binding: unknown) => Promise<unknown> }) => {
        await options.credentialBindingResolver({ supportsJwk: true, proofTypes: {} })
        throw new Error('issuer down')
      },
    )

    await expect(acceptCredentialOffer({} as never)).rejects.toThrow(/issuer down/)
    expect(deleted).toHaveLength(1)
    expect(await kms.getPublicKey(context, deleted[0])).toBeNull()
    expect(store).not.toHaveBeenCalled()
    expect(deleteById).not.toHaveBeenCalled()
  })

  it('deletes stored records and every holder key when a later credential fails', async () => {
    const first = Object.assign(Object.create(SdJwtVcRecord.prototype) as SdJwtVcRecord, { id: 'rec-1' })
    const second = Object.assign(Object.create(SdJwtVcRecord.prototype) as SdJwtVcRecord, { id: 'rec-2' })
    requestToken.mockResolvedValue({ accessToken: 'token', cNonce: 'nonce' })
    requestCredentials.mockImplementation(
      async (options: { credentialBindingResolver: (binding: unknown) => Promise<unknown> }) => {
        await options.credentialBindingResolver({ supportsJwk: true, proofTypes: {} })
        await options.credentialBindingResolver({ supportsJwk: true, proofTypes: {} })
        return { credentials: [{ record: first }, { record: second }] }
      },
    )
    store.mockImplementation(async ({ record }: { record: { id: string } }) => {
      if (record.id === 'rec-2') throw new Error('store failed')
    })

    await expect(acceptCredentialOffer({} as never)).rejects.toThrow(/store failed/)
    expect(deleteById).toHaveBeenCalledTimes(1)
    expect(deleteById).toHaveBeenCalledWith('rec-1')
    expect(deleted).toHaveLength(2)
    expect(await kms.getPublicKey(context, deleted[0])).toBeNull()
    expect(await kms.getPublicKey(context, deleted[1])).toBeNull()
  })
})
