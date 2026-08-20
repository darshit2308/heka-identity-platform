import { IsOptional, IsString } from 'class-validator'

export enum GithubConfigKeys {
  oauthClientId = 'GITHUB_OAUTH_CLIENT_ID',
  oauthClientSecret = 'GITHUB_OAUTH_CLIENT_SECRET',
  oauthRedirectUri = 'GITHUB_OAUTH_REDIRECT_URI',
  oauthAuthorizeUrl = 'GITHUB_OAUTH_AUTHORIZE_URL',
  oauthTokenUrl = 'GITHUB_OAUTH_TOKEN_URL',
  oauthStateSecret = 'GITHUB_OAUTH_STATE_SECRET',
  oauthStateTtlSeconds = 'GITHUB_OAUTH_STATE_TTL_SECONDS',
  userApiUrl = 'GITHUB_USER_API_URL',
  usersApiUrl = 'GITHUB_USERS_API_URL',
  requestTimeoutMs = 'GITHUB_REQUEST_TIMEOUT_MS',
}

export class GithubConfig {
  @IsOptional()
  @IsString()
  public oauthClientId?: string

  @IsOptional()
  @IsString()
  public oauthClientSecret?: string

  @IsOptional()
  @IsString()
  public oauthRedirectUri?: string

  public oauthAuthorizeUrl: string
  public oauthTokenUrl: string
  public oauthStateSecret: string
  public oauthStateTtlSeconds: number
  public userApiUrl: string
  public usersApiUrl: string
  public requestTimeoutMs: number

  public constructor(config?: Record<string, any>) {
    this.oauthClientId = config?.[GithubConfigKeys.oauthClientId]
    this.oauthClientSecret = config?.[GithubConfigKeys.oauthClientSecret]
    this.oauthRedirectUri = config?.[GithubConfigKeys.oauthRedirectUri]
    this.oauthAuthorizeUrl =
      config?.[GithubConfigKeys.oauthAuthorizeUrl] ?? 'https://github.com/login/oauth/authorize'
    this.oauthTokenUrl =
      config?.[GithubConfigKeys.oauthTokenUrl] ?? 'https://github.com/login/oauth/access_token'
    this.oauthStateSecret =
      config?.[GithubConfigKeys.oauthStateSecret] ?? config?.['JWT_SECRET'] ?? 'test'
    this.oauthStateTtlSeconds = Number(config?.[GithubConfigKeys.oauthStateTtlSeconds] ?? 600)
    this.userApiUrl = config?.[GithubConfigKeys.userApiUrl] ?? 'https://api.github.com/user'
    this.usersApiUrl = config?.[GithubConfigKeys.usersApiUrl] ?? 'https://api.github.com/users'
    this.requestTimeoutMs = Number(config?.[GithubConfigKeys.requestTimeoutMs] ?? 8000)
  }
}
