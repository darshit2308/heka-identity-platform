import { ClaimFormat, type DcqlCredentialsForRequest } from '@credo-ts/core'
import { describe, expect, it } from 'vitest'

import type { ResolvedPresentationRequest } from '../present'
import { describePresentation } from '../presentation-preview'

describe('describePresentation', () => {
  it('names the verifier, origin, credential, and disclosed claims', () => {
    const resolved = {
      origin: 'https://verifier.example',
      verifier: { clientIdPrefix: 'redirect_uri', effectiveClientId: 'https://verifier.example' },
      authorizationRequestPayload: {
        client_id: 'https://verifier.example',
        client_metadata: { client_name: 'Hiero PR check' },
      },
    } as unknown as Pick<ResolvedPresentationRequest, 'origin' | 'verifier' | 'authorizationRequestPayload'>

    const selected = {
      github: [
        {
          claimFormat: ClaimFormat.SdJwtDc,
          credentialRecord: { tags: { vct: 'GithubContributorCredential' } },
          disclosedPayload: { githubAccountId: '4115704', githubUsername: 'ada' },
        },
      ],
    } as unknown as DcqlCredentialsForRequest

    expect(describePresentation(resolved, selected)).toEqual({
      verifier: 'Hiero PR check',
      origin: 'https://verifier.example',
      credentials: [{ name: 'GithubContributorCredential', claims: ['githubAccountId', 'githubUsername'] }],
    })
  })
})
