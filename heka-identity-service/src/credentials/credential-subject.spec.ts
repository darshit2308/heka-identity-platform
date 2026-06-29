import { readFileSync } from 'fs'
import { join } from 'path'

import Ajv, { type ValidateFunction } from 'ajv/dist/2020'

const loadFixture = (fileName: string): Record<string, unknown> => {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', fileName), 'utf8')) as Record<string, unknown>
}

describe('GithubContributorCredential Schema Validation', () => {
  const ajv = new Ajv()
  let schema: Record<string, unknown>
  let mockPayload: Record<string, unknown>
  let validate: ValidateFunction

  beforeAll(() => {
    schema = loadFixture('github-contributor-credential.schema.json')
    mockPayload = loadFixture('mock-issuer-payload.json')
    validate = ajv.compile(schema)
  })

  it('should successfully pass a valid structural subject mapping', () => {
    const validSubject = {
      id: mockPayload.sub,
      githubUsername: 'darshit2308',
      githubAccountId: 4115704,
      gpgFingerprint: '3AA5C34371567BD2',
    }
    expect(validate(validSubject)).toBe(true)
  })

  it('should fail validation if the githubAccountId is passed as a string', () => {
    const invalidSubject = {
      id: mockPayload.sub,
      githubUsername: 'darshit2308',
      githubAccountId: '4115704', // Invalid: type should be integer
      gpgFingerprint: '3AA5C34371567BD2',
    }
    expect(validate(invalidSubject)).toBe(false)
  })

  it('should fail validation if required structural claims are missing', () => {
    const incompleteSubject = {
      id: mockPayload.sub,
      githubUsername: 'darshit2308',
    }
    expect(validate(incompleteSubject)).toBe(false)
  })

  it('should reject an id that does not match the did:hedera pattern', () => {
    const subject = {
      id: 'not-a-did',
      githubUsername: 'darshit2308',
      githubAccountId: 4115704,
      gpgFingerprint: '3AA5C34371567BD2',
    }
    expect(validate(subject)).toBe(false)
  })

  it('should reject an empty githubUsername (minLength: 1)', () => {
    const subject = {
      id: 'did:hedera:testnet:z6MkqExampleDeveloperDID',
      githubUsername: '',
      githubAccountId: 4115704,
      gpgFingerprint: '3AA5C34371567BD2',
    }
    expect(validate(subject)).toBe(false)
  })

  it('should reject a gpgFingerprint that does not match the hex pattern', () => {
    const subject = {
      id: 'did:hedera:testnet:z6MkqExampleDeveloperDID',
      githubUsername: 'darshit2308',
      githubAccountId: 4115704,
      gpgFingerprint: 'not-a-hex-fingerprint',
    }
    expect(validate(subject)).toBe(false)
  })

  it('should reject additional properties not in the schema', () => {
    const subject = {
      id: 'did:hedera:testnet:z6MkqExampleDeveloperDID',
      githubUsername: 'darshit2308',
      githubAccountId: 4115704,
      gpgFingerprint: '3AA5C34371567BD2',
      extraField: 'should-not-be-here',
    }
    expect(validate(subject)).toBe(false)
  })
})
