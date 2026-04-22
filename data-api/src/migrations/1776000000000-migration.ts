import type { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1776000000000 implements MigrationInterface {
  name = "Migration1776000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old tables (order matters: FK refs first)
    await queryRunner.query(`DROP TABLE IF EXISTS "project_agents" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_profiles" CASCADE`);

    // library_agents
    await queryRunner.query(`
      CREATE TABLE "library_agents" (
        "id"                 uuid        NOT NULL DEFAULT gen_random_uuid(),
        "name"               varchar     NOT NULL,
        "slug"               varchar     NOT NULL,
        "description"        text        NULL,
        "agent_type"         varchar     NOT NULL DEFAULT 'custom',
        "role"               varchar     NULL,
        "system_prompt"      text        NULL,
        "system_prompt_mode" varchar     NOT NULL DEFAULT 'append',
        "llm_provider"       varchar     NULL,
        "llm_model"          varchar     NULL,
        "llm_temperature"    float       NULL,
        "llm_max_tokens"     integer     NULL,
        "sub_agents"         jsonb       NOT NULL DEFAULT '[]',
        "mcp_servers"        jsonb       NOT NULL DEFAULT '[]',
        "skills"             jsonb       NOT NULL DEFAULT '[]',
        "structured_output"  jsonb       NULL,
        "tags"               jsonb       NOT NULL DEFAULT '[]',
        "published_by"       varchar     NULL,
        "usage_count"        integer     NOT NULL DEFAULT 0,
        "version"            varchar     NOT NULL DEFAULT '1.0.0',
        "created_at"         TIMESTAMP   NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP   NOT NULL DEFAULT now(),
        "deleted_at"         TIMESTAMP   NULL,
        CONSTRAINT "PK_library_agents" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_library_agents_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_library_agents_role" ON "library_agents" ("role")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_library_agents_agent_type" ON "library_agents" ("agent_type")`
    );

    // library_mcps
    await queryRunner.query(`
      CREATE TABLE "library_mcps" (
        "id"           uuid        NOT NULL DEFAULT gen_random_uuid(),
        "name"         varchar     NOT NULL,
        "slug"         varchar     NOT NULL,
        "description"  text        NULL,
        "command"      varchar     NOT NULL,
        "args"         jsonb       NOT NULL DEFAULT '[]',
        "env"          jsonb       NOT NULL DEFAULT '{}',
        "tags"         jsonb       NOT NULL DEFAULT '[]',
        "published_by" varchar     NULL,
        "usage_count"  integer     NOT NULL DEFAULT 0,
        "version"      varchar     NOT NULL DEFAULT '1.0.0',
        "created_at"   TIMESTAMP   NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP   NOT NULL DEFAULT now(),
        "deleted_at"   TIMESTAMP   NULL,
        CONSTRAINT "PK_library_mcps" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_library_mcps_slug" UNIQUE ("slug")
      )
    `);

    // library_skills
    await queryRunner.query(`
      CREATE TABLE "library_skills" (
        "id"           uuid        NOT NULL DEFAULT gen_random_uuid(),
        "name"         varchar     NOT NULL,
        "slug"         varchar     NOT NULL,
        "description"  text        NULL,
        "content"      text        NOT NULL,
        "tags"         jsonb       NOT NULL DEFAULT '[]',
        "published_by" varchar     NULL,
        "usage_count"  integer     NOT NULL DEFAULT 0,
        "version"      varchar     NOT NULL DEFAULT '1.0.0',
        "created_at"   TIMESTAMP   NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP   NOT NULL DEFAULT now(),
        "deleted_at"   TIMESTAMP   NULL,
        CONSTRAINT "PK_library_skills" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_library_skills_slug" UNIQUE ("slug")
      )
    `);

    // project_agents (new schema — full config copy, no FK to library_agents on delete)
    await queryRunner.query(`
      CREATE TABLE "project_agents" (
        "id"                 uuid        NOT NULL DEFAULT gen_random_uuid(),
        "project_id"         uuid        NOT NULL,
        "library_agent_id"   uuid        NULL,
        "name"               varchar     NOT NULL,
        "role"               varchar     NOT NULL,
        "system_prompt"      text        NULL,
        "system_prompt_mode" varchar     NOT NULL DEFAULT 'append',
        "llm_provider"       varchar     NULL,
        "llm_model"          varchar     NULL,
        "llm_api_key"        varchar     NULL,
        "llm_base_url"       varchar     NULL,
        "llm_temperature"    float       NULL,
        "llm_max_tokens"     integer     NULL,
        "sub_agents"         jsonb       NOT NULL DEFAULT '[]',
        "mcp_servers"        jsonb       NOT NULL DEFAULT '[]',
        "skills"             jsonb       NOT NULL DEFAULT '[]',
        "structured_output"  jsonb       NULL,
        "scope"              jsonb       NULL,
        "created_at"         TIMESTAMP   NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_project_agents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_project_agents_project"
          FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_project_agents_project_id" ON "project_agents" ("project_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_agents_library_agent_id" ON "project_agents" ("library_agent_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "project_agents" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "library_skills" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "library_mcps" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "library_agents" CASCADE`);
  }
}
