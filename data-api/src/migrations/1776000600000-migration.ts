import type { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1776000600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "library_agents" ADD COLUMN IF NOT EXISTS "llm_api_key" text NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "library_agents" DROP COLUMN IF EXISTS "llm_api_key"`
    );
  }
}
