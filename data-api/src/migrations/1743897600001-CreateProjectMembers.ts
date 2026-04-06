import { type MigrationInterface, type QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateProjectMembers1743897600001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "project_members",
        columns: [
          {
            name: "user_id",
            type: "uuid",
            isPrimary: true,
          },
          {
            name: "project_id",
            type: "uuid",
            isPrimary: true,
          },
          {
            name: "role",
            type: "varchar",
            default: "'viewer'",
          },
          {
            name: "joined_at",
            type: "timestamptz",
            default: "now()",
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ["user_id"],
            referencedTableName: "users",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          }),
          new TableForeignKey({
            columnNames: ["project_id"],
            referencedTableName: "projects",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          }),
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("project_members");
  }
}
