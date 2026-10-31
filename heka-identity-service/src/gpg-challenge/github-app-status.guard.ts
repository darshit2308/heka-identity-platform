import * as crypto from 'crypto'

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { Request } from 'express'

import { consume } from 'common/http/fixed-window-rate-limit'
import GithubConfig from 'config/github'

const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 60

/**
 * The status route is called by the Heka GitHub App, not by a signed-in user.
 * A shared bearer token keeps anonymous callers from enumerating fingerprints,
 * and the per-address limit keeps one caller from draining the GitHub API quota.
 */
@Injectable()
export class GithubAppStatusGuard implements CanActivate {
  public constructor(@Inject(GithubConfig.KEY) private readonly github: ConfigType<typeof GithubConfig>) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    this.assertToken(request.header('authorization'))
    this.assertRateLimit(request.ip || request.socket?.remoteAddress || 'unknown')
    return true
  }

  private assertToken(authorization: string | undefined): void {
    const expected = this.github.statusToken
    if (!expected) {
      throw new ServiceUnavailableException('Contributor status checks are not configured.')
    }

    const presented = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
    const presentedHash = crypto.createHash('sha256').update(presented).digest()
    const expectedHash = crypto.createHash('sha256').update(expected).digest()
    if (!crypto.timingSafeEqual(presentedHash, expectedHash)) {
      throw new UnauthorizedException()
    }
  }

  private assertRateLimit(caller: string): void {
    consume(`github-status:${caller}`, MAX_REQUESTS_PER_WINDOW, WINDOW_MS)
  }
}
