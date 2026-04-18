import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775970000000 implements MigrationInterface {
  name = "Migration1775970000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_profiles" ADD "structured_output" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_profiles" DROP COLUMN "structured_output"`,
    );
  }
}
