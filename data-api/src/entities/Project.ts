import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import type { Relation } from "typeorm";
import { Repository } from "./Repository";
import { Plan } from "./Plan";
import { Message } from "./Message";
import { ProjectMember } from "./ProjectMember";

export type ProjectStatus = "planning" | "executing" | "done";

@Entity("projects")
export class Project {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description!: string;

  @Column({ type: "varchar", default: "planning" })
  status!: ProjectStatus;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => Repository, (r) => r.project, { cascade: true })
  repositories!: Relation<Repository[]>;

  @OneToMany(() => Plan, (p) => p.project, { cascade: true })
  plans!: Relation<Plan[]>;

  @OneToMany(() => Message, (m) => m.project, { cascade: true })
  messages!: Relation<Message[]>;

  @OneToMany(() => ProjectMember, (pm) => pm.project, { cascade: true })
  members!: Relation<ProjectMember[]>;
}
