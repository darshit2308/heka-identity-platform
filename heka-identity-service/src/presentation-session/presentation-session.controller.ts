import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards, Version } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { GithubAppStatusGuard } from 'gpg-challenge/github-app-status.guard'

import {
  AttachCheckRunDto,
  ClosePresentationSessionDto,
  CreatePresentationSessionDto,
} from './dto/presentation-session.dto'
import { PresentationSessionService, PresentationSessionView } from './presentation-session.service'

@ApiTags('Presentation Session')
@Controller('presentation-session')
export class PresentationSessionController {
  public constructor(private readonly sessions: PresentationSessionService) {}

  @Version('2')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(GithubAppStatusGuard)
  @ApiOperation({ summary: 'Open an OID4VP session for a pull request' })
  public create(@Body() body: CreatePresentationSessionDto): Promise<PresentationSessionView> {
    return this.sessions.create(body)
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
  @ApiOperation({ summary: 'Poll a presentation session. The page uses this every two seconds.' })
  @ApiOkResponse({ description: 'Current session state' })
  public get(@Param('sessionId') sessionId: string): Promise<PresentationSessionView> {
    return this.sessions.getForPage(sessionId)
  }

  @Version('2')
  @Post(':sessionId/retry')
  @ApiOperation({ summary: 'Replace a failed or timed-out request without opening a new pull request' })
  public retry(@Param('sessionId') sessionId: string): Promise<PresentationSessionView> {
    return this.sessions.retry(sessionId)
  }
}
