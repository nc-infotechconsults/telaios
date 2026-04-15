import type { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775941400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Phase 5: Add execution timing and metadata columns to tasks table
    await queryRunner.query(
      `ALTER TABLE "tasks"
        ADD COLUMN "started_at" TIMESTAMPTZ NULL,
        ADD COLUMN "completed_at" TIMESTAMPTZ NULL,
        ADD COLUMN "metadata" jsonb NULL`
    );

    // Phase 5: Create task_artifacts table for structured execution output
    await queryRunner.query(`
      CREATE TABLE "task_artifacts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "task_id" uuid NOT NULL,
        "type" varchar NOT NULL,
        "title" varchar NOT NULL,
        "content" text NOT NULL,
        "content_type" varchar NOT NULL DEFAULT 'text/plain',
        "metadata" jsonb NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "PK_task_artifacts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_task_artifacts_task" FOREIGN KEY ("task_id")
          REFERENCES "tasks"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_task_artifacts_task_id" ON "task_artifacts" ("task_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_task_artifacts_task_id"`);
    await queryRunner.query(`DROP TABLE "task_artifacts"`);
    await queryRunner.query(
      `ALTER TABLE "tasks"
        DROP COLUMN "metadata",
        DROP COLUMN "completed_at",
        DROP COLUMN "started_at"`
    );
  }
}
