import type { DcqlCredentialsForRequest } from '@credo-ts/core'

import type { ResolvedPresentationRequest } from './present'

export interface PresentationPreview {
  verifier: string
  origin: string
  credentials: Array<{ name: string; claims: string[] }>
}

function claimNames(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  return Object.keys(payload)
}

function credentialName(record: object, fallback: string): string {
  const tags = 'tags' in record ? (record as { tags?: { vct?: string } }).tags : undefined
  return typeof tags?.vct === 'string' && tags.vct.length > 0 ? tags.vct : fallback
}

/**
 * Verifier, origin, credential, and the claims the selected presentation will disclose.
 */
export function describePresentation(
  resolved: Pick<ResolvedPresentationRequest, 'origin' | 'verifier' | 'authorizationRequestPayload'>,
  selectedCredentials: DcqlCredentialsForRequest,
): PresentationPreview {
  const payload = resolved.authorizationRequestPayload as {
    client_id?: unknown
    client_metadata?: { client_name?: unknown }
  }
  const clientName = payload.client_metadata?.client_name
  const verifier =
    (typeof clientName === 'string' && clientName) ||
    resolved.verifier.effectiveClientId ||
    (typeof payload.client_id === 'string' && payload.client_id) ||
    'Unknown verifier'

  const credentials = Object.entries(selectedCredentials).flatMap(([queryId, entries]) =>
    entries.map((entry) => ({
      name: credentialName(entry.credentialRecord, queryId),
      claims: claimNames(entry.disclosedPayload),
    })),
  )

  return {
    verifier,
    origin: resolved.origin && resolved.origin.length > 0 ? resolved.origin : 'Origin not provided',
    credentials,
  }
}
