import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";

export type AgentType = "system" | "custom";

export interface SubAgentEntry {
  agent_id: string;
  tool_name: string;
  tool_description: string;
}

export interface McpServer {
  name: string;
  transport: "stdio" | "streamable-http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  /** When set, only these tools are exposed to the agent; empty/undefined = all tools. */
  selected_tools?: string[];
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

export interface InlineSkill {
  name: string;
  description: string;
  content: string;
}

@Entity("library_agents")
export class LibraryAgent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ unique: true })
  slug!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", default: "custom" })
  agent_type!: AgentType;

  @Column({ type: "varchar", nullable: true })
  role!: string | null;

  @Column({ type: "text", nullable: true })
  system_prompt!: string | null;

  @Column({ type: "varchar", default: "append" })
  system_prompt_mode!: "append" | "override";

  @Column({ type: "varchar", nullable: true })
  llm_provider!: string | null;

  @Column({ type: "varchar", nullable: true })
  llm_model!: string | null;

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

  @Column({ type: "jsonb", default: "[]" })
  tags!: string[];

  @Column({ type: "varchar", nullable: true })
  published_by!: string | null;

  @Column({ type: "int", default: 0 })
  usage_count!: number;

  @Column({ type: "varchar", default: "1.0.0" })
  version!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
