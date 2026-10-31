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
  ClaimWebhookDeliveryDto,
  ClosePresentationSessionDto,
  CreatePresentationSessionDto,
} from './dto/presentation-session.dto'
import { GithubWebhookDeliveryService } from './github-webhook-delivery.service'
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
  @ApiOperation({ summary: 'Claim a GitHub webhook delivery id for ten minutes' })
  public claim(@Body() body: ClaimWebhookDeliveryDto): Promise<{ claimed: boolean }> {
    return this.deliveries.claim(body.deliveryId).then((claimed) => ({ claimed }))
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
