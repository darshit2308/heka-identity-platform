import { Entity, Enum, Index, Property } from '@mikro-orm/decorators/legacy'

import { Identified } from 'common/entities/identified.entity'

export enum PresentationSessionState {
  Pending = 'pending',
  InProgress = 'in_progress',
  Success = 'success',
  Failure = 'failure',
  Timeout = 'timeout',
}

/**
 * One pull-request verification ticket. The wallet presents to Credo's OID4VP
 * endpoint. This row is the audit record and the GitHub check mapping.
 */
@Entity({ tableName: 'presentation_sessions' })
@Index({ properties: ['owner', 'repo', 'prNumber', 'headSha'] })
@Index({ properties: ['githubAccountId', 'state'] })
export class PresentationSession extends Identified {
  @Property({ type: 'string' })
  public githubAccountId!: string

  @Property({ type: 'string' })
  public githubUsername!: string

  @Property({ type: 'string' })
  public installationId!: string

  @Property({ type: 'string' })
  public owner!: string

  @Property({ type: 'string' })
  public repo!: string

  @Property({ type: 'number' })
  public prNumber!: number

  @Property({ type: 'string' })
  public headSha!: string

  @Property({ nullable: true, type: 'string' })
  public checkRunId?: string | null

  @Enum(() => PresentationSessionState)
  public state: PresentationSessionState = PresentationSessionState.Pending

  @Property({ nullable: true, type: 'text' })
  public authorizationRequestUri?: string | null

  @Property({ nullable: true, type: 'string' })
  public verificationSessionId?: string | null

  @Property({ nullable: true, type: 'string' })
  public trustedIssuerDid?: string | null

  @Property({ nullable: true, type: 'string' })
  public policyMode?: string | null

  @Property({ nullable: true, type: 'string' })
  public configWarning?: string | null

  @Property({ nullable: true, type: 'number' })
  public maxAgeSeconds?: number | null

  @Property({ nullable: true, type: 'Date' })
  public graceUntil?: Date | null

  @Property({ nullable: true, type: 'text' })
  public resolvedPolicy?: string | null

  @Property({ nullable: true, type: 'string' })
  public failureReason?: string | null

  @Property({ nullable: true, type: 'string' })
  public warning?: string | null

  @Property({ nullable: true, type: 'text' })
  public humanReason?: string | null

  /** Set when a recent successful presentation for the same account closed this pull request. */
  @Property({ nullable: true, type: 'string' })
  public satisfiedBySessionId?: string | null

  @Property({ type: 'Date' })
  public expiresAt!: Date

  @Property({ nullable: true, type: 'Date' })
  public completedAt?: Date | null

  @Property({ type: 'Date' })
  public createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date(), type: 'Date' })
  public updatedAt: Date = new Date()
}
