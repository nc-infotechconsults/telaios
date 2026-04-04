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
  remote_url: string;
  branch: string;
  auth_type: "none" | "token" | "ssh";
  has_credentials: boolean;
  local_clone_path?: string;
  status: RepoStatus;
  error_message?: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  project_id: string;
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
  role: MessageRole;
  content: string;
  created_at: string;
}

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
  updated_at: string;
}

// WebSocket event payloads
export type WsEvent =
  | { type: "chat_token"; token: string }
  | { type: "plan_draft"; plan: Plan }
  | { type: "plan_confirmed"; plan_id: string }
  | { type: "repo_status"; repo_id: string; repo_name: string; status: RepoStatus; message?: string }
  | { type: "task_status"; task_id: string; status: TaskStatus; agent_instance_id?: string; agent_profile_id?: string }
  | { type: "agent_status"; instance_id: string; profile_id: string; status: string; task_id?: string };
