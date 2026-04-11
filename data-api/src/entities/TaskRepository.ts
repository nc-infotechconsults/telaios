import { Entity, ManyToOne, PrimaryColumn, JoinColumn } from "typeorm";
import type { Relation } from "typeorm";
import { Task } from "./Task";
import { Repository } from "./Repository";

@Entity("task_repositories")
export class TaskRepository {
  @PrimaryColumn()
  task_id!: string;

  @PrimaryColumn()
  repository_id!: string;

  @ManyToOne(() => Task, (t) => t.taskRepositories, { onDelete: "CASCADE" })
  @JoinColumn({ name: "task_id" })
  task!: Relation<Task>;

  @ManyToOne(() => Repository, (r) => r.taskRepositories, { onDelete: "CASCADE" })
  @JoinColumn({ name: "repository_id" })
  repository!: Relation<Repository>;
}
