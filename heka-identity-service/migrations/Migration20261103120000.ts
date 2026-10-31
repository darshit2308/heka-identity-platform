import { Migration } from '@mikro-orm/migrations'

export class Migration20261103120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`alter table "github_webhook_deliveries" add column "event_json" text not null default '{}';`)
    this.addSql(
      `alter table "github_webhook_deliveries" add column "status" varchar(32) not null default 'completed';`,
    )
    this.addSql(`alter table "github_webhook_deliveries" add column "lease_until" timestamptz null;`)
    this.addSql(`alter table "github_webhook_deliveries" add column "check_run_id" varchar(255) null;`)
    this.addSql(
      `alter table "github_webhook_deliveries" add column "updated_at" timestamptz not null default now();`,
    )
  }

  async down(): Promise<void> {
    this.addSql(`alter table "github_webhook_deliveries" drop column if exists "updated_at";`)
    this.addSql(`alter table "github_webhook_deliveries" drop column if exists "check_run_id";`)
    this.addSql(`alter table "github_webhook_deliveries" drop column if exists "lease_until";`)
    this.addSql(`alter table "github_webhook_deliveries" drop column if exists "status";`)
    this.addSql(`alter table "github_webhook_deliveries" drop column if exists "event_json";`)
  }
}
