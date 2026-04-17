import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Project } from "./Project.entity";
import { AgentProfile } from "./AgentProfile.entity";

export type AgentRole =
  | "planner"
  | "coder"
  | "reviewer"
  | "tester"
  | "infra"
  | "knowledge"
  | "custom"
  | "document-copilot";

/**
 * Junction entity — assigns an AgentProfile to a Project with a specific role.
 * Uses a generated UUID PK (unlike ProjectMember which uses a composite PK)
 * because agents may be assigned to the same project more than once with
 * different scopes in the future.
 */
@Entity("project_agents")
export class ProjectAgent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  project_id!: string;

  @Column()
  agent_profile_id!: string;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Relation<Project>;

  @ManyToOne(() => AgentProfile, { onDelete: "CASCADE" })
  @JoinColumn({ name: "agent_profile_id" })
  agent_profile!: Relation<AgentProfile>;

  @Column({ type: "varchar" })
  role!: AgentRole;

  /**
   * Optional JSON payload that constrains what this agent is allowed to act on
   * within the project (e.g. specific repos, directories, task types).
   */
  @Column({ type: "jsonb", nullable: true })
  scope!: Record<string, unknown> | null;

  @CreateDateColumn()
  assigned_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
