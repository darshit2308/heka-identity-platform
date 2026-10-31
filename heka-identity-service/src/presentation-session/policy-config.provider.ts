import { Injectable } from '@nestjs/common'

import { resolveRepositoryPolicy, type ResolvedPolicy } from './repository-policy'

@Injectable()
export class PolicyConfigProvider {
  public resolve(policyYaml: string | undefined): ResolvedPolicy {
    return resolveRepositoryPolicy(policyYaml)
  }
}
