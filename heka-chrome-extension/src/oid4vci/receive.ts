import { Kms, SdJwtVcRecord, type Agent } from '@credo-ts/core'
import type { OpenId4VcHolderApi, OpenId4VciCredentialBindingOptions } from '@credo-ts/openid4vc'

import { getOrCreateAgent } from '../credo/lazy-agent'
import { syncCredentialSummaryCache } from '../wallet/summary-cache'
import { RECEIVE_STATUS_KEY } from '../wallet/storage-keys'

export type ResolvedCredentialOffer = Awaited<ReturnType<OpenId4VcHolderApi['resolveCredentialOffer']>>

/**
 * Creates a non-extractable P-256 key and returns the JWK binding Credo
 * sends as the OID4VCI proof of possession. The stored SdJwtVcRecord keeps
 * the KMS key id, so the wallet page does not keep a separate thumbprint map.
 */
export async function createJwkHolderBinding(
  agent: Agent,
): Promise<{ method: 'jwk'; keyId: string; keys: Kms.PublicJwk[] }> {
  const createdKey = await agent.kms.createKey({
    backend: 'webcrypto-browser',
    type: { kty: 'EC', crv: 'P-256' },
  })
  return { method: 'jwk', keyId: createdKey.keyId, keys: [Kms.PublicJwk.fromPublicJwk(createdKey.publicJwk)] }
}

async function reportReceive(message: string): Promise<void> {
  await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: { state: 'working', message } })
}

export async function resolveIncomingOffer(offerUri: string): Promise<ResolvedCredentialOffer> {
  await reportReceive('Reading the offer… Nothing is stored until you accept it.')
  const agent = await getOrCreateAgent()
  return agent.openid4vc.holder.resolveCredentialOffer(offerUri)
}

export async function acceptCredentialOffer(resolvedCredentialOffer: ResolvedCredentialOffer, txCode?: string) {
  await reportReceive('Requesting the credential… Keep this page open.')
  const agent = await getOrCreateAgent()
  const holder = agent.openid4vc.holder
  const createdKeyIds: string[] = []
  const storedRecordIds: string[] = []

  try {
    const tokenResponse = await holder.requestToken({
      resolvedCredentialOffer,
      ...(txCode ? { txCode } : {}),
    })
    const { credentials } = await holder.requestCredentials({
      resolvedCredentialOffer,
      accessToken: tokenResponse.accessToken,
      cNonce: tokenResponse.cNonce,
      dpop: tokenResponse.dpop,
      allowedProofOfPossessionSignatureAlgorithms: ['ES256'],
      credentialBindingResolver: async (options: OpenId4VciCredentialBindingOptions) => {
        if (options.proofTypes.jwt?.keyAttestationsRequired) {
          throw new Error('This issuer requires a key attestation. This browser wallet cannot produce one.')
        }
        if (!options.supportsJwk) {
          throw new Error('Issuer does not support JWK binding')
        }
        const binding = await createJwkHolderBinding(agent)
        createdKeyIds.push(binding.keyId)
        return { method: 'jwk' as const, keys: binding.keys }
      },
    })

    for (const credentialResponse of credentials) {
      if (!(credentialResponse.record instanceof SdJwtVcRecord)) {
        throw new Error(`Unsupported credential record type ${credentialResponse.record.type}`)
      }
      await agent.sdJwtVc.store({ record: credentialResponse.record })
      storedRecordIds.push(credentialResponse.record.id)
    }

    createdKeyIds.length = 0
    storedRecordIds.length = 0
    await reportReceive('Saving the credential…')
    await syncCredentialSummaryCache(agent)
    return credentials
  } catch (error) {
    await rollbackReceipt(agent, storedRecordIds, createdKeyIds)
    throw error
  }
}

async function rollbackReceipt(agent: Agent, storedRecordIds: string[], createdKeyIds: string[]): Promise<void> {
  await Promise.all(
    storedRecordIds.map(async (id) => {
      try {
        await agent.sdJwtVc.deleteById(id)
      } catch {
        // Keep removing the rest of this attempt.
      }
    }),
  )
  await Promise.all(
    createdKeyIds.map(async (keyId) => {
      try {
        await agent.kms.deleteKey({ keyId, backend: 'webcrypto-browser' })
      } catch {
        // The issuance error is the one the holder needs to see.
      }
    }),
  )
}
