import { createSign } from 'crypto'

import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import PresentationSessionConfig from 'config/presentation-session'

export interface GithubCheckUpdate {
  installationId: string
  owner: string
  repo: string
  checkRunId: string
  conclusion: 'success' | 'failure' | 'action_required'
  title: string
  summary: string
}

@Injectable()
export class GithubCheckNotifier {
  private readonly logger = new Logger(GithubCheckNotifier.name)

  public constructor(
    @Inject(PresentationSessionConfig.KEY)
    private readonly config: ConfigType<typeof PresentationSessionConfig>,
  ) {}

  public async update(change: GithubCheckUpdate, http: typeof fetch = fetch): Promise<boolean> {
    const { githubAppId, githubAppPrivateKey } = this.config
    if (!githubAppId || !githubAppPrivateKey) {
      this.logger.warn('GitHub App credentials are not set, so the check run was not updated.')
      return false
    }

    const token = await this.installationToken(githubAppId, githubAppPrivateKey, change.installationId, http)
    const response = await http(
      `https://api.github.com/repos/${change.owner}/${change.repo}/check-runs/${change.checkRunId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'heka-identity-service',
        },
        body: JSON.stringify({
          status: 'completed',
          conclusion: change.conclusion,
          output: { title: change.title, summary: change.summary },
        }),
      },
    )
    if (!response.ok) {
      this.logger.warn(`GitHub check update failed with HTTP ${response.status}.`)
      return false
    }
    return true
  }

  private async installationToken(
    appId: string,
    privateKey: string,
    installationId: string,
    http: typeof fetch,
  ): Promise<string> {
    const response = await http(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signAppJwt(appId, privateKey)}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'heka-identity-service',
      },
    })
    if (!response.ok) {
      throw new Error(`GitHub installation token request failed with HTTP ${response.status}.`)
    }
    const body = (await response.json()) as { token?: string }
    if (!body.token) throw new Error('GitHub installation token response had no token.')
    return body.token
  }
}

export function signAppJwt(appId: string, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: appId }))
  const unsigned = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  return `${unsigned}.${base64Url(signer.sign(privateKeyPem))}`
}

function base64Url(value: string | Buffer): string {
  const buffer = typeof value === 'string' ? Buffer.from(value) : value
  return buffer.toString('base64url')
}
