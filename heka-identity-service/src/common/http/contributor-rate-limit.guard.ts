import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'

import { consume } from './fixed-window-rate-limit'

export const CONTRIBUTOR_RATE_LIMIT = 'heka_contributor_rate_limit'

/** Which contributor route is being limited. The counters live in this process only. */
export type ContributorRateLimitScope = 'gpg' | 'poll' | 'retry'

export const ContributorRateLimit = (scope: ContributorRateLimitScope) => SetMetadata(CONTRIBUTOR_RATE_LIMIT, scope)

const WINDOW_MS = 60_000

@Injectable()
export class ContributorRateLimitGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const scope = this.reflector.get<ContributorRateLimitScope | undefined>(
      CONTRIBUTOR_RATE_LIMIT,
      context.getHandler(),
    )
    if (!scope) return true

    const request = context.switchToHttp().getRequest<Request & { user?: { userId?: string } }>()
    const ip = request.ip || request.socket?.remoteAddress || 'unknown'
    const userId = request.user?.userId

    if (scope === 'gpg') consume(`gpg:${userId || ip}`, 10, WINDOW_MS)
    if (scope === 'poll') consume(`poll:${ip}`, 120, WINDOW_MS)
    if (scope === 'retry') consume(`retry:${String(request.params.sessionId ?? 'unknown')}`, 5, WINDOW_MS)
    return true
  }
}
