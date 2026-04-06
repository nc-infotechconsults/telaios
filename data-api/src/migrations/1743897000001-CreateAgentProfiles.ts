import { type MigrationInterface, type QueryRunner, Table } from "typeorm";

export class CreateAgentProfiles1743897000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "agent_profiles",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "name",
            type: "varchar",
          },
          {
            name: "description",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "agent_type",
            type: "varchar",
            default: "'langgraph'",
          },
          {
            name: "llm_provider",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "llm_model",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "llm_api_key",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "llm_base_url",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "github_token",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "mcp_servers",
            type: "jsonb",
            default: "'[]'",
          },
          {
            name: "skills",
            type: "jsonb",
            default: "'[]'",
          },
          {
            name: "created_at",
            type: "timestamptz",
            default: "now()",
          },
          {
            name: "updated_at",
            type: "timestamptz",
            default: "now()",
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("agent_profiles");
  }
}
