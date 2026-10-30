import { Migration } from '@mikro-orm/migrations'

export class Migration20261030120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table "presentation_sessions" (
        "id" varchar(255) not null,
        "github_account_id" varchar(255) not null,
        "github_username" varchar(255) not null,
        "installation_id" varchar(255) not null,
        "owner" varchar(255) not null,
        "repo" varchar(255) not null,
        "pr_number" int not null,
        "head_sha" varchar(255) not null,
        "check_run_id" varchar(255) null,
        "state" varchar(255) not null default 'pending',
        "authorization_request_uri" text null,
        "verification_session_id" varchar(255) null,
        "trusted_issuer_did" varchar(255) null,
        "failure_reason" varchar(255) null,
        "warning" varchar(255) null,
        "human_reason" text null,
        "satisfied_by_session_id" varchar(255) null,
        "expires_at" timestamptz not null,
        "completed_at" timestamptz null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "presentation_sessions_pkey" primary key ("id")
      );
    `)
    this.addSql(
      'create index "presentation_sessions_owner_repo_pr_number_head_sha_index" on "presentation_sessions" ("owner", "repo", "pr_number", "head_sha");',
    )
    this.addSql(
      'create index "presentation_sessions_github_account_id_state_index" on "presentation_sessions" ("github_account_id", "state");',
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "presentation_sessions" cascade;')
  }
}
