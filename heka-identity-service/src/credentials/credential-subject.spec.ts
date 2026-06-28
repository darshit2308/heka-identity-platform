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
    mockPayload = loadFixture('mock-sd-jwt-payload.json')
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
})
