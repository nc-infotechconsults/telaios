import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { User } from "./User";
import { Project } from "./Project";

export type ProjectRole = "owner" | "editor" | "viewer";

@Entity("project_members")
export class ProjectMember {
  @PrimaryColumn()
  user_id!: string;

  @PrimaryColumn()
  project_id!: string;

  @ManyToOne(() => User, (u) => u.projectMemberships, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @ManyToOne(() => Project, (p) => p.members, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Relation<Project>;

  @Column({ type: "varchar", default: "viewer" })
  role!: ProjectRole;

  @CreateDateColumn()
  joined_at!: Date;
}
