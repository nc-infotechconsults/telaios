import type { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775941000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "project_agents" (
        "id"               uuid              NOT NULL DEFAULT gen_random_uuid(),
        "project_id"       uuid              NOT NULL,
        "agent_profile_id" uuid              NOT NULL,
        "role"             varchar           NOT NULL,
        "scope"            jsonb             NULL,
        "assigned_at"      TIMESTAMP         NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP         NULL,
        CONSTRAINT "PK_project_agents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_project_agents_project"
          FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_agents_agent_profile"
          FOREIGN KEY ("agent_profile_id") REFERENCES "agent_profiles"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_project_agents_project_id" ON "project_agents" ("project_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_agents_agent_profile_id" ON "project_agents" ("agent_profile_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "project_agents"`);
  }
}
