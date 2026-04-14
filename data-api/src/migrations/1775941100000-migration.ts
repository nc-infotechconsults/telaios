import type { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775941100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id"               uuid              NOT NULL DEFAULT gen_random_uuid(),
        "project_id"       uuid              NOT NULL,
        "name"             varchar           NOT NULL,
        "file_type"        varchar           NOT NULL,
        "mime_type"        varchar           NOT NULL,
        "s3_key"           varchar           NOT NULL,
        "size_bytes"       bigint            NOT NULL,
        "checksum_sha256"  varchar           NOT NULL,
        "status"           varchar           NOT NULL DEFAULT 'uploading',
        "error_message"    text              NULL,
        "metadata"         jsonb             NULL,
        "uploaded_by"      uuid              NULL,
        "created_at"       TIMESTAMP         NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP         NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP         NULL,
        CONSTRAINT "PK_documents" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_documents_s3_key" UNIQUE ("s3_key"),
        CONSTRAINT "FK_documents_project"
          FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_documents_user"
          FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_documents_project_id" ON "documents" ("project_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_documents_status" ON "documents" ("status")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_documents_file_type" ON "documents" ("file_type")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "documents"`);
  }
}
