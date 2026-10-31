import {
  CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS,
  CONTRIBUTOR_CREDENTIAL_VCT,
} from 'contributor-credential/contributor-credential.constants'

/** How long a pull-request verification session stays open. */
export const PRESENTATION_SESSION_TTL_MS = 15 * 60 * 1000

/**
 * A successful presentation for this GitHub account can close other open pull
 * requests inside the same window. Each pull request still gets its own session
 * and check run. Outside the window the contributor presents again.
 */
export const RECENT_PRESENTATION_WINDOW_MS = PRESENTATION_SESSION_TTL_MS

export type PolicyMode = 'warn' | 'enforce'

export type PresentationFailureCode =
  | 'invalid_vp'
  | 'credential_not_found'
  | 'issuer_untrusted'
  | 'issuer_method_rejected'
  | 'account_id_mismatch'
  | 'credential_expired'
  | 'credential_stale'
  | 'credential_type_mismatch'
  | 'revocation_unverified'
  | 'session_expired'
  | 'pull_request_closed'
  | 'resolver_unavailable'

export interface PresentationDecision {
  outcome: 'success' | 'failure'
  failureReason?: PresentationFailureCode
  /** Recorded when warn mode accepts a check that enforce mode would reject. */
  warning?: string
  humanReason: string
}

const HUMAN_REASONS: Record<PresentationFailureCode, string> = {
  invalid_vp: 'The presentation could not be verified.',
  credential_not_found: 'The presentation did not include a GitHub contributor credential.',
  issuer_untrusted: 'The credential was not issued by the Heka contributor issuer.',
  issuer_method_rejected: 'The credential issuer does not use an accepted DID method.',
  account_id_mismatch: 'The credential belongs to a different GitHub account than this pull request.',
  credential_expired: 'The contributor credential has expired.',
  credential_stale: 'The contributor credential is older than this repository allows.',
  credential_type_mismatch: 'The presentation did not include the credential type this repository requires.',
  revocation_unverified: 'The credential includes a status list this verifier cannot check.',
  session_expired: 'The verification session expired before a presentation arrived.',
  pull_request_closed: 'The pull request was closed before verification finished.',
  resolver_unavailable: 'The issuer DID could not be resolved.',
}

export function humanReason(code: PresentationFailureCode): string {
  return HUMAN_REASONS[code]
}

export function recentSuccessCovers(completedAt: Date, now: Date): boolean {
  return now.getTime() - completedAt.getTime() < RECENT_PRESENTATION_WINDOW_MS
}

/**
 * Checks the claims Credo already signature-verified.
 *
 * This profile does not publish a status list. `exp` is the freshness bound.
 * A status claim, if one appears, fails in enforce mode and is recorded as a
 * warning in the Week 8 stub, which is always warn until the config parser exists.
 */
export function decidePresentation(input: {
  claims: Record<string, unknown> | undefined
  expectedAccountId: string
  trustedIssuerDid: string
  nowSeconds: number
  policyMode: PolicyMode
  maxAgeSeconds?: number
  allowedIssuerDids?: string[]
  acceptedIssuerDidMethods?: string[]
  requiredCredentials?: string[]
}): PresentationDecision {
  const claims = input.claims
  if (!claims) return failure('invalid_vp')

  const required = input.requiredCredentials ?? ['GithubContributorCredential']
  if (
    required.some((name) => name !== 'GithubContributorCredential') ||
    !required.includes('GithubContributorCredential')
  ) {
    return failure('credential_type_mismatch')
  }

  const vct = claims.vct
  if (vct !== CONTRIBUTOR_CREDENTIAL_VCT) return failure('credential_not_found')

  const issuer = claims.iss
  if (typeof issuer !== 'string') return failure('issuer_untrusted')
  const methods = input.acceptedIssuerDidMethods ?? ['did:hedera']
  if (!methods.some((method) => issuer.startsWith(`${method}:`))) return failure('issuer_method_rejected')

  const allowed = input.allowedIssuerDids ?? []
  if (allowed.length > 0) {
    if (!allowed.includes(issuer)) return failure('issuer_untrusted')
  } else if (issuer !== input.trustedIssuerDid) {
    return failure('issuer_untrusted')
  }

  const accountId = claims.githubAccountId
  if (typeof accountId !== 'string' || accountId !== input.expectedAccountId) return failure('account_id_mismatch')

  const exp = claims.exp
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= input.nowSeconds) return failure('credential_expired')

  // Credential age since iat. A missing iat does not fail this check.
  // Presentation freshness is the 15-minute session, not this value.
  const maxAge = input.maxAgeSeconds ?? CONTRIBUTOR_CREDENTIAL_LIFETIME_SECONDS
  const issuedAt = claims.iat
  if (typeof issuedAt === 'number' && Number.isFinite(issuedAt) && input.nowSeconds - issuedAt > maxAge) {
    return failure('credential_stale')
  }

  const statusPresent = claims.status != null || claims.status_list != null
  if (statusPresent && input.policyMode === 'enforce') return failure('revocation_unverified')

  return {
    outcome: 'success',
    warning: statusPresent ? 'revocation_status_present_unchecked' : undefined,
    humanReason: statusPresent
      ? 'Verified. A status list was present and was not checked, because policy is in warn mode.'
      : 'Verified. This credential has no status list, so expiry is the freshness bound.',
  }
}

function failure(code: PresentationFailureCode): PresentationDecision {
  return { outcome: 'failure', failureReason: code, humanReason: humanReason(code) }
}
