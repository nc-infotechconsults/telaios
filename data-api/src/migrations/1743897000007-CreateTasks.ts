import { type MigrationInterface, type QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateTasks1743897000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "tasks",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "plan_id",
            type: "uuid",
          },
          {
            name: "title",
            type: "varchar",
          },
          {
            name: "description",
            type: "text",
            isNullable: true,
          },
          {
            name: "type",
            type: "varchar",
            default: "'general'",
          },
          {
            name: "status",
            type: "varchar",
            default: "'pending'",
          },
          {
            name: "execution_order",
            type: "integer",
            default: 0,
          },
          {
            name: "agent_profile_id",
            type: "uuid",
            isNullable: true,
          },
          {
            name: "assigned_instance_id",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "result",
            type: "text",
            isNullable: true,
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

    await queryRunner.createForeignKey(
      "tasks",
      new TableForeignKey({
        columnNames: ["plan_id"],
        referencedTableName: "plans",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createForeignKey(
      "tasks",
      new TableForeignKey({
        columnNames: ["agent_profile_id"],
        referencedTableName: "agent_profiles",
        referencedColumnNames: ["id"],
        onDelete: "SET NULL",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("tasks");
  }
}
