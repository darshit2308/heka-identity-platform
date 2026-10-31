import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { ContributorRateLimit, ContributorRateLimitGuard } from 'common/http/contributor-rate-limit.guard'
import { CorrelationIdInterceptor } from 'common/http/correlation-id.interceptor'
import { GithubAppStatusGuard } from 'gpg-challenge/github-app-status.guard'

import {
  AttachCheckRunDto,
  ClosePresentationSessionDto,
  CreatePresentationSessionDto,
  UpdateWebhookJobDto,
  UpsertWebhookJobDto,
} from './dto/presentation-session.dto'
import {
  GithubWebhookDeliveryService,
  type AbandonedWebhookJob,
  type WebhookJobDecision,
} from './github-webhook-delivery.service'
import { PresentationSessionService, PresentationSessionView } from './presentation-session.service'

@ApiTags('Presentation Session')
@UseInterceptors(CorrelationIdInterceptor)
@Controller('presentation-session')
export class PresentationSessionController {
  public constructor(
    private readonly sessions: PresentationSessionService,
    private readonly deliveries: GithubWebhookDeliveryService,
  ) {}

  @Version('2')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(GithubAppStatusGuard)
  @ApiOperation({ summary: 'Open an OID4VP session for a pull request' })
  public create(@Body() body: CreatePresentationSessionDto): Promise<PresentationSessionView> {
    return this.sessions.create(body)
  }

  @Version('2')
  @Post('deliveries')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GithubAppStatusGuard)
  @ApiOperation({ summary: 'Lease a webhook delivery. Completed only after the check is attached.' })
  public acceptDelivery(@Body() body: UpsertWebhookJobDto): Promise<WebhookJobDecision> {
    return this.deliveries.accept(body.deliveryId, body.event)
  }

  @Version('2')
  @Get('deliveries/abandoned')
  @UseGuards(GithubAppStatusGuard)
  @ApiOperation({ summary: 'Lease webhook jobs whose worker stopped before the check was attached' })
  public abandonedDeliveries(): Promise<{ jobs: AbandonedWebhookJob[] }> {
    return this.deliveries.leaseAbandoned().then((jobs) => ({ jobs }))
  }

  @Version('2')
  @Patch('deliveries/:deliveryId')
  @UseGuards(GithubAppStatusGuard)
  @ApiOperation({ summary: 'Store the check run id, or mark the job completed or failed' })
  public updateDelivery(@Param('deliveryId') deliveryId: string, @Body() body: UpdateWebhookJobDto): Promise<void> {
    return this.deliveries.update(deliveryId, body)
  }

  @Version('2')
  @Post('close')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GithubAppStatusGuard)
  @ApiOperation({ summary: 'Fail open sessions when the pull request is closed' })
  public close(@Body() body: ClosePresentationSessionDto): Promise<{ closed: number }> {
    return this.sessions.closePullRequest(body)
  }

  @Version('2')
  @Patch(':sessionId/check-run')
  @UseGuards(GithubAppStatusGuard)
  @ApiOperation({ summary: 'Store the GitHub check run that points at this session' })
  public attach(
    @Param('sessionId') sessionId: string,
    @Body() body: AttachCheckRunDto,
  ): Promise<PresentationSessionView> {
    return this.sessions.attachCheckRun(sessionId, body.checkRunId)
  }

  @Version('2')
  @Get(':sessionId')
  @UseGuards(ContributorRateLimitGuard)
  @ContributorRateLimit('poll')
  @ApiOperation({ summary: 'Poll a presentation session. The page uses this every two seconds.' })
  @ApiOkResponse({ description: 'Current session state' })
  public get(@Param('sessionId') sessionId: string): Promise<PresentationSessionView> {
    return this.sessions.getForPage(sessionId)
  }

  @Version('2')
  @Post(':sessionId/retry')
  @UseGuards(ContributorRateLimitGuard)
  @ContributorRateLimit('retry')
  @ApiOperation({ summary: 'Replace a failed or timed-out request without opening a new pull request' })
  public retry(@Param('sessionId') sessionId: string): Promise<PresentationSessionView> {
    return this.sessions.retry(sessionId)
  }
}
