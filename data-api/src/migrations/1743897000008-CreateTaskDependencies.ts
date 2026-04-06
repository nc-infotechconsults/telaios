import { type MigrationInterface, type QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateTaskDependencies1743897000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "task_dependencies",
        columns: [
          {
            name: "task_id",
            type: "uuid",
            isPrimary: true,
          },
          {
            name: "depends_on_task_id",
            type: "uuid",
            isPrimary: true,
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "task_dependencies",
      new TableForeignKey({
        columnNames: ["task_id"],
        referencedTableName: "tasks",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("task_dependencies");
  }
}
