import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Plan } from "./Plan.entity";
import { AgentProfile } from "./AgentProfile.entity";
import { TaskDependency } from "./TaskDependency.entity";
import { TaskRepository } from "./TaskRepository.entity";
import { TaskArtifact } from "./TaskArtifact.entity";

export type TaskType = "code" | "test" | "review" | "general" | "knowledge" | "infra";
export type TaskStatus =
  | "pending"
  | "ready"
  | "in_progress"
  | "done"
  | "failed"
  | "cancelled"
  | "skipped";

@Entity("tasks")
export class Task {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  plan_id!: string;

  @ManyToOne(() => Plan, (p) => p.tasks, { onDelete: "CASCADE" })
  @JoinColumn({ name: "plan_id" })
  plan!: Relation<Plan>;

  @Column()
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string;

  @Column({ type: "varchar", default: "general" })
  type!: TaskType;

  @Column({ type: "varchar", default: "pending" })
  status!: TaskStatus;

  @Column({ default: 0 })
  execution_order!: number;

  @Column({ nullable: true })
  agent_profile_id!: string;

  @ManyToOne(() => AgentProfile, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "agent_profile_id" })
  agentProfile!: Relation<AgentProfile>;

  @Column({ nullable: true })
  assigned_instance_id!: string;

  @Column({ type: "text", nullable: true })
  result!: string;

  @Column({ type: "timestamptz", nullable: true })
  started_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  completed_at!: Date | null;

  @Column({ type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;

  @OneToMany(() => TaskDependency, (td) => td.task, { cascade: true })
  dependencies!: Relation<TaskDependency[]>;

  @OneToMany(() => TaskRepository, (tr) => tr.task, { cascade: true })
  taskRepositories!: Relation<TaskRepository[]>;

  @OneToMany(() => TaskArtifact, (a) => a.task)
  artifacts!: Relation<TaskArtifact[]>;
}
