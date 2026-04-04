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
  plan!: Plan;

  @Column()
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string;

  @Column({ default: "general" })
  type!: TaskType;

  @Column({ default: "pending" })
  status!: TaskStatus;

  @Column({ default: 0 })
  execution_order!: number;

  @Column({ nullable: true })
  agent_profile_id!: string;

  @ManyToOne(() => AgentProfile, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "agent_profile_id" })
  agentProfile!: AgentProfile;

  @Column({ nullable: true })
  assigned_instance_id!: string;

  @Column({ type: "text", nullable: true })
  result!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => TaskDependency, (td) => td.task, { cascade: true })
  dependencies!: TaskDependency[];

  @OneToMany(() => TaskRepository, (tr) => tr.task, { cascade: true })
  taskRepositories!: TaskRepository[];
}
