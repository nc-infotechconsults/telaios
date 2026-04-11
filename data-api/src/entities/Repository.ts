import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Project } from "./Project";
import { TaskRepository } from "./TaskRepository";

export type RepositoryAuthType = "none" | "token" | "ssh";
export type RepositorySourceType = "remote" | "local";
export type RepositoryStatus =
  | "unconfigured"
  | "cloning"
  | "ready"
  | "error";

@Entity("repositories")
export class Repository {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  project_id!: string;

  @ManyToOne(() => Project, (p) => p.repositories, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Relation<Project>;

  @Column()
  name!: string;

  @Column({ type: "varchar", default: "remote" })
  source_type!: RepositorySourceType;

  @Column({ nullable: true })
  remote_url!: string;

  @Column({ default: "main" })
  branch!: string;

  @Column({ type: "varchar", default: "none" })
  auth_type!: RepositoryAuthType;

  @Column({ nullable: true })
  credentials!: string;

  @Column({ nullable: true })
  local_path!: string;

  @Column({ type: "varchar", default: "unconfigured" })
  status!: RepositoryStatus;

  @Column({ nullable: true })
  error_message!: string;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => TaskRepository, (tr) => tr.repository)
  taskRepositories!: Relation<TaskRepository[]>;
}
