import { Migration } from '@mikro-orm/migrations'

export class Migration20261101120000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "presentation_sessions" add column "policy_mode" varchar(255) null;')
    this.addSql('alter table "presentation_sessions" add column "config_warning" varchar(255) null;')
    this.addSql('alter table "presentation_sessions" add column "max_age_seconds" int null;')
    this.addSql('alter table "presentation_sessions" add column "grace_until" timestamptz null;')
    this.addSql('alter table "presentation_sessions" add column "resolved_policy" text null;')
  }

  async down(): Promise<void> {
    this.addSql('alter table "presentation_sessions" drop column if exists "resolved_policy";')
    this.addSql('alter table "presentation_sessions" drop column if exists "grace_until";')
    this.addSql('alter table "presentation_sessions" drop column if exists "max_age_seconds";')
    this.addSql('alter table "presentation_sessions" drop column if exists "config_warning";')
    this.addSql('alter table "presentation_sessions" drop column if exists "policy_mode";')
  }
}
