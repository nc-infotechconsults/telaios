import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Replaces the remote/local source_type model with a cloud-native provider_type model.
 * Supported providers: github, gitlab, bitbucket, git, s3.
 * Adds S3-specific columns (bucket_name, region, endpoint).
 * Removes the local_path and source_type columns.
 */
export class Migration1776000500000 implements MigrationInterface {
  name = "Migration1776000500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "repositories" ADD COLUMN "provider_type" varchar NOT NULL DEFAULT 'git'`
    );
    await queryRunner.query(
      `ALTER TABLE "repositories" ADD COLUMN "bucket_name" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "repositories" ADD COLUMN "region" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "repositories" ADD COLUMN "endpoint" varchar`
    );

    // Migrate existing remote rows to the correct git provider
    await queryRunner.query(
      `UPDATE "repositories" SET "provider_type" = 'github'
       WHERE "source_type" = 'remote' AND "remote_url" LIKE '%github.com%'`
    );
    await queryRunner.query(
      `UPDATE "repositories" SET "provider_type" = 'gitlab'
       WHERE "source_type" = 'remote' AND "remote_url" LIKE '%gitlab.com%'`
    );
    await queryRunner.query(
      `UPDATE "repositories" SET "provider_type" = 'bitbucket'
       WHERE "source_type" = 'remote' AND "remote_url" LIKE '%bitbucket.org%'`
    );
    // Remaining remote rows default to 'git' (already set by column default)

    await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "local_path"`);
    await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "source_type"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "repositories" ADD COLUMN "source_type" varchar NOT NULL DEFAULT 'remote'`
    );
    await queryRunner.query(
      `ALTER TABLE "repositories" ADD COLUMN "local_path" varchar`
    );

    // All existing rows were remote/git-based; s3 rows have no source_type equivalent
    await queryRunner.query(`UPDATE "repositories" SET "source_type" = 'remote'`);

    await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "provider_type"`);
    await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "bucket_name"`);
    await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "region"`);
    await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "endpoint"`);
  }
}
