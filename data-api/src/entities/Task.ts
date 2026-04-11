import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Plan } from "./Plan";
import { AgentProfile } from "./AgentProfile";
import { TaskDependency } from "./TaskDependency";
import { TaskRepository } from "./TaskRepository";

export type TaskType = "code" | "test" | "review" | "general";
export type TaskStatus =
  | "pending"
  | "ready"
  | "in_progress"
  | "done"
  | "failed";

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

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => TaskDependency, (td) => td.task, { cascade: true })
  dependencies!: Relation<TaskDependency[]>;

  @OneToMany(() => TaskRepository, (tr) => tr.task, { cascade: true })
  taskRepositories!: Relation<TaskRepository[]>;
}
