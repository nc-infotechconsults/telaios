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
import { Project } from "./Project.entity";
import { Plan } from "./Plan.entity";

export type MessageRole = "user" | "assistant" | "system";

@Entity("messages")
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  project_id!: string;

  @ManyToOne(() => Project, (p) => p.messages, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Relation<Project>;

  @Column({ type: "uuid", nullable: true })
  plan_id!: string | null;

  @ManyToOne(() => Plan, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "plan_id" })
  plan!: Relation<Plan> | null;

  @Column({ type: "varchar" })
  role!: MessageRole;

  @Column({ type: "text" })
  content!: string;

  @CreateDateColumn()
  created_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
