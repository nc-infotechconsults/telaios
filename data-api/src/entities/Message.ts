import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from "typeorm";
import { Project } from "./Project";

export type MessageRole = "user" | "assistant" | "system";

@Entity("messages")
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  project_id!: string;

  @ManyToOne(() => Project, (p) => p.messages, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Project;

  @Column()
  role!: MessageRole;

  @Column({ type: "text" })
  content!: string;

  @CreateDateColumn()
  created_at!: Date;
}
