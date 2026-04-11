import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
  DeleteDateColumn,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Project } from "./Project.entity";
import { TaskRepository } from "./TaskRepository.entity";

export type RepositoryAuthType = "none" | "token" | "ssh";
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

  @Column({ nullable: true })
  remote_url!: string;

  @Column({ default: "main" })
  branch!: string;

  @Column({ type: "varchar", default: "none" })
  auth_type!: RepositoryAuthType;

  @Column({ nullable: true })
  credentials!: string;

  @Column({ nullable: true })
  local_clone_path!: string;

  @Column({ type: "varchar", default: "unconfigured" })
  status!: RepositoryStatus;

  @Column({ nullable: true })
  error_message!: string;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;

  @OneToMany(() => TaskRepository, (tr) => tr.repository)
  taskRepositories!: Relation<TaskRepository[]>;
}
