import { type MigrationInterface, type QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateRepositories1743897000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "repositories",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "project_id",
            type: "uuid",
          },
          {
            name: "name",
            type: "varchar",
          },
          {
            name: "source_type",
            type: "varchar",
            default: "'remote'",
          },
          {
            name: "remote_url",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "branch",
            type: "varchar",
            default: "'main'",
          },
          {
            name: "auth_type",
            type: "varchar",
            default: "'none'",
          },
          {
            name: "credentials",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "local_path",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "status",
            type: "varchar",
            default: "'unconfigured'",
          },
          {
            name: "error_message",
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

    await queryRunner.createForeignKey(
      "repositories",
      new TableForeignKey({
        columnNames: ["project_id"],
        referencedTableName: "projects",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("repositories");
  }
}
