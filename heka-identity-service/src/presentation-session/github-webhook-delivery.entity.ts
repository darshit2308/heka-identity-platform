import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

/** One GitHub webhook delivery id, kept long enough to ignore a redelivery. */
@Entity({ tableName: 'github_webhook_deliveries' })
export class GithubWebhookDelivery {
  @PrimaryKey({ type: 'string' })
  public id!: string

  @Property({ type: 'Date' })
  public createdAt: Date = new Date()
}
