import { Controller, Get, HttpCode, HttpStatus, UseGuards, Version } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'

import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'

import { ContributorOnboardingService } from './contributor-onboarding.service'
import { ContributorOnboardingStatus } from './contributor-onboarding.types'

@ApiTags('Contributor Onboarding')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized.' })
@UseGuards(JwtAuthGuard)
@Controller('contributor-onboarding')
export class ContributorOnboardingController {
  public constructor(private readonly contributorOnboardingService: ContributorOnboardingService) {}

  @Version('2')
  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get GitHub link and GPG verification status for the logged-in user.' })
  @ApiOkResponse({ description: 'Contributor onboarding status.' })
  public async getStatus(@ReqAuthInfo() authInfo: AuthInfo): Promise<ContributorOnboardingStatus> {
    return this.contributorOnboardingService.getStatus(authInfo)
  }
}
