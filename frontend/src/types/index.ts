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

export type ProjectRole = "owner" | "editor" | "viewer";
export type ProjectStatus = "planning" | "executing" | "done";
export type PlanStatus = "draft" | "confirmed" | "executing" | "completed" | "failed";
export type TaskStatus = "pending" | "ready" | "in_progress" | "done" | "failed" | "cancelled" | "skipped";
export type TaskType = "code" | "test" | "review" | "general" | "knowledge" | "infra";
export type ArtifactType = "diff" | "test_result" | "review" | "log" | "file" | "link";
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

export interface ProjectMember {
  user_id: string;
  project_id: string;
  role: ProjectRole;
  joined_at: string;
  user: Pick<User, "id" | "email" | "display_name">;
}

export type RepositoryProviderType = "github" | "gitlab" | "bitbucket" | "git" | "s3";

export interface Repository {
  id: string;
  project_id: string;
  name: string;
  provider_type: RepositoryProviderType;
  // Git fields
  remote_url?: string;
  branch?: string;
  auth_type: "none" | "token" | "ssh";
  has_credentials: boolean;
  // S3 fields
  bucket_name?: string;
  region?: string;
  endpoint?: string;
  // Common
  status: RepoStatus;
  error_message?: string;
  updated_at: string;
}

export type RepoTestCode =
  | "OK"
  | "INVALID_URL"
  | "INVALID_PATH"
  | "TIMEOUT"
  | "AUTH_FAILED"
  | "BRANCH_NOT_FOUND"
  | "NOT_A_REPO"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export interface RepositoryTestResult {
  ok: boolean;
  code: RepoTestCode;
  message: string;
  default_branch?: string;
}

export interface Plan {
  id: string;
  project_id: string;
  title?: string | null;
  status: PlanStatus;
  failure_reason?: string | null;
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
  started_at?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  depends_on_task_ids?: string[];
  repository_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskArtifact {
  id: string;
  task_id: string;
  type: ArtifactType;
  title: string;
  content: string;
  content_type: string;
  metadata?: Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
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

export type McpToolPermission = "read" | "write" | "execute" | "require-confirmation";

/**
 * Per-tool configuration stored on an McpServer entry.
 * When `tools` is undefined or empty the agent sees all tools.
 */
export interface McpToolConfig {
  name: string;
  description?: string;
  /** JSON Schema for the tool's input parameters (from MCP tools/list). */
  inputSchema?: Record<string, unknown>;
  /** Whether the tool is allowed (true) or blocked (false). Defaults to true. */
  allowed: boolean;
  /** Fine-grained permission tags. */
  permissions?: McpToolPermission[];
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
  /** Per-tool access config. Undefined/empty = all tools allowed with no restrictions. */
  tools?: McpToolConfig[];
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

/**
 * A lightweight skill entry stored directly on an agent definition.
 * Contains just the SKILL.md content as a string — no JSON schema overhead.
 */
export interface InlineSkill {
  name: string;
  description: string;
  content: string;
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
  system_prompt?: string | null;
  system_prompt_mode?: "override" | "extend";
  sub_agent_ids?: string[];
  /** Optional JSON Schema for structured output — null means free-form text. */
  structured_output?: JsonSchema | null;
  mcp_servers: McpServer[];
  skills: Skill[];
  created_at: string;
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

// ── Project Agents ────────────────────────────────────────────────────────────

export type AgentRole =
  | "planner"
  | "coder"
  | "reviewer"
  | "tester"
  | "infra"
  | "knowledge"
  | "custom"
  | "document-copilot";

/** A sub-agent wired as a named LangChain tool. */
export interface SubAgentEntry {
  agent_id: string;
  tool_name: string;
  tool_description: string;
}

/** An agent template in the community library. */
export interface LibraryAgent {
  id: string;
  name: string;
  slug: string;
  description: string;
  agent_type: "system" | "custom";
  role: AgentRole;
  system_prompt: string | null;
  system_prompt_mode: "append" | "override";
  llm_provider?: string | null;
  llm_model?: string | null;
  llm_temperature?: number | null;
  llm_max_tokens?: number | null;
  has_llm_api_key?: boolean;
  sub_agents: SubAgentEntry[];
  mcp_servers: McpServer[];
  skills: InlineSkill[];
  structured_output?: JsonSchema | null;
  tags: string[];
  published_by?: string | null;
  usage_count: number;
  version: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

/** A standalone MCP server configuration in the library. */
export interface LibraryMCP {
  id: string;
  name: string;
  slug: string;
  description: string;
  transport: "stdio" | "streamable-http";
  /** Present when transport = stdio */
  command?: string | null;
  args: string[];
  env: Record<string, string>;
  /** Present when transport = streamable-http */
  url?: string | null;
  headers: Record<string, string>;
  tags: string[];
  published_by?: string | null;
  usage_count: number;
  version: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

/** A supporting file within a skill package (e.g. bash scripts, reference docs). */
export interface LibrarySkillFile {
  id: string;
  skill_id: string;
  path: string;
  content: string;
  created_at: string;
  updated_at: string;
}

/** A standalone skill definition in the library. */
export interface LibrarySkill {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** SKILL.md body (frontmatter is generated server-side from other fields). */
  content: string;
  tags: string[];
  published_by?: string | null;
  usage_count: number;
  version: string;
  license?: string | null;
  compatibility?: string | null;
  skill_metadata?: Record<string, string> | null;
  /** Supporting files included in the skill package. Populated on single-item fetch. */
  files?: LibrarySkillFile[];
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * A project-scoped agent — a full independent copy of a library agent.
 * No live reference to the library after cloning.
 */
export interface ProjectAgent {
  id: string;
  project_id: string;
  /** Source library template (informational only — not a live reference). */
  library_agent_id?: string | null;
  name: string;
  role: AgentRole;
  system_prompt?: string | null;
  system_prompt_mode: "append" | "override";
  llm_provider?: string | null;
  llm_model?: string | null;
  llm_temperature?: number | null;
  llm_max_tokens?: number | null;
  sub_agents: SubAgentEntry[];
  mcp_servers: McpServer[];
  skills: InlineSkill[];
  structured_output?: JsonSchema | null;
  scope?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Workspaces ────────────────────────────────────────────────────────────────

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

export interface Workspace {
  id: string;
  project_id: string;
  name: string;
  status: WorkspaceStatus;
  container_id?: string;
  container_image?: string;
  ide_url?: string;
  ide_workspace_id?: string;
  config: WorkspaceConfig;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// ── Environments ──────────────────────────────────────────────────────────────

export type EnvironmentType = "kubernetes" | "docker";
export type EnvironmentStatus = "connected" | "disconnected" | "error";
export type HelmReleaseStatus = "pending" | "deployed" | "failed" | "uninstalled";

export interface Environment {
  id: string;
  project_id: string;
  name: string;
  type: EnvironmentType;
  status: EnvironmentStatus;
  namespace?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface HelmRelease {
  id: string;
  environment_id: string;
  project_id: string;
  name: string;
  chart_name: string;
  chart_repo_url?: string;
  chart_version?: string;
  namespace?: string;
  values_override?: Record<string, unknown>;
  status: HelmReleaseStatus;
  release_notes?: string;
  deployed_by?: string;
  deployed_at?: string;
  created_at: string;
}

export interface K8sResource {
  name: string;
  namespace: string;
  kind: string;
  status: string;
  age: string;
  labels: Record<string, string>;
}

// ── Docker Resources ──────────────────────────────────────────────────────────

export type DockerContainerState = "running" | "exited" | "paused" | "created" | "restarting" | "dead";

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: DockerContainerState;
  ports: Array<{ host: number | null; container: number; protocol: string }>;
  created: string;
  command?: string;
}

export interface DockerImage {
  id: string;
  tags: string[];
  size: number;
  created: string;
  repository?: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
  scope: string;
  labels: Record<string, string>;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
  ipam?: { subnet: string; gateway: string };
  containers: number;
  created: string;
}

export interface DockerVolumeFileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  path: string;
}

export interface DockerVolumeFileContent {
  content: string;
  encoding: "text" | "binary";
  size: number;
  path: string;
}

// ── Kubernetes PVC File Browser Types ─────────────────────────────────────────

export interface K8sPVCFileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  path: string;
}

export interface K8sPVCFileContent {
  content: string;
  encoding: "text" | "binary";
  size: number;
  path: string;
}

// ── Docker Action Types ───────────────────────────────────────────────────────

export interface DockerPortMapping {
  host: number;
  container: number;
  protocol?: string;
}

export interface DockerVolumeMount {
  source?: string;
  container_path: string;
  read_only?: boolean;
}

export interface DockerCreateContainerOptions {
  image: string;
  name?: string;
  cmd?: string[];
  env?: Record<string, string>;
  ports?: DockerPortMapping[];
  volumes?: DockerVolumeMount[];
  network?: string;
  auto_remove?: boolean;
  start?: boolean;
}

export interface DockerExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface DockerContainerStats {
  container_id: string;
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  block_read: number;
  block_write: number;
  pids: number;
}

export interface DockerPruneResult {
  removed: string[];
  reclaimed_bytes: number;
}

// ── Documents ─────────────────────────────────────────────────────────────────

export type DocumentFileType = "pdf" | "docx" | "xlsx" | "md" | "txt" | "csv" | "json" | "other";
export type DocumentStatus = "uploading" | "processing" | "ready" | "error";

export interface Document {
  id: string;
  project_id: string;
  name: string;
  file_type: DocumentFileType;
  mime_type: string;
  s3_key: string;
  size_bytes: number;
  checksum_sha256: string;
  status: DocumentStatus;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  folder_id: string | null;
  current_version_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Document Folders ──────────────────────────────────────────────────────────

export interface DocumentFolder {
  id: string;
  project_id: string;
  parent_folder_id: string | null;
  name: string;
  path: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Document Versions ─────────────────────────────────────────────────────────

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  s3_key: string;
  size_bytes: number;
  checksum_sha256: string;
  change_description: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Document Tags ─────────────────────────────────────────────────────────────

export interface DocumentTag {
  id: string;
  project_id: string;
  name: string;
  color: string;
  created_at: string;
}

// ── Document Comments ─────────────────────────────────────────────────────────

export type CommentAnchorType = "page" | "cell" | "text_range" | "general";

export interface DocumentComment {
  id: string;
  document_id: string;
  user_id: string | null;
  content: string;
  anchor_type: CommentAnchorType;
  anchor_data: Record<string, unknown> | null;
  resolved: boolean;
  parent_comment_id: string | null;
  author?: Pick<User, "id" | "email" | "display_name"> | null;
  created_at: string;
  updated_at: string;
}

// ── Document Activity ─────────────────────────────────────────────────────────

export type DocumentActivityAction =
  | "created"
  | "viewed"
  | "edited"
  | "commented"
  | "shared"
  | "deleted"
  | "restored"
  | "version_created";

export interface DocumentActivityItem {
  id: string;
  document_id: string;
  user_id: string | null;
  action: DocumentActivityAction;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user_name?: string;
  document_name?: string;
}

// ── Document Templates ────────────────────────────────────────────────────────

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string | null;
  file_type: DocumentFileType;
  s3_key: string | null;
  category: string | null;
  is_global: boolean;
  project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

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
  | { type: "chat_tool_use"; tool: string; input: Record<string, unknown> }
  // ── Agent lifecycle events ────────────────────────────────────────────────
  | { type: "agent_started"; task_id: string; agent_role: string; agent_profile_id?: string }
  | { type: "agent_completed"; task_id: string; agent_role: string }
  | { type: "agent_failed"; task_id: string; agent_role: string; error?: string }
  // ── Pipeline events ───────────────────────────────────────────────────────
  | { type: "pipeline_step_started"; plan_id: string; step: string; step_index: number; total_steps: number }
  | { type: "pipeline_complete"; plan_id: string; pipeline: string }
  | { type: "pipeline_failed"; plan_id: string; step: string; step_index: number }
  // ── Plan lifecycle events ─────────────────────────────────────────────────
  | { type: "plan_executing"; plan_id: string }
  | { type: "plan_completed"; plan_id: string }
  | { type: "plan_failed"; plan_id: string; reason?: string }
  // ── Document events ──────────────────────────────────────────────────────
  | { type: "document_created"; document_id: string; name: string }
  | { type: "document_updated"; document_id: string; name: string }
  | { type: "document_deleted"; document_id: string }
  | { type: "document_processing_complete"; document_id: string; name: string };

// ─── LLM Providers ───────────────────────────────────────────────────────────

export interface LlmProviderDefinition {
  id: string;
  name: string;
  type: "cloud" | "onprem";
  models: string[];
  needs_api_key: boolean;
  needs_base_url: boolean;
  openai_compat: boolean;
}
