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
  transport: "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface Skill {
  name: string;
  description: string;
  parameters: Record<string, "string" | "number" | "boolean">;
  outputs?: Record<string, "string" | "number" | "boolean">;
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

  @Column({ default: "langgraph" })
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
