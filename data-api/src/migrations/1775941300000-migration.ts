import type { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775941300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add failure_reason column to plans table for storing why a plan failed.
    // Note: status columns use varchar (not PostgreSQL enum types), so new enum
    // values ("failed", "cancelled", "skipped", "knowledge", "infra") are enforced
    // at the application layer only — no ALTER TYPE needed.
    await queryRunner.query(
      `ALTER TABLE "plans" ADD COLUMN "failure_reason" text NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plans" DROP COLUMN "failure_reason"`
    );
  }
}
