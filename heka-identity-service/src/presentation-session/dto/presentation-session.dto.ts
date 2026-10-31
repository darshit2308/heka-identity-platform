import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

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

export class AttachCheckRunDto {
  @ApiProperty()
  @IsString()
  public checkRunId!: string
}
