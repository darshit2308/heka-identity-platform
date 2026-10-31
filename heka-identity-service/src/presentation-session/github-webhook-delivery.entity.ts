import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

export type WebhookJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * One GitHub webhook delivery. `completed` is set only after the App has
 * created the check run and attached it. A `processing` row whose lease has
 * expired is work the App must resume. GitHub will not redeliver that event.
 */
@Entity({ tableName: 'github_webhook_deliveries' })
export class GithubWebhookDelivery {
  @PrimaryKey({ type: 'string' })
  public id!: string

  @Property({ type: 'text' })
  public eventJson: string = '{}'

  @Property({ type: 'string' })
  public status: WebhookJobStatus = 'pending'

  @Property({ nullable: true, type: 'Date' })
  public leaseUntil?: Date | null

  @Property({ nullable: true, type: 'string' })
  public checkRunId?: string | null

  @Property({ type: 'Date' })
  public createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date(), type: 'Date' })
  public updatedAt: Date = new Date()
}
