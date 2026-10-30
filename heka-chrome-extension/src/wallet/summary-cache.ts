import type { Agent } from '@credo-ts/core'

import { CREDENTIAL_COUNT_KEY, CREDENTIALS_SUMMARY_KEY } from './storage-keys'

export interface CredentialSummary {
  id: string
  vct: string
  issuer: string
  issuedAt?: string
  claims: Record<string, unknown>
}

export async function syncCredentialSummaryCache(agent: Agent): Promise<void> {
  const records = await agent.sdJwtVc.getAll()
  const summary: CredentialSummary[] = records.map((record) => {
    const credential = record.firstCredential
    const issuer = typeof credential.payload.iss === 'string' ? credential.payload.iss : ''
    return {
      id: record.id,
      vct: record.getTags().vct,
      issuer,
      issuedAt: record.createdAt ? record.createdAt.toISOString() : undefined,
      claims: credential.prettyClaims,
    }
  })

  await chrome.storage.local.set({
    [CREDENTIALS_SUMMARY_KEY]: summary,
    [CREDENTIAL_COUNT_KEY]: summary.length,
  })
}

export async function loadCredentialSummaries(): Promise<CredentialSummary[]> {
  const stored = await chrome.storage.local.get(CREDENTIALS_SUMMARY_KEY)
  const summary = stored[CREDENTIALS_SUMMARY_KEY]
  return Array.isArray(summary) ? (summary as CredentialSummary[]) : []
}
