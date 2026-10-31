import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator'

export class CreatePresentationSessionDto {
  @ApiProperty()
  @IsString()
  public githubAccountId!: string

  @ApiProperty()
  @IsString()
  public githubUsername!: string

  @ApiProperty()
  @IsString()
  public installationId!: string

  @ApiProperty()
  @IsString()
  public owner!: string

  @ApiProperty()
  @IsString()
  public repo!: string

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public prNumber!: number

  @ApiProperty()
  @IsString()
  public headSha!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16384)
  public policyYaml?: string
}

export class ClosePresentationSessionDto {
  @ApiProperty()
  @IsString()
  public owner!: string

  @ApiProperty()
  @IsString()
  public repo!: string

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public prNumber!: number
}

export class WebhookJobEventDto {
  @ApiProperty()
  @IsIn(['opened', 'synchronize', 'reopened', 'ready_for_review', 'closed'])
  public action!: 'opened' | 'synchronize' | 'reopened' | 'ready_for_review' | 'closed'

  @ApiProperty()
  @IsString()
  public owner!: string

  @ApiProperty()
  @IsString()
  public repo!: string

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public prNumber!: number

  @ApiProperty()
  @IsString()
  public headSha!: string

  @ApiProperty()
  @IsString()
  public githubAccountId!: string

  @ApiProperty()
  @IsString()
  public githubUsername!: string

  @ApiProperty()
  @IsString()
  public installationId!: string

  @ApiProperty()
  @IsBoolean()
  public draft!: boolean

  @ApiProperty()
  @IsBoolean()
  public fork!: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public defaultBranch?: string
}

export class UpsertWebhookJobDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  public deliveryId!: string

  @ApiProperty()
  @ValidateNested()
  @Type(() => WebhookJobEventDto)
  public event!: WebhookJobEventDto
}

export class UpdateWebhookJobDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public checkRunId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['completed', 'failed'])
  public status?: 'completed' | 'failed'
}

export class AttachCheckRunDto {
  @ApiProperty()
  @IsString()
  public checkRunId!: string
}
