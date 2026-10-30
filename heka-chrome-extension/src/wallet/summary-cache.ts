import type { Agent } from '@credo-ts/core'

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
    credentialsSummary: summary,
    credentialCount: summary.length,
  })
}
