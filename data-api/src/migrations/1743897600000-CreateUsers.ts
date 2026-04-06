import { type MigrationInterface, type QueryRunner, Table } from "typeorm";

export class CreateUsers1743897600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "users",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "email",
            type: "varchar",
            isUnique: true,
          },
          {
            name: "password_hash",
            type: "varchar",
          },
          {
            name: "display_name",
            type: "varchar",
          },
          {
            name: "system_role",
            type: "varchar",
            default: "'member'",
          },
          {
            name: "is_active",
            type: "boolean",
            default: true,
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
    await queryRunner.dropTable("users");
  }
}
