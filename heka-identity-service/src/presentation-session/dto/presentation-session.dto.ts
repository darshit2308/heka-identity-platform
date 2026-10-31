import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator'

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

export class ClaimWebhookDeliveryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  public deliveryId!: string
}

export class AttachCheckRunDto {
  @ApiProperty()
  @IsString()
  public checkRunId!: string
}
