import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { ContributorRateLimitGuard } from 'common/http/contributor-rate-limit.guard'
import { ContributorOnboardingModule } from 'contributor-onboarding/contributor-onboarding.module'
import { GpgChallengeModule } from 'gpg-challenge/gpg-challenge.module'
import { OpenId4VcVerificationSessionModule } from 'openid4vc/verification-sessions'
import { OpenId4VcVerifierModule } from 'openid4vc/verifier/verifier.module'

import { GithubCheckNotifier } from './github-check-notifier'
import { GithubWebhookDelivery } from './github-webhook-delivery.entity'
import { GithubWebhookDeliveryService } from './github-webhook-delivery.service'
import { PolicyConfigProvider } from './policy-config.provider'
import { PresentationSessionController } from './presentation-session.controller'
import { PresentationSession } from './presentation-session.entity'
import { PresentationSessionService } from './presentation-session.service'

@Module({
  imports: [
    AgentModule,
    MikroOrmModule.forFeature([PresentationSession, GithubWebhookDelivery]),
    OpenId4VcVerificationSessionModule,
    OpenId4VcVerifierModule,
    GpgChallengeModule,
    ContributorOnboardingModule,
  ],
  controllers: [PresentationSessionController],
  providers: [
    PresentationSessionService,
    GithubWebhookDeliveryService,
    GithubCheckNotifier,
    PolicyConfigProvider,
    ContributorRateLimitGuard,
  ],
  exports: [PresentationSessionService],
})
export class PresentationSessionModule {}
