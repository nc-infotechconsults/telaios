import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775960100000 implements MigrationInterface {
    name = 'Migration1775960100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "document_folders" (
                "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
                "project_id"        uuid NOT NULL,
                "parent_folder_id"  uuid,
                "name"              character varying NOT NULL,
                "path"              character varying NOT NULL,
                "created_by"        uuid,
                "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at"        TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at"        TIMESTAMP,
                CONSTRAINT "PK_document_folders" PRIMARY KEY ("id"),
                CONSTRAINT "FK_document_folders_project" FOREIGN KEY ("project_id")
                    REFERENCES "projects"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_document_folders_parent" FOREIGN KEY ("parent_folder_id")
                    REFERENCES "document_folders"("id") ON DELETE SET NULL,
                CONSTRAINT "FK_document_folders_user" FOREIGN KEY ("created_by")
                    REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "document_versions" (
                "id"                  uuid NOT NULL DEFAULT uuid_generate_v4(),
                "document_id"         uuid NOT NULL,
                "version_number"      integer NOT NULL,
                "s3_key"              character varying NOT NULL,
                "size_bytes"          bigint NOT NULL,
                "checksum_sha256"     character varying NOT NULL,
                "change_description"  text,
                "created_by"          uuid,
                "created_at"          TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_document_versions" PRIMARY KEY ("id"),
                CONSTRAINT "FK_document_versions_document" FOREIGN KEY ("document_id")
                    REFERENCES "documents"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_document_versions_user" FOREIGN KEY ("created_by")
                    REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "document_tags" (
                "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
                "project_id"  uuid NOT NULL,
                "name"        character varying NOT NULL,
                "color"       character varying NOT NULL DEFAULT '#3B82F6',
                "created_at"  TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_document_tags" PRIMARY KEY ("id"),
                CONSTRAINT "FK_document_tags_project" FOREIGN KEY ("project_id")
                    REFERENCES "projects"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "document_document_tags" (
                "document_id"  uuid NOT NULL,
                "tag_id"       uuid NOT NULL,
                CONSTRAINT "PK_document_document_tags" PRIMARY KEY ("document_id", "tag_id"),
                CONSTRAINT "FK_document_document_tags_document" FOREIGN KEY ("document_id")
                    REFERENCES "documents"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_document_document_tags_tag" FOREIGN KEY ("tag_id")
                    REFERENCES "document_tags"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "document_comments" (
                "id"                 uuid NOT NULL DEFAULT uuid_generate_v4(),
                "document_id"        uuid NOT NULL,
                "user_id"            uuid,
                "content"            text NOT NULL,
                "anchor_type"        character varying NOT NULL DEFAULT 'general',
                "anchor_data"        jsonb,
                "resolved"           boolean NOT NULL DEFAULT false,
                "parent_comment_id"  uuid,
                "created_at"         TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at"         TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_document_comments" PRIMARY KEY ("id"),
                CONSTRAINT "FK_document_comments_document" FOREIGN KEY ("document_id")
                    REFERENCES "documents"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_document_comments_user" FOREIGN KEY ("user_id")
                    REFERENCES "users"("id") ON DELETE SET NULL,
                CONSTRAINT "FK_document_comments_parent" FOREIGN KEY ("parent_comment_id")
                    REFERENCES "document_comments"("id") ON DELETE SET NULL
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "document_activities" (
                "id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
                "document_id"  uuid NOT NULL,
                "user_id"      uuid,
                "action"       character varying NOT NULL,
                "metadata"     jsonb,
                "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_document_activities" PRIMARY KEY ("id"),
                CONSTRAINT "FK_document_activities_document" FOREIGN KEY ("document_id")
                    REFERENCES "documents"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_document_activities_user" FOREIGN KEY ("user_id")
                    REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "document_templates" (
                "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name"        character varying NOT NULL,
                "description" text,
                "file_type"   character varying NOT NULL,
                "s3_key"      character varying,
                "category"    character varying,
                "is_global"   boolean NOT NULL DEFAULT true,
                "project_id"  uuid,
                "created_by"  uuid,
                "created_at"  TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at"  TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_document_templates" PRIMARY KEY ("id"),
                CONSTRAINT "FK_document_templates_project" FOREIGN KEY ("project_id")
                    REFERENCES "projects"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_document_templates_user" FOREIGN KEY ("created_by")
                    REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "document_favorites" (
                "document_id"  uuid NOT NULL,
                "user_id"      uuid NOT NULL,
                "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_document_favorites" PRIMARY KEY ("document_id", "user_id"),
                CONSTRAINT "FK_document_favorites_document" FOREIGN KEY ("document_id")
                    REFERENCES "documents"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_document_favorites_user" FOREIGN KEY ("user_id")
                    REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "documents"
                ADD COLUMN IF NOT EXISTS "folder_id" uuid,
                ADD COLUMN IF NOT EXISTS "current_version_id" uuid
        `);

        await queryRunner.query(`
            ALTER TABLE "documents"
                ADD CONSTRAINT "FK_documents_folder" FOREIGN KEY ("folder_id")
                    REFERENCES "document_folders"("id") ON DELETE SET NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "documents"
                ADD CONSTRAINT "FK_documents_current_version" FOREIGN KEY ("current_version_id")
                    REFERENCES "document_versions"("id") ON DELETE SET NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "FK_documents_current_version"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "FK_documents_folder"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "current_version_id"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "folder_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "document_favorites"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "document_templates"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "document_activities"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "document_comments"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "document_document_tags"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "document_tags"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "document_versions"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "document_folders"`);
    }
}
