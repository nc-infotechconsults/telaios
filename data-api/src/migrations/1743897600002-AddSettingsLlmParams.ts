import { type MigrationInterface, type QueryRunner } from "typeorm";

export class AddSettingsLlmParams1743897600002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE settings
        ADD COLUMN IF NOT EXISTS llm_temperature double precision,
        ADD COLUMN IF NOT EXISTS llm_max_tokens integer,
        ADD COLUMN IF NOT EXISTS llm_top_p double precision,
        ADD COLUMN IF NOT EXISTS llm_frequency_penalty double precision,
        ADD COLUMN IF NOT EXISTS llm_presence_penalty double precision
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE settings
        DROP COLUMN IF EXISTS llm_temperature,
        DROP COLUMN IF EXISTS llm_max_tokens,
        DROP COLUMN IF EXISTS llm_top_p,
        DROP COLUMN IF EXISTS llm_frequency_penalty,
        DROP COLUMN IF EXISTS llm_presence_penalty
    `);
  }
}
