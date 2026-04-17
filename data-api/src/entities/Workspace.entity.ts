import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Project } from "./Project.entity";
import { User } from "./User.entity";

export type WorkspaceStatus = "idle" | "starting" | "running" | "sleeping" | "error";

export interface WorkspaceConfig {
  repositories?: Record<string, { branch?: string; enabled?: boolean }>;
  env_vars?: Record<string, string>;
  devcontainer_overrides?: {
    image?: string;
    postCreateCommand?: string;
    extensions?: string[];
  };
  default_open_files?: string[];
  agent_profile_id?: string;
}

@Entity("workspaces")
export class Workspace {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  project_id!: string;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Relation<Project>;

  @Column()
  name!: string;

  @Column({ type: "varchar", default: "idle" })
  status!: WorkspaceStatus;

  @Column({ nullable: true })
  container_id!: string;

  @Column({ nullable: true })
  container_image!: string;

  @Column({ nullable: true })
  ide_url!: string;

  @Column({ nullable: true })
  ide_workspace_id!: string;

  @Column({ type: "jsonb", default: "{}" })
  config!: WorkspaceConfig;

  @Column({ nullable: true })
  created_by!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by" })
  creator!: Relation<User>;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
