import { type MigrationInterface, type QueryRunner, Table } from "typeorm";

export class CreateSettings1743897000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "settings",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            default: 1,
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
    await queryRunner.dropTable("settings");
  }
}
