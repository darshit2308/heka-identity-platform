import { describe, expect, it } from 'vitest'

import { describeCredentialOffer, transactionCodeError } from '../offer-preview'

const resolved = {
  metadata: {
    credentialIssuer: {
      credential_issuer: 'https://issuer.example',
      display: [{ name: 'Hiero Contributor Identity Issuer' }],
    },
  },
  credentialOfferPayload: {
    credential_configuration_ids: ['GithubContributorCredentialSdJwt'],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': 'secret-code',
        tx_code: { input_mode: 'numeric', length: 8, description: 'Enter the code shown on the Heka contributor page.' },
      },
    },
  },
  offeredCredentialConfigurations: {
    GithubContributorCredentialSdJwt: {
      vct: 'https://hiero.ledger.org/vct/GithubContributorCredential',
      display: [{ name: 'GitHub Contributor Credential' }],
    },
  },
}

describe('describeCredentialOffer', () => {
  it('shows the issuer and credential before redemption, and the transaction-code rule', () => {
    expect(describeCredentialOffer(resolved)).toEqual({
      issuerName: 'Hiero Contributor Identity Issuer',
      issuerUrl: 'https://issuer.example',
      credentials: [
        {
          name: 'GitHub Contributor Credential',
          type: 'https://hiero.ledger.org/vct/GithubContributorCredential',
        },
      ],
      txCode: {
        length: 8,
        numeric: true,
        description: 'Enter the code shown on the Heka contributor page.',
      },
    })
  })

  it('rejects a transaction code of the wrong length', () => {
    const requirement = describeCredentialOffer(resolved).txCode
    expect(transactionCodeError('1234', requirement)).toMatch(/8-character/)
    expect(transactionCodeError('12345678', requirement)).toBeNull()
    expect(transactionCodeError('abcdefgh', requirement)).toMatch(/digits/)
  })
})
