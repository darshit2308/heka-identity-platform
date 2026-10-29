import { registerAs } from '@nestjs/config'

/**
 * Public GitHub endpoints used while proving a contributor owns a GPG key.
 * OAuth client settings are added when account linking is wired up.
 */
export default registerAs('github', () => ({
  gpgKeyBaseUrl: process.env.GITHUB_GPG_KEY_BASE_URL ?? 'https://github.com',
  requestTimeoutMs: Number(process.env.GITHUB_REQUEST_TIMEOUT_MS ?? 8_000),
}))
