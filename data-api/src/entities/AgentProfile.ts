import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
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

  @Column({ nullable: true })
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

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
