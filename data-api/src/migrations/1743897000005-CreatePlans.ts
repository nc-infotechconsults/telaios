import { type MigrationInterface, type QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreatePlans1743897000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "plans",
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
            name: "status",
            type: "varchar",
            default: "'draft'",
          },
          {
            name: "created_at",
            type: "timestamptz",
            default: "now()",
          },
          {
            name: "confirmed_at",
            type: "timestamptz",
            isNullable: true,
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "plans",
      new TableForeignKey({
        columnNames: ["project_id"],
        referencedTableName: "projects",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("plans");
  }
}
