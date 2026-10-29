import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'

import { ContributorAuditEvent } from './contributor-audit-event.entity'
import { ContributorBinding } from './contributor-binding.entity'
import { ContributorOnboardingController } from './contributor-onboarding.controller'
import { ContributorOnboardingService } from './contributor-onboarding.service'

@Module({
  imports: [MikroOrmModule.forFeature([ContributorBinding, ContributorAuditEvent])],
  controllers: [ContributorOnboardingController],
  providers: [ContributorOnboardingService],
  exports: [ContributorOnboardingService],
})
export class ContributorOnboardingModule {}
