/**
 * Payload of the SD-JWT VC issued for a `GithubContributorCredential`.
 *
 * Always-present (non-selectively-disclosable):
 *   - `githubAccountId` — GitHub's immutable numeric account ID (string form)
 *   - `verifiedAt`      — ISO-8601 timestamp of the successful GPG verification
 *   - `walletId`        — Heka wallet id from the authenticated session
 *
 * Selectively disclosable (listed in CONTRIBUTOR_CREDENTIAL_SELECTIVE_CLAIMS):
 *   - `githubUsername`  — GitHub login at the time of verification
 *   - `gpgFingerprint`  — Uppercase hex fingerprint of the verified GPG key
 */
export interface ContributorCredentialPayload {
  githubAccountId: string
  githubUsername: string
  gpgFingerprint: string
  verifiedAt: string

  /** Heka wallet id from the authenticated session. */
  walletId: string
  vct: string
  [key: string]: unknown
}
