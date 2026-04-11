import { Entity, Column, ManyToOne, PrimaryColumn, JoinColumn } from "typeorm";
import type { Relation } from "typeorm";
import { Task } from "./Task";

@Entity("task_dependencies")
export class TaskDependency {
  @PrimaryColumn()
  task_id!: string;

  @PrimaryColumn()
  depends_on_task_id!: string;

  @ManyToOne(() => Task, (t) => t.dependencies, { onDelete: "CASCADE" })
  @JoinColumn({ name: "task_id" })
  task!: Relation<Task>;
}
