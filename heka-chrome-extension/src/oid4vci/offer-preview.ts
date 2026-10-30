export interface TransactionCodeRequirement {
  length: number
  numeric: boolean
  description: string
}

export interface OfferPreview {
  issuerName: string
  issuerUrl: string
  credentials: Array<{ name: string; type: string }>
  txCode: TransactionCodeRequirement | null
}

const PRE_AUTHORIZED_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function displayName(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const name = asRecord(value[0])?.name
  return typeof name === 'string' && name.length > 0 ? name : undefined
}

/**
 * Reads the issuer, credential configuration, and transaction-code requirement
 * from a resolved OID4VCI offer. The wallet shows this before it redeems anything.
 */
export function describeCredentialOffer(resolved: unknown): OfferPreview {
  const root = asRecord(resolved)
  const issuer = asRecord(asRecord(root?.metadata)?.credentialIssuer)
  const issuerUrl = typeof issuer?.credential_issuer === 'string' ? issuer.credential_issuer : 'Unknown issuer'
  const payload = asRecord(root?.credentialOfferPayload)
  const configurations = asRecord(root?.offeredCredentialConfigurations) ?? {}
  const offeredIds = Array.isArray(payload?.credential_configuration_ids)
    ? payload.credential_configuration_ids.filter((id): id is string => typeof id === 'string')
    : Object.keys(configurations)

  const credentials = offeredIds.map((id) => {
    const configuration = asRecord(configurations[id])
    const type = typeof configuration?.vct === 'string' ? configuration.vct : id
    return { name: displayName(configuration?.display) ?? type, type }
  })

  const grant = asRecord(asRecord(payload?.grants)?.[PRE_AUTHORIZED_GRANT])
  const tx = asRecord(grant?.tx_code)
  const txCode = tx
    ? {
        length: typeof tx.length === 'number' && tx.length > 0 ? tx.length : 4,
        numeric: tx.input_mode !== 'text',
        description:
          typeof tx.description === 'string' && tx.description.length > 0
            ? tx.description
            : 'Enter the transaction code from the issuer.',
      }
    : null

  return {
    issuerName: displayName(issuer?.display) ?? issuerUrl,
    issuerUrl,
    credentials,
    txCode,
  }
}

export function transactionCodeError(code: string, requirement: TransactionCodeRequirement | null): string | null {
  if (!requirement) return null
  const trimmed = code.trim()
  if (trimmed.length !== requirement.length) {
    return `Enter the ${requirement.length}-character code shown in Heka.`
  }
  if (requirement.numeric && !/^\d+$/.test(trimmed)) return 'That code uses digits only.'
  return null
}
