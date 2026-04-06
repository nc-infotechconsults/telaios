import { type MigrationInterface, type QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateMessages1743897000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "messages",
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
            name: "role",
            type: "varchar",
          },
          {
            name: "content",
            type: "text",
          },
          {
            name: "created_at",
            type: "timestamptz",
            default: "now()",
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "messages",
      new TableForeignKey({
        columnNames: ["project_id"],
        referencedTableName: "projects",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("messages");
  }
}
