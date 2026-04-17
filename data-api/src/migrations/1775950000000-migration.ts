import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775950000000 implements MigrationInterface {
    name = 'Migration1775950000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── workspaces ────────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "workspaces" (
                "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
                "project_id"        uuid NOT NULL,
                "name"              character varying NOT NULL,
                "status"            character varying NOT NULL DEFAULT 'idle',
                "container_id"      character varying,
                "container_image"   character varying,
                "ide_url"           character varying,
                "ide_workspace_id"  character varying,
                "config"            jsonb NOT NULL DEFAULT '{}',
                "created_by"        uuid,
                "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at"        TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at"        TIMESTAMP,
                CONSTRAINT "PK_workspaces" PRIMARY KEY ("id"),
                CONSTRAINT "FK_workspaces_project" FOREIGN KEY ("project_id")
                    REFERENCES "projects"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_workspaces_user" FOREIGN KEY ("created_by")
                    REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        // ── environments ──────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "environments" (
                "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
                "project_id"        uuid NOT NULL,
                "name"              character varying NOT NULL,
                "type"              character varying NOT NULL DEFAULT 'kubernetes',
                "status"            character varying NOT NULL DEFAULT 'disconnected',
                "connection_config" text,
                "namespace"         character varying,
                "created_by"        uuid,
                "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at"        TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at"        TIMESTAMP,
                CONSTRAINT "PK_environments" PRIMARY KEY ("id"),
                CONSTRAINT "FK_environments_project" FOREIGN KEY ("project_id")
                    REFERENCES "projects"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_environments_user" FOREIGN KEY ("created_by")
                    REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        // ── helm_releases ─────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "helm_releases" (
                "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
                "environment_id"    uuid NOT NULL,
                "project_id"        uuid NOT NULL,
                "name"              character varying NOT NULL,
                "chart_repo_url"    character varying,
                "chart_name"        character varying NOT NULL,
                "chart_version"     character varying,
                "namespace"         character varying,
                "values_override"   jsonb,
                "status"            character varying NOT NULL DEFAULT 'pending',
                "release_notes"     text,
                "deployed_by"       uuid,
                "deployed_at"       TIMESTAMP,
                "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at"        TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_helm_releases" PRIMARY KEY ("id"),
                CONSTRAINT "FK_helm_releases_environment" FOREIGN KEY ("environment_id")
                    REFERENCES "environments"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_helm_releases_user" FOREIGN KEY ("deployed_by")
                    REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "helm_releases"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "environments"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "workspaces"`);
    }
}
