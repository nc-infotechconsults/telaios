import { MigrationInterface, QueryRunner } from "typeorm";

export class PlanTitleAndMessagePlanId1743898000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS title TEXT`);
    await queryRunner.query(
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE CASCADE`
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_messages_plan_id ON messages(plan_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_messages_plan_id`);
    await queryRunner.query(`ALTER TABLE messages DROP COLUMN IF EXISTS plan_id`);
    await queryRunner.query(`ALTER TABLE plans DROP COLUMN IF EXISTS title`);
  }
}
