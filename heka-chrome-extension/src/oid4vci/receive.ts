import { Kms, SdJwtVcRecord, type Agent } from '@credo-ts/core'
import type { OpenId4VciCredentialBindingOptions } from '@credo-ts/openid4vc'

import { getOrCreateAgent } from '../credo/lazy-agent'
import { syncCredentialSummaryCache } from '../wallet/summary-cache'
import { JWK_THUMBPRINT_MAP_KEY } from '../wallet/storage-keys'

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function persistKeyThumbprintMapping(thumbprint: string, keyId: string): Promise<void> {
  const result = await chrome.storage.local.get(JWK_THUMBPRINT_MAP_KEY)
  const map = (result[JWK_THUMBPRINT_MAP_KEY] as Record<string, string> | undefined) ?? {}
  map[thumbprint] = keyId
  await chrome.storage.local.set({ [JWK_THUMBPRINT_MAP_KEY]: map })
}

/**
 * Creates a non-extractable P-256 key and returns the JWK binding Credo
 * sends as the OID4VCI proof of possession. The thumbprint is kept so a
 * later presentation can find the same key.
 */
export async function createJwkHolderBinding(agent: Agent): Promise<{ method: 'jwk'; keys: Kms.PublicJwk[] }> {
  const createdKey = await agent.kms.createKey({
    backend: 'webcrypto-browser',
    type: { kty: 'EC', crv: 'P-256' },
  })
  const publicJwk = Kms.PublicJwk.fromPublicJwk(createdKey.publicJwk)
  await persistKeyThumbprintMapping(encodeBase64Url(publicJwk.getJwkThumbprint()), createdKey.keyId)
  return { method: 'jwk', keys: [publicJwk] }
}

export async function receiveCredentialOffer(offerUri: string) {
  const agent = await getOrCreateAgent()
  const holder = agent.openid4vc.holder

  const resolvedCredentialOffer = await holder.resolveCredentialOffer(offerUri)
  const tokenResponse = await holder.requestToken({ resolvedCredentialOffer })
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
      return createJwkHolderBinding(agent)
    },
  })

  for (const credentialResponse of credentials) {
    if (!(credentialResponse.record instanceof SdJwtVcRecord)) {
      throw new Error(`Unsupported credential record type ${credentialResponse.record.type}`)
    }
    await agent.sdJwtVc.store({ record: credentialResponse.record })
  }

  await syncCredentialSummaryCache(agent)
  return credentials
}
