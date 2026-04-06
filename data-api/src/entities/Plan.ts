import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  JoinColumn,
} from "typeorm";
import { Project } from "./Project";
import { Task } from "./Task";

export type PlanStatus =
  | "draft"
  | "confirmed"
  | "executing"
  | "completed";

@Entity("plans")
export class Plan {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  project_id!: string;

  @ManyToOne(() => Project, (p) => p.plans, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Project;

  @Column({ type: "text", nullable: true })
  title!: string | null;

  @Column({ default: "draft" })
  status!: PlanStatus;

  @CreateDateColumn()
  created_at!: Date;

  @Column({ nullable: true })
  confirmed_at!: Date;

  @OneToMany(() => Task, (t) => t.plan, { cascade: true })
  tasks!: Task[];
}
