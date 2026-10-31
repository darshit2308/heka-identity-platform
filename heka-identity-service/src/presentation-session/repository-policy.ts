import { parse } from 'yaml'
import { z } from 'zod'

import { CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS } from 'contributor-credential/contributor-credential.constants'

export type PolicyMode = 'warn' | 'enforce' | 'disabled'

export interface ResolvedPolicy {
  mode: PolicyMode
  trustedIssuers: string[]
  requiredCredentials: string[]
  acceptedIssuerDidMethods: string[]
  maxAgeSeconds: number
  graceEnabled: boolean
  graceDays: number
  configWarning?: 'repository_config_invalid'
}

/**
 * Missing config. `maxAgeSeconds` is the maximum credential age since `iat`,
 * not presentation freshness. It matches the 90-day credential lifetime.
 * The 15-minute OID4VP session is a separate bound.
 */
export const DEFAULT_POLICY: ResolvedPolicy = {
  mode: 'warn',
  trustedIssuers: [],
  requiredCredentials: ['GithubContributorCredential'],
  acceptedIssuerDidMethods: ['did:hedera'],
  maxAgeSeconds: CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS,
  graceEnabled: false,
  graceDays: 14,
}

const policySchema = z.strictObject({
  version: z.literal(1),
  contributor_identity: z.strictObject({
    mode: z.enum(['warn', 'enforce', 'disabled']),
    trusted_issuers: z.array(z.string().min(1)),
    required_credentials: z.array(z.string().min(1)).min(1),
    accepted_issuer_did_methods: z.array(z.string().min(1)).min(1),
    presentation: z.strictObject({
      format: z.literal('dc+sd-jwt'),
      max_age_seconds: z.number().int().positive(),
    }),
    grace_period: z.strictObject({
      enabled: z.boolean(),
      days: z.number().int().positive(),
    }),
    linked_vp: z.unknown().optional(),
  }),
})

export function resolveRepositoryPolicy(policyYaml: string | undefined): ResolvedPolicy {
  if (policyYaml === undefined || policyYaml.trim() === '') return { ...DEFAULT_POLICY }
  try {
    const parsed = policySchema.parse(parse(policyYaml))
    const identity = parsed.contributor_identity
    return {
      mode: identity.mode,
      trustedIssuers: identity.trusted_issuers,
      requiredCredentials: identity.required_credentials,
      acceptedIssuerDidMethods: identity.accepted_issuer_did_methods,
      maxAgeSeconds: identity.presentation.max_age_seconds,
      graceEnabled: identity.grace_period.enabled,
      graceDays: identity.grace_period.days,
    }
  } catch {
    return { ...DEFAULT_POLICY, configWarning: 'repository_config_invalid' }
  }
}
