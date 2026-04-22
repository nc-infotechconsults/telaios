import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds remote/HTTP transport support to the library_mcps table:
 * - transport  varchar NOT NULL DEFAULT 'stdio'
 * - url        varchar NULL
 * - headers    jsonb   NOT NULL DEFAULT '{}'
 * - command becomes nullable (required only for stdio transport)
 */
export class Migration1776000200000 implements MigrationInterface {
  name = "Migration1776000200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "library_mcps" ADD COLUMN IF NOT EXISTS "transport" varchar NOT NULL DEFAULT 'stdio'`
    );
    await queryRunner.query(
      `ALTER TABLE "library_mcps" ADD COLUMN IF NOT EXISTS "url" varchar NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "library_mcps" ADD COLUMN IF NOT EXISTS "headers" jsonb NOT NULL DEFAULT '{}'`
    );
    // command is only required for stdio — make it nullable
    await queryRunner.query(
      `ALTER TABLE "library_mcps" ALTER COLUMN "command" DROP NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "library_mcps" ALTER COLUMN "command" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "library_mcps" DROP COLUMN IF EXISTS "headers"`
    );
    await queryRunner.query(
      `ALTER TABLE "library_mcps" DROP COLUMN IF EXISTS "url"`
    );
    await queryRunner.query(
      `ALTER TABLE "library_mcps" DROP COLUMN IF EXISTS "transport"`
    );
  }
}
