import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";

export type AgentType = "langgraph" | "opencode" | "github-copilot";

export interface McpServer {
  name: string;
  transport: "stdio" | "streamable-http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface JsonSchemaProperty {
  type: string | string[];
  description?: string;
  enum?: (string | number | boolean)[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  default?: unknown;
}

export interface JsonSchema {
  type: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface Skill {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: McpToolAnnotations;
  instructions: string;
}

@Entity("agent_profiles")
export class AgentProfile {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string;

  @Column({ type: "varchar", default: "langgraph" })
  agent_type!: AgentType;

  @Column({ nullable: true })
  llm_provider!: string;

  @Column({ nullable: true })
  llm_model!: string;

  @Column({ nullable: true })
  llm_api_key!: string;

  @Column({ nullable: true })
  llm_base_url!: string;

  @Column({ nullable: true })
  github_token!: string;

  @Column({ type: "jsonb", default: "[]" })
  mcp_servers!: McpServer[];

  @Column({ type: "jsonb", default: "[]" })
  skills!: Skill[];

  /** User-authored system prompt. Replaces or extends the built-in agent prompt. */
  @Column({ type: "text", nullable: true })
  system_prompt!: string | null;

  /**
   * Controls how `system_prompt` is applied.
   * - `"override"` — fully replaces the built-in prompt.
   * - `"extend"`   — appended after the built-in prompt.
   */
  @Column({ type: "varchar", default: "override" })
  system_prompt_mode!: "override" | "extend";

  @Column({ type: "float", nullable: true })
  llm_temperature!: number | null;

  @Column({ type: "int", nullable: true })
  llm_max_tokens!: number | null;

  @Column({ type: "float", nullable: true })
  llm_top_p!: number | null;

  @Column({ type: "float", nullable: true })
  llm_frequency_penalty!: number | null;

  @Column({ type: "float", nullable: true })
  llm_presence_penalty!: number | null;

  /**
   * UUIDs of other `AgentProfile` records this agent may delegate work to.
   * Resolved at execution time — no FK constraint to keep things flexible.
   */
  @Column({ type: "jsonb", default: "[]" })
  sub_agent_ids!: string[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
