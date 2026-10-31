import { describe, expect, it } from 'vitest'

import { resolveRepositoryPolicy } from '../repository-policy'

const valid = `
version: 1
contributor_identity:
  mode: enforce
  trusted_issuers:
    - did:hedera:testnet:issuer
  required_credentials:
    - GithubContributorCredential
  accepted_issuer_did_methods:
    - did:hedera
  presentation:
    format: dc+sd-jwt
    max_age_seconds: 900
  grace_period:
    enabled: false
    days: 14
  linked_vp:
    max_age_seconds: 604800
`

describe('resolveRepositoryPolicy', () => {
  it('uses warn defaults when the document is missing', () => {
    const policy = resolveRepositoryPolicy(undefined)
    expect(policy.mode).toBe('warn')
    expect(policy.configWarning).toBeUndefined()
    expect(policy.graceEnabled).toBe(false)
  })

  it('reads a valid document and ignores linked_vp', () => {
    const policy = resolveRepositoryPolicy(valid)
    expect(policy.mode).toBe('enforce')
    expect(policy.trustedIssuers).toEqual(['did:hedera:testnet:issuer'])
    expect(policy.configWarning).toBeUndefined()
  })

  it('falls back to warn when the document is invalid', () => {
    const policy = resolveRepositoryPolicy('version: 2\n')
    expect(policy.mode).toBe('warn')
    expect(policy.configWarning).toBe('repository_config_invalid')
  })
})
