import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  DeleteDateColumn,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Project } from "./Project.entity";
import { Task } from "./Task.entity";

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
  project!: Relation<Project>;

  @Column({ type: "text", nullable: true })
  title!: string | null;

  @Column({ type: "varchar", default: "draft" })
  status!: PlanStatus;

  @CreateDateColumn()
  created_at!: Date;

  @Column({ nullable: true })
  confirmed_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;

  @OneToMany(() => Task, (t) => t.plan, { cascade: true })
  tasks!: Relation<Task[]>;
}
