import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Project } from "./Project.entity";
import type {
  SubAgentEntry,
  McpServer,
  InlineSkill,
  JsonSchema,
} from "./LibraryAgent.entity";

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
 * A full independent copy of a library agent scoped to a project.
 * Created by cloning a LibraryAgent or directly. No live reference to the library after cloning.
 */
@Entity("project_agents")
export class ProjectAgent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  project_id!: string;

  /**
   * The library agent this was cloned from (informational only — no live sync).
   * Null for agents created directly without a library template.
   */
  @Column({ type: "varchar", nullable: true })
  library_agent_id!: string | null;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Relation<Project>;

  @Column()
  name!: string;

  @Column({ type: "varchar" })
  role!: AgentRole;

  @Column({ type: "text", nullable: true })
  system_prompt!: string | null;

  @Column({ type: "varchar", default: "append" })
  system_prompt_mode!: "append" | "override";

  @Column({ type: "varchar", nullable: true })
  llm_provider!: string | null;

  @Column({ type: "varchar", nullable: true })
  llm_model!: string | null;

  /** Encrypted at rest. Decryption is handled by the agent-service, not the data-api. */
  @Column({ type: "varchar", nullable: true })
  llm_api_key!: string | null;

  @Column({ type: "varchar", nullable: true })
  llm_base_url!: string | null;

  @Column({ type: "float", nullable: true })
  llm_temperature!: number | null;

  @Column({ type: "int", nullable: true })
  llm_max_tokens!: number | null;

  @Column({ type: "jsonb", default: "[]" })
  sub_agents!: SubAgentEntry[];

  @Column({ type: "jsonb", default: "[]" })
  mcp_servers!: McpServer[];

  @Column({ type: "jsonb", default: "[]" })
  skills!: InlineSkill[];

  @Column({ type: "jsonb", nullable: true })
  structured_output!: JsonSchema | null;

  /**
   * Optional JSON payload that constrains what this agent is allowed to act on
   * within the project (e.g. specific repos, directories, task types).
   */
  @Column({ type: "jsonb", nullable: true })
  scope!: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
