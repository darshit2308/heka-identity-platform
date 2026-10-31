import { describe, expect, it } from 'vitest'

import { CONTRIBUTOR_CREDENTIAL_VCT } from 'contributor-credential/contributor-credential.constants'

import { decidePresentation, recentSuccessCovers } from '../presentation-decision'

const now = 1_700_000_000
const issuer = 'did:hedera:testnet:issuer'

function claims(overrides: Record<string, unknown> = {}) {
  return {
    vct: CONTRIBUTOR_CREDENTIAL_VCT,
    iss: issuer,
    githubAccountId: '123',
    exp: now + 60,
    ...overrides,
  }
}

describe('decidePresentation', () => {
  it('accepts a fresh credential from the trusted issuer for the pull-request account', () => {
    const decision = decidePresentation({
      claims: claims(),
      expectedAccountId: '123',
      trustedIssuerDid: issuer,
      nowSeconds: now,
      policyMode: 'warn',
    })
    expect(decision.outcome).toBe('success')
    expect(decision.failureReason).toBeUndefined()
  })

  it('rejects a different account, an untrusted issuer, and an expired credential', () => {
    expect(
      decidePresentation({
        claims: claims({ githubAccountId: '999' }),
        expectedAccountId: '123',
        trustedIssuerDid: issuer,
        nowSeconds: now,
        policyMode: 'enforce',
      }).failureReason,
    ).toBe('account_id_mismatch')
    expect(
      decidePresentation({
        claims: claims({ iss: 'did:hedera:testnet:other' }),
        expectedAccountId: '123',
        trustedIssuerDid: issuer,
        nowSeconds: now,
        policyMode: 'enforce',
      }).failureReason,
    ).toBe('issuer_untrusted')
    expect(
      decidePresentation({
        claims: claims({ exp: now - 1 }),
        expectedAccountId: '123',
        trustedIssuerDid: issuer,
        nowSeconds: now,
        policyMode: 'warn',
      }).failureReason,
    ).toBe('credential_expired')
  })

  it('warns when a status list is present and fails that case in enforce mode', () => {
    const warned = decidePresentation({
      claims: claims({ status: { idx: 1 } }),
      expectedAccountId: '123',
      trustedIssuerDid: issuer,
      nowSeconds: now,
      policyMode: 'warn',
    })
    expect(warned.outcome).toBe('success')
    expect(warned.warning).toBe('revocation_status_present_unchecked')

    const enforced = decidePresentation({
      claims: claims({ status: { idx: 1 } }),
      expectedAccountId: '123',
      trustedIssuerDid: issuer,
      nowSeconds: now,
      policyMode: 'enforce',
    })
    expect(enforced.failureReason).toBe('revocation_unverified')
  })

  it('fails a stale credential, a rejected issuer method, and an issuer outside the allow list', () => {
    expect(
      decidePresentation({
        claims: claims({ iat: now - 1_000 }),
        expectedAccountId: '123',
        trustedIssuerDid: issuer,
        nowSeconds: now,
        policyMode: 'enforce',
        maxAgeSeconds: 900,
      }).failureReason,
    ).toBe('credential_stale')
    expect(
      decidePresentation({
        claims: claims({ iss: 'did:key:z6Mk' }),
        expectedAccountId: '123',
        trustedIssuerDid: issuer,
        nowSeconds: now,
        policyMode: 'enforce',
      }).failureReason,
    ).toBe('issuer_method_rejected')
    expect(
      decidePresentation({
        claims: claims(),
        expectedAccountId: '123',
        trustedIssuerDid: issuer,
        nowSeconds: now,
        policyMode: 'enforce',
        allowedIssuerDids: ['did:hedera:testnet:other'],
      }).failureReason,
    ).toBe('issuer_untrusted')
  })
})

describe('recentSuccessCovers', () => {
  it('covers another pull request inside 15 minutes and not after', () => {
    const completed = new Date('2026-10-30T12:00:00.000Z')
    expect(recentSuccessCovers(completed, new Date('2026-10-30T12:14:00.000Z'))).toBe(true)
    expect(recentSuccessCovers(completed, new Date('2026-10-30T12:15:00.000Z'))).toBe(false)
  })
})
