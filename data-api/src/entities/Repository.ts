import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import { Project } from "./Project";
import { TaskRepository } from "./TaskRepository";

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
  project!: Project;

  @Column()
  name!: string;

  @Column()
  remote_url!: string;

  @Column({ default: "main" })
  branch!: string;

  @Column({ default: "none" })
  auth_type!: RepositoryAuthType;

  @Column({ nullable: true })
  credentials!: string;

  @Column({ nullable: true })
  local_clone_path!: string;

  @Column({ default: "unconfigured" })
  status!: RepositoryStatus;

  @Column({ nullable: true })
  error_message!: string;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => TaskRepository, (tr) => tr.repository)
  taskRepositories!: TaskRepository[];
}
