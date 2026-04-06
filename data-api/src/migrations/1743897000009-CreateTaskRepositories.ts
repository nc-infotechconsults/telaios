import { type MigrationInterface, type QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateTaskRepositories1743897000009 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "task_repositories",
        columns: [
          {
            name: "task_id",
            type: "uuid",
            isPrimary: true,
          },
          {
            name: "repository_id",
            type: "uuid",
            isPrimary: true,
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "task_repositories",
      new TableForeignKey({
        columnNames: ["task_id"],
        referencedTableName: "tasks",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );

    await queryRunner.createForeignKey(
      "task_repositories",
      new TableForeignKey({
        columnNames: ["repository_id"],
        referencedTableName: "repositories",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("task_repositories");
  }
}
