import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775960000000 implements MigrationInterface {
    name = 'Migration1775960000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── agent_profiles: configurable agent fields ─────────────────────────
        await queryRunner.query(`
            ALTER TABLE "agent_profiles"
                ADD COLUMN IF NOT EXISTS "system_prompt"        text,
                ADD COLUMN IF NOT EXISTS "system_prompt_mode"   character varying NOT NULL DEFAULT 'override',
                ADD COLUMN IF NOT EXISTS "llm_temperature"      double precision,
                ADD COLUMN IF NOT EXISTS "llm_max_tokens"       integer,
                ADD COLUMN IF NOT EXISTS "llm_top_p"            double precision,
                ADD COLUMN IF NOT EXISTS "llm_frequency_penalty" double precision,
                ADD COLUMN IF NOT EXISTS "llm_presence_penalty"  double precision,
                ADD COLUMN IF NOT EXISTS "sub_agent_ids"        jsonb NOT NULL DEFAULT '[]'
        `);

        // ── project_agents: expand role check constraint to include "custom" ──
        // Drop the existing constraint (if present) and recreate it.
        await queryRunner.query(`
            ALTER TABLE "project_agents"
                DROP CONSTRAINT IF EXISTS "project_agents_role_check"
        `);
        await queryRunner.query(`
            ALTER TABLE "project_agents"
                ADD CONSTRAINT "project_agents_role_check"
                CHECK (role IN ('planner','coder','reviewer','tester','infra','knowledge','custom'))
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "project_agents"
                DROP CONSTRAINT IF EXISTS "project_agents_role_check"
        `);
        await queryRunner.query(`
            ALTER TABLE "project_agents"
                ADD CONSTRAINT "project_agents_role_check"
                CHECK (role IN ('planner','coder','reviewer','tester','infra','knowledge'))
        `);

        await queryRunner.query(`
            ALTER TABLE "agent_profiles"
                DROP COLUMN IF EXISTS "sub_agent_ids",
                DROP COLUMN IF EXISTS "llm_presence_penalty",
                DROP COLUMN IF EXISTS "llm_frequency_penalty",
                DROP COLUMN IF EXISTS "llm_top_p",
                DROP COLUMN IF EXISTS "llm_max_tokens",
                DROP COLUMN IF EXISTS "llm_temperature",
                DROP COLUMN IF EXISTS "system_prompt_mode",
                DROP COLUMN IF EXISTS "system_prompt"
        `);
    }
}
