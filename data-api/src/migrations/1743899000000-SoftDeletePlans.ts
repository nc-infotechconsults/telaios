import { MigrationInterface, QueryRunner } from "typeorm";

export class SoftDeletePlans1743899000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE plans ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE plans DROP COLUMN IF EXISTS deleted_at`);
  }
}
