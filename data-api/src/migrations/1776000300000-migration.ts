import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Extends library_skills with OpenCode skill package fields:
 * - license       varchar NULL
 * - compatibility varchar NULL
 * - skill_metadata jsonb NULL
 *
 * Creates library_skill_files table to store supporting files
 * (bash scripts, reference markdown, etc.) for a skill package.
 * A partial unique index enforces (skill_id, path) uniqueness
 * among non-deleted rows, so soft-deleted files can be re-created
 * at the same path.
 */
export class Migration1776000300000 implements MigrationInterface {
  name = "Migration1776000300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── New columns on library_skills ────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "library_skills" ADD COLUMN IF NOT EXISTS "license" varchar NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "library_skills" ADD COLUMN IF NOT EXISTS "compatibility" varchar NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "library_skills" ADD COLUMN IF NOT EXISTS "skill_metadata" jsonb NULL`
    );

    // ── library_skill_files table ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "library_skill_files" (
        "id"         uuid        NOT NULL DEFAULT gen_random_uuid(),
        "skill_id"   uuid        NOT NULL,
        "path"       varchar(255) NOT NULL,
        "content"    text        NOT NULL DEFAULT '',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "PK_library_skill_files" PRIMARY KEY ("id"),
        CONSTRAINT "FK_library_skill_files_skill"
          FOREIGN KEY ("skill_id")
          REFERENCES "library_skills" ("id")
          ON DELETE CASCADE
      )
    `);

    // Partial unique index: (skill_id, path) must be unique among active rows
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_library_skill_files_skill_path_active"
        ON "library_skill_files" ("skill_id", "path")
        WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_library_skill_files_skill_path_active"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "library_skill_files"`);
    await queryRunner.query(
      `ALTER TABLE "library_skills" DROP COLUMN IF EXISTS "skill_metadata"`
    );
    await queryRunner.query(
      `ALTER TABLE "library_skills" DROP COLUMN IF EXISTS "compatibility"`
    );
    await queryRunner.query(
      `ALTER TABLE "library_skills" DROP COLUMN IF EXISTS "license"`
    );
  }
}
