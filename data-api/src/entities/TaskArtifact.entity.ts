import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  DeleteDateColumn,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Task } from "./Task.entity";

export type ArtifactType = "diff" | "test_result" | "review" | "log" | "file" | "link";

@Entity("task_artifacts")
export class TaskArtifact {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  task_id!: string;

  @ManyToOne(() => Task, (t) => t.artifacts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "task_id" })
  task!: Relation<Task>;

  @Column({ type: "varchar" })
  type!: ArtifactType;

  @Column({ type: "varchar" })
  title!: string;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "varchar", default: "text/plain" })
  content_type!: string;

  @Column({ type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ default: 0 })
  sort_order!: number;

  @CreateDateColumn()
  created_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
