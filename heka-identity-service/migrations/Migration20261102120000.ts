import { Migration } from '@mikro-orm/migrations'

export class Migration20261102120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create unique index "presentation_sessions_one_open_per_commit"
        on "presentation_sessions" ("owner", "repo", "pr_number", "head_sha")
        where "state" in ('pending', 'in_progress');
    `)
    this.addSql(`
      create table "github_webhook_deliveries" (
        "id" varchar(255) not null,
        "created_at" timestamptz not null,
        constraint "github_webhook_deliveries_pkey" primary key ("id")
      );
    `)
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "github_webhook_deliveries" cascade;')
    this.addSql('drop index if exists "presentation_sessions_one_open_per_commit";')
  }
}
