import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from "typeorm";
import type { Relation } from "typeorm";
import { Repository } from "./Repository.entity";
import { Plan } from "./Plan.entity";
import { Message } from "./Message.entity";
import { ProjectMember } from "./ProjectMember.entity";

export type ProjectStatus = "planning" | "executing" | "done";

@Entity("projects")
export class Project {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string;

  @Column({ type: "varchar", default: "planning" })
  status!: ProjectStatus;

  @CreateDateColumn()
  created_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;

  @OneToMany(() => Repository, (r) => r.project, { cascade: true })
  repositories!: Relation<Repository[]>;

  @OneToMany(() => Plan, (p) => p.project, { cascade: true })
  plans!: Relation<Plan[]>;

  @OneToMany(() => Message, (m) => m.project, { cascade: true })
  messages!: Relation<Message[]>;

  @OneToMany(() => ProjectMember, (pm) => pm.project, { cascade: true })
  members!: Relation<ProjectMember[]>;
}
