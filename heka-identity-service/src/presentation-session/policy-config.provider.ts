import { Injectable } from '@nestjs/common'

export type PolicyMode = 'warn' | 'enforce'

/**
 * Stub until the repository config parser lands. Every deployment is warn mode,
 * so a present status list is recorded and does not fail the check. Signature,
 * issuer, account, and expiry failures are never softened by this mode.
 */
@Injectable()
export class PolicyConfigProvider {
  public mode(): PolicyMode {
    return 'warn'
  }
}
