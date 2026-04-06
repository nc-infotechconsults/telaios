export type SystemRole = "admin" | "member";

export interface User {
  id: string;
  email: string;
  display_name: string;
  system_role: SystemRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = "planning" | "executing" | "done";
export type PlanStatus = "draft" | "confirmed" | "executing" | "completed";
export type TaskStatus = "pending" | "ready" | "in_progress" | "done" | "failed";
export type TaskType = "code" | "test" | "review" | "general";
export type RepoStatus = "unconfigured" | "cloning" | "ready" | "error";
export type AgentType = "langgraph" | "opencode" | "github-copilot";
export type MessageRole = "user" | "assistant" | "system";

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  created_at: string;
}

export interface Repository {
  id: string;
  project_id: string;
  name: string;
  source_type: "remote" | "local";
  remote_url?: string;
  branch?: string;
  auth_type: "none" | "token" | "ssh";
  has_credentials: boolean;
  local_path?: string;
  local_clone_path?: string;
  status: RepoStatus;
  error_message?: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  project_id: string;
  title?: string | null;
  status: PlanStatus;
  created_at: string;
  confirmed_at?: string;
  tasks?: Task[];
}

export interface Task {
  id: string;
  plan_id: string;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  execution_order: number;
  agent_profile_id?: string;
  assigned_instance_id?: string;
  result?: string;
  depends_on_task_ids?: string[];
  repository_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskDependency {
  task_id: string;
  depends_on_task_id: string;
}

export interface Message {
  id: string;
  project_id: string;
  plan_id?: string | null;
  role: MessageRole;
  content: string;
  created_at: string;
}

export interface McpServer {
  name: string;
  /**
   * `"stdio"` – local process via stdin/stdout
   * `"streamable-http"` – remote HTTP + optional SSE streaming (per MCP spec)
   */
  transport: "stdio" | "streamable-http";
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // streamable-http
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

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  agent_type: AgentType;
  llm_provider?: string;
  llm_model?: string;
  llm_base_url?: string;
  has_llm_api_key?: boolean;
  has_github_token?: boolean;
  llm_temperature?: number;
  llm_max_tokens?: number;
  llm_top_p?: number;
  llm_frequency_penalty?: number;
  llm_presence_penalty?: number;
  mcp_servers: McpServer[];
  skills: Skill[];
  created_at: string;
  updated_at: string;
}

export interface Settings {
  id: number;
  llm_provider: string;
  llm_model: string;
  llm_base_url?: string;
  has_api_key?: boolean;
  llm_temperature?: number;
  llm_max_tokens?: number;
  llm_top_p?: number;
  llm_frequency_penalty?: number;
  llm_presence_penalty?: number;
  updated_at: string;
}

/** A plan-draft item that can appear inline in the chat conversation. */
export type PlanChatItem = {
  type: "plan-draft";
  /** Same as plan.id — used as the React key and to dispatch actions. */
  id: string;
  plan: Plan;
  tasks: Task[];
  /** 1-based sequential version number for display (v1, v2, …). */
  version: number;
};

/** Union of a regular chat message and an inline plan-draft card. */
export type ChatItem = Message | PlanChatItem;

// WebSocket event payloads
export type WsEvent =
  | { type: "chat_token"; content: string }
  | { type: "chat_end" }
  | { type: "chat_thinking" }
  | { type: "plan_draft"; plan: Plan & { tasks?: Task[] } }
  | { type: "plan_confirmed"; plan_id: string }
  | { type: "error"; message: string }
  | { type: "repo_status"; repo_id: string; repo_name: string; status: RepoStatus; message?: string }
  | { type: "task_status"; task_id: string; status: TaskStatus; agent_instance_id?: string; agent_profile_id?: string }
  | { type: "agent_status"; instance_id: string; profile_id: string; status: string; task_id?: string }
  | { type: "chat_tool_use"; tool: string; input: Record<string, unknown> };
