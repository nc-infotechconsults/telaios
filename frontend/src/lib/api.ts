import axios from "axios";
import type {
  Project,
  Repository,
  RepositoryTestResult,
  Plan,
  Task,
  TaskArtifact,
  Message,
  DesignSession,
  DesignLayerType,
  DesignMessage,
  DesignArtifact,
  AgentProfile,
  ProjectAgent,
  LibraryAgent,
  LibraryMCP,
  LibrarySkill,
  ProjectMember,
  ProjectRole,
  User,
  Document,
  DocumentFolder,
  DocumentVersion,
  DocumentTag,
  DocumentComment,
  DocumentActivityItem,
  DocumentTemplate,
  Workspace,
  WorkspaceConfig,
  Environment,
  EnvironmentType,
  HelmRelease,
  K8sResource,
  DockerContainer,
  DockerImage,
  DockerVolume,
  DockerNetwork,
  DockerVolumeFileEntry,
  DockerVolumeFileContent,
  DockerCreateContainerOptions,
  DockerExecResult,
  DockerContainerStats,
  DockerPruneResult,
  K8sPVCFileEntry,
  K8sPVCFileContent,
  LlmProviderDefinition,
  ProjectAnalytics,
  OrgProjectSummary,
  AnalyticsPeriod,
  DocumentAnalytics,
  AppSettings,
  PatchSettingsPayload,
  ConversationMessage,
  ConversationHistoryResponse,
  ProjectSkill,
  ProjectMcp,
  KnowledgeStatus,
  AgentBaseProfile,
  AgentOverride,
  AgentOverrideUpsert,
  ResolvedAgentProfile,
} from "../types";
import * as demo from "../demo/data";
import { toast } from "./toast";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const TOKEN_KEY = "swe_auth_token";
const USER_KEY = "swe_auth_user";

/** Simulated network delay used in demo mode. */
function delay<T>(data: T, ms = 300): Promise<T> {
  return new Promise((res) => setTimeout(() => res(structuredClone(data) as T), ms));
}

const http = axios.create({ baseURL: "/api" });

// Attach JWT token to every request
http.interceptors.request.use((config) => {
  if (!DEMO) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// On 401 clear token, show toast, and redirect to login
http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!DEMO && err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      toast.warning("Session expired", "Please log in again");
      setTimeout(() => { window.location.href = "/login"; }, 1500);
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authLogin = (data: { email: string; password: string }): Promise<{ token: string; user: User }> =>
  http.post<{ token: string; user: User }>("/auth/login", data).then((r) => r.data);

export const authMe = (): Promise<User> =>
  http.get<User>("/auth/me").then((r) => r.data);

// ─── Users (admin) ────────────────────────────────────────────────────────────

export const listUsers = (): Promise<User[]> =>
  DEMO ? delay([]) : http.get<User[]>("/users").then((r) => r.data);

export const createUser = (data: { email: string; password: string; display_name: string }): Promise<{ token: string; user: User }> =>
  http.post<{ token: string; user: User }>("/auth/register", data).then((r) => r.data);

export const patchUser = (id: string, data: Partial<Pick<User, "display_name" | "system_role" | "is_active">>): Promise<User> =>
  http.patch<User>(`/users/${id}`, data).then((r) => r.data);

export const deleteUser = (id: string): Promise<void> =>
  http.delete(`/users/${id}`).then(() => undefined);

// ─── Projects ────────────────────────────────────────────────────────────────

export const getProjects = (params?: {
  q?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: Project[]; total: number; page: number; limit: number }> =>
  DEMO
    ? delay({ items: demo.PROJECTS, total: demo.PROJECTS.length, page: 1, limit: 20 })
    : http
        .get<{ items: Project[]; total: number; page: number; limit: number }>("/projects", { params })
        .then((r) => r.data);

export const createProject = (data: Partial<Project>): Promise<Project> =>
  DEMO
    ? delay<Project>({
        id: `demo-${Date.now()}`,
        name: data.name ?? "New Project",
        description: data.description ?? "",
        status: "active",
        created_at: new Date().toISOString(),
      })
    : http.post<Project>("/projects", data).then((r) => r.data);

export const updateProject = (id: string, data: Partial<Project>): Promise<Project> => {
  if (DEMO) {
    const existing = demo.PROJECTS.find((p) => p.id === id) ?? demo.PROJECTS[0];
    return delay<Project>({ ...existing, ...data });
  }
  return http.patch<Project>(`/projects/${id}`, data).then((r) => r.data);
};

export const deleteProject = (id: string): Promise<void> =>
  DEMO ? delay(undefined as unknown as void) : http.delete(`/projects/${id}`).then(() => undefined);

// ─── Project Members ──────────────────────────────────────────────────────────

export const listProjectMembers = (projectId: string): Promise<ProjectMember[]> =>
  DEMO ? delay([]) : http.get<ProjectMember[]>(`/projects/${projectId}/members`).then((r) => r.data);

export const addProjectMember = (
  projectId: string,
  data: { user_id: string; role?: ProjectRole },
): Promise<ProjectMember> =>
  DEMO
    ? delay<ProjectMember>({
        user_id: data.user_id,
        project_id: projectId,
        role: data.role ?? "viewer",
        joined_at: new Date().toISOString(),
        user: { id: data.user_id, email: "", display_name: "" },
      })
    : http.post<ProjectMember>(`/projects/${projectId}/members`, data).then((r) => r.data);

export const patchProjectMember = (
  projectId: string,
  userId: string,
  data: { role: ProjectRole },
): Promise<ProjectMember> =>
  DEMO
    ? delay<ProjectMember>({
        user_id: userId,
        project_id: projectId,
        role: data.role,
        joined_at: new Date().toISOString(),
        user: { id: userId, email: "", display_name: "" },
      })
    : http.patch<ProjectMember>(`/projects/${projectId}/members/${userId}`, data).then((r) => r.data);

export const removeProjectMember = (projectId: string, userId: string): Promise<void> =>
  DEMO
    ? delay(undefined as unknown as void)
    : http.delete(`/projects/${projectId}/members/${userId}`).then(() => undefined);

// ─── Repositories ────────────────────────────────────────────────────────────

export const getRepositories = (projectId: string): Promise<Repository[]> =>
  DEMO ? delay(demo.REPOSITORIES[projectId] ?? []) : http.get<Repository[]>(`/projects/${projectId}/repositories`).then((r) => r.data);

export const createRepository = (projectId: string, data: Partial<Repository>): Promise<Repository> =>
  DEMO
    ? delay<Repository>({
        id: `repo-${Date.now()}`,
        project_id: projectId,
        name: data.name ?? "new-repo",
        provider_type: data.provider_type ?? "git",
        remote_url: data.remote_url,
        branch: data.branch ?? "main",
        auth_type: data.auth_type ?? "none",
        has_credentials: false,
        bucket_name: data.bucket_name,
        region: data.region,
        endpoint: data.endpoint,
        status: "unconfigured",
        updated_at: new Date().toISOString(),
      })
    : http.post<Repository>(`/projects/${projectId}/repositories`, data).then((r) => r.data);

export const updateRepository = (projectId: string, id: string, data: Partial<Repository>): Promise<Repository> => {
  if (DEMO) {
    const existing = (demo.REPOSITORIES[projectId] ?? []).find((r) => r.id === id);
    return delay<Repository>({ ...(existing ?? {} as Repository), ...data });
  }
  return http.patch<Repository>(`/projects/${projectId}/repositories/${id}`, data).then((r) => r.data);
};

export const deleteRepository = (projectId: string, id: string): Promise<void> =>
  DEMO ? delay(undefined as unknown as void) : http.delete(`/projects/${projectId}/repositories/${id}`).then(() => undefined);

export const testRepository = (
  _projectId: string,
  data: Pick<Repository, "provider_type" | "remote_url" | "branch" | "auth_type" | "bucket_name" | "region" | "endpoint"> & { credentials?: string }
): Promise<RepositoryTestResult> =>
  DEMO
    ? delay<RepositoryTestResult>({ ok: true, code: "OK", message: "Demo: repository reachable", default_branch: data.branch ?? "main" })
    : http.post<RepositoryTestResult>("/repositories/test", data).then((r) => r.data);

// ─── Plans ───────────────────────────────────────────────────────────────────

export const getPlans = (projectId: string): Promise<Plan[]> =>
  DEMO ? delay(demo.PLANS[projectId] ?? []) : http.get<Plan[]>(`/projects/${projectId}/plans`).then((r) => r.data);

export const getPlan = (planId: string): Promise<Plan> =>
  DEMO
    ? delay((Object.values(demo.PLANS).flat() as Plan[]).find((p) => p.id === planId) ?? (Object.values(demo.PLANS).flat() as Plan[])[0])
    : http.get<Plan>(`/plans/${planId}`).then((r) => r.data);

export const createPlan = (projectId: string, title?: string): Promise<Plan> =>
  DEMO
    ? delay<Plan>({
        id: `plan-${Date.now()}`,
        project_id: projectId,
        title: title ?? null,
        status: "draft",
        created_at: new Date().toISOString(),
      })
    : http.post<Plan>(`/projects/${projectId}/plans`, { title }).then((r) => r.data);

export const deletePlan = (planId: string): Promise<void> =>
  DEMO ? delay(undefined) : http.delete(`/plans/${planId}`).then(() => undefined);

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const getTasks = (planId: string): Promise<Task[]> =>
  DEMO ? delay(demo.TASKS[planId] ?? []) : http.get<Task[]>(`/plans/${planId}/tasks`).then((r) => r.data);

export const listProjectTasks = (
  projectId: string,
  opts?: { limit?: number; status?: string },
): Promise<Task[]> =>
  DEMO
    ? delay([])
    : http
        .get<Task[]>(`/projects/${projectId}/tasks`, { params: opts })
        .then((r) => r.data);

export const retryTask = (taskId: string): Promise<Task> =>
  DEMO ? delay({} as Task) : http.post<Task>(`/tasks/${taskId}/retry`).then((r) => r.data);

export const cancelTask = (taskId: string): Promise<Task> =>
  DEMO ? delay({} as Task) : http.post<Task>(`/tasks/${taskId}/cancel`).then((r) => r.data);

export const cancelPlan = (planId: string): Promise<{ cancelled: number }> =>
  DEMO ? delay({ cancelled: 0 }) : http.post<{ cancelled: number }>(`/plans/${planId}/cancel`).then((r) => r.data);

export const resumePlan = (planId: string): Promise<void> =>
  DEMO ? delay(undefined) : http.post(`/plans/${planId}/resume`).then(() => undefined);

// ─── Task Artifacts ───────────────────────────────────────────────────────────

export const getTaskArtifacts = (taskId: string): Promise<TaskArtifact[]> =>
  DEMO ? delay([]) : http.get<TaskArtifact[]>(`/tasks/${taskId}/artifacts`).then((r) => r.data);

// ─── Messages ────────────────────────────────────────────────────────────────

export const getPlanMessages = (planId: string): Promise<Message[]> =>
  DEMO ? delay(demo.MESSAGES[planId] ?? []) : http.get<Message[]>(`/plans/${planId}/messages`).then((r) => r.data);

export const getMessages = (projectId: string): Promise<Message[]> =>
  DEMO ? delay(demo.MESSAGES[projectId] ?? []) : http.get<Message[]>(`/messages?project_id=${projectId}`).then((r) => r.data);

// ─── Design Chat ─────────────────────────────────────────────────────────────

export const listDesignSessions = (projectId: string): Promise<DesignSession[]> =>
  DEMO ? delay([]) : http.get<DesignSession[]>(`/projects/${projectId}/design/sessions`).then((r) => r.data);

export const createDesignSession = (projectId: string, title?: string, designer_agent_id?: string, layer_type?: DesignLayerType): Promise<DesignSession> =>
  DEMO
    ? delay<DesignSession>({
        id: `design-${Date.now()}`,
        project_id: projectId,
        title: title ?? null,
        designer_agent_id: designer_agent_id ?? null,
        status: "active",
        layer_type: layer_type ?? "general",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    : http.post<DesignSession>(`/projects/${projectId}/design/sessions`, { title, designer_agent_id, layer_type }).then((r) => r.data);

export const getDesignSession = (sessionId: string): Promise<DesignSession> =>
  DEMO
    ? delay<DesignSession>({
        id: sessionId,
        project_id: "demo",
        title: "Design Session",
        status: "active",
        layer_type: "general",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    : http.get<DesignSession>(`/design/sessions/${sessionId}`).then((r) => r.data);

export const patchDesignSession = (sessionId: string, designer_agent_id?: string | null): Promise<DesignSession> =>
  DEMO
    ? delay<DesignSession>({
        id: sessionId,
        project_id: "demo",
        title: "Design Session",
        designer_agent_id: designer_agent_id ?? null,
        status: "active",
        layer_type: "general",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    : http.patch<DesignSession>(`/design/sessions/${sessionId}`, { designer_agent_id }).then((r) => r.data);

export const getDesignMessages = (sessionId: string): Promise<DesignMessage[]> =>
  DEMO ? delay([]) : http.get<DesignMessage[]>(`/design/sessions/${sessionId}/messages`).then((r) => r.data);

export const getDesignArtifacts = (sessionId: string): Promise<DesignArtifact[]> =>
  DEMO ? delay([]) : http.get<DesignArtifact[]>(`/design/sessions/${sessionId}/artifacts`).then((r) => r.data);

// ─── LLM Providers ───────────────────────────────────────────────────────────

export const getLlmProviders = (): Promise<LlmProviderDefinition[]> =>
  DEMO ? delay([]) : http.get<LlmProviderDefinition[]>("/llm/providers").then((r) => r.data);

// ─── System Settings (admin) ──────────────────────────────────────────────────

export const getSettings = (): Promise<AppSettings> =>
  DEMO ? delay<AppSettings>({ id: 1, brand_name: "TelaiOS", brand_color: "#006FEE", logo_url: null, favicon_url: null, default_theme: "dark", density: "regular", glass_blur: 28, theme_preset: null, custom_theme: null, updated_at: new Date().toISOString() }) : http.get<AppSettings>("/settings").then((r) => r.data);

export const patchSettings = (data: PatchSettingsPayload): Promise<AppSettings> =>
  DEMO ? delay<AppSettings>({ id: 1, brand_name: data.brand_name ?? "TelaiOS", brand_color: data.brand_color ?? "#006FEE", logo_url: data.logo_url ?? null, favicon_url: data.favicon_url ?? null, default_theme: data.default_theme ?? "dark", density: data.density ?? "regular", glass_blur: data.glass_blur ?? 28, theme_preset: data.theme_preset ?? null, custom_theme: data.custom_theme ?? null, updated_at: new Date().toISOString() }) : http.patch<AppSettings>("/settings", data).then((r) => r.data);

// ─── Agent Profiles (legacy — retained for settings/admin pages) ──────────────

export const getAgentProfiles = (): Promise<AgentProfile[]> =>
  DEMO ? delay(demo.AGENT_PROFILES) : http.get<AgentProfile[]>("/agent-profiles").then((r) => r.data);

export const getAgentProfile = (id: string): Promise<AgentProfile> =>
  DEMO
    ? delay(demo.AGENT_PROFILES.find((p) => p.id === id) ?? demo.AGENT_PROFILES[0])
    : http.get<AgentProfile>(`/agent-profiles/${id}`).then((r) => r.data);

export const createAgentProfile = (data: Partial<AgentProfile>): Promise<AgentProfile> =>
  DEMO
    ? delay<AgentProfile>({
        id: `ap-${Date.now()}`,
        name: data.name ?? "New Profile",
        description: data.description ?? "",
        agent_type: data.agent_type ?? "langgraph",
        llm_provider: data.llm_provider,
        llm_model: data.llm_model,
        llm_base_url: data.llm_base_url,
        has_llm_api_key: false,
        has_github_token: false,
        mcp_servers: data.mcp_servers ?? [],
        skills: data.skills ?? [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    : http.post<AgentProfile>("/agent-profiles", data).then((r) => r.data);

export const updateAgentProfile = (id: string, data: Partial<AgentProfile>): Promise<AgentProfile> => {
  if (DEMO) {
    const existing = demo.AGENT_PROFILES.find((p) => p.id === id) ?? demo.AGENT_PROFILES[0];
    return delay<AgentProfile>({ ...existing, ...data, updated_at: new Date().toISOString() });
  }
  return http.patch<AgentProfile>(`/agent-profiles/${id}`, data).then((r) => r.data);
};

export const deleteAgentProfile = (id: string): Promise<void> =>
  DEMO ? delay(undefined as unknown as void) : http.delete(`/agent-profiles/${id}`).then(() => undefined);

export const discoverMcpTools = (
  serverConfig: Partial<import("../types").McpServer>
): Promise<Array<{ name: string; description?: string; inputSchema?: Record<string, unknown>; annotations?: import("../types").McpToolAnnotations }>> =>
  DEMO
    ? delay([
        { name: "read_file", description: "Read a file from the filesystem", inputSchema: { type: "object", properties: { path: { type: "string", description: "Absolute or relative path to the file" }, encoding: { type: "string", description: "Character encoding (default: utf-8)" } }, required: ["path"] }, annotations: { readOnlyHint: true } },
        { name: "write_file", description: "Write content to a file", inputSchema: { type: "object", properties: { path: { type: "string", description: "Target file path" }, content: { type: "string", description: "Content to write" } }, required: ["path", "content"] }, annotations: { destructiveHint: true } },
        { name: "list_directory", description: "List files in a directory", inputSchema: { type: "object", properties: { path: { type: "string", description: "Directory path to list" } }, required: ["path"] }, annotations: { readOnlyHint: true, idempotentHint: true } },
      ])
    : http
        .post<{ tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown>; annotations?: import("../types").McpToolAnnotations }> }>("/agent-profiles/mcp-discover", serverConfig)
        .then((r) => r.data.tools ?? []);

// ─── Agent Base Profiles & Overrides ─────────────────────────────────────────

// Global (no workspace scope) — used by workspace admin view at /agents
export const listAgentBaseProfiles = (): Promise<AgentBaseProfile[]> =>
  DEMO
    ? delay<AgentBaseProfile[]>([])
    : http.get<AgentBaseProfile[]>("/agent-base-profiles").then((r) => r.data);

export const listAgentOverrides = (): Promise<AgentOverride[]> =>
  DEMO
    ? delay<AgentOverride[]>([])
    : http.get<AgentOverride[]>("/agent-overrides").then((r) => r.data);

export const upsertAgentOverride = (
  baseProfileId: string,
  data: AgentOverrideUpsert
): Promise<AgentOverride> =>
  http.put<AgentOverride>(`/agent-overrides/${baseProfileId}`, data).then((r) => r.data);

export const deleteAgentOverride = (baseProfileId: string): Promise<void> =>
  http.delete(`/agent-overrides/${baseProfileId}`).then(() => undefined);

// Workspace-scoped variants (kept for project-level pages)
export const getAgentBaseProfiles = (workspaceId: string): Promise<AgentBaseProfile[]> =>
  DEMO
    ? delay<AgentBaseProfile[]>([])
    : http.get<AgentBaseProfile[]>(`/workspaces/${workspaceId}/agent-base-profiles`).then((r) => r.data);

export const getWorkspaceAgentOverrides = (workspaceId: string): Promise<AgentOverride[]> =>
  DEMO
    ? delay<AgentOverride[]>([])
    : http.get<AgentOverride[]>(`/workspaces/${workspaceId}/agent-overrides`).then((r) => r.data);

export const upsertWorkspaceAgentOverride = (
  workspaceId: string,
  baseProfileId: string,
  data: AgentOverrideUpsert
): Promise<AgentOverride> =>
  http
    .put<AgentOverride>(`/workspaces/${workspaceId}/agent-overrides/${baseProfileId}`, data)
    .then((r) => r.data);

export const deleteWorkspaceAgentOverride = (
  workspaceId: string,
  baseProfileId: string
): Promise<void> =>
  http
    .delete(`/workspaces/${workspaceId}/agent-overrides/${baseProfileId}`)
    .then(() => undefined);

export const getProjectAgentOverrides = (projectId: string): Promise<AgentOverride[]> =>
  DEMO
    ? delay<AgentOverride[]>([])
    : http.get<AgentOverride[]>(`/projects/${projectId}/agent-overrides`).then((r) => r.data);

export const upsertProjectAgentOverride = (
  projectId: string,
  baseProfileId: string,
  data: AgentOverrideUpsert
): Promise<AgentOverride> =>
  http
    .put<AgentOverride>(`/projects/${projectId}/agent-overrides/${baseProfileId}`, data)
    .then((r) => r.data);

export const deleteProjectAgentOverride = (
  projectId: string,
  baseProfileId: string
): Promise<void> =>
  http
    .delete(`/projects/${projectId}/agent-overrides/${baseProfileId}`)
    .then(() => undefined);

export const getResolvedAgentProfiles = (projectId: string): Promise<ResolvedAgentProfile[]> =>
  DEMO
    ? delay<ResolvedAgentProfile[]>([])
    : http
        .get<ResolvedAgentProfile[]>(`/projects/${projectId}/agent-profiles/resolved`)
        .then((r) => r.data);

// ─── Library Agents ───────────────────────────────────────────────────────────

export const listLibraryAgents = (params?: {
  q?: string;
  role?: string;
  tags?: string;
  page?: number;
  limit?: number;
}): Promise<LibraryAgent[]> =>
  DEMO
    ? delay([])
    : http
        .get<{ items: LibraryAgent[]; total: number; page: number; limit: number }>("/library/agents", { params })
        .then((r) => r.data.items);

export const getLibraryAgent = (id: string): Promise<LibraryAgent> =>
  http.get<LibraryAgent>(`/library/agents/${id}`).then((r) => r.data);

export const createLibraryAgent = (data: Partial<LibraryAgent>): Promise<LibraryAgent> =>
  http.post<LibraryAgent>("/library/agents", data).then((r) => r.data);

export const updateLibraryAgent = (id: string, data: Partial<LibraryAgent>): Promise<LibraryAgent> =>
  http.patch<LibraryAgent>(`/library/agents/${id}`, data).then((r) => r.data);

export const deleteLibraryAgent = (id: string): Promise<void> =>
  http.delete(`/library/agents/${id}`).then(() => undefined);

export const cloneLibraryAgent = (id: string): Promise<LibraryAgent> =>
  http.post<LibraryAgent>(`/library/agents/${id}/clone`).then((r) => r.data);

// ─── Library MCPs ─────────────────────────────────────────────────────────────

export const listLibraryMCPs = (params?: { q?: string }): Promise<LibraryMCP[]> =>
  DEMO
    ? delay([])
    : http
        .get<{ items: LibraryMCP[]; total: number; page: number; limit: number }>("/library/mcp", { params })
        .then((r) => r.data.items);

export const createLibraryMCP = (data: Partial<LibraryMCP>): Promise<LibraryMCP> =>
  http.post<LibraryMCP>("/library/mcp", data).then((r) => r.data);

export const updateLibraryMCP = (id: string, data: Partial<LibraryMCP>): Promise<LibraryMCP> =>
  http.patch<LibraryMCP>(`/library/mcp/${id}`, data).then((r) => r.data);

export const deleteLibraryMCP = (id: string): Promise<void> =>
  http.delete(`/library/mcp/${id}`).then(() => undefined);

// ─── Library Skills ───────────────────────────────────────────────────────────

export const listLibrarySkills = (params?: { q?: string }): Promise<LibrarySkill[]> =>
  DEMO
    ? delay([])
    : http
        .get<{ items: LibrarySkill[]; total: number; page: number; limit: number }>("/library/skills", { params })
        .then((r) => r.data.items);

export const getLibrarySkill = (id: string): Promise<LibrarySkill> =>
  http.get<LibrarySkill>(`/library/skills/${id}`).then((r) => r.data);

export const createLibrarySkill = (data: Partial<LibrarySkill>): Promise<LibrarySkill> =>
  http.post<LibrarySkill>("/library/skills", data).then((r) => r.data);

export const updateLibrarySkill = (id: string, data: Partial<LibrarySkill>): Promise<LibrarySkill> =>
  http.patch<LibrarySkill>(`/library/skills/${id}`, data).then((r) => r.data);

export const deleteLibrarySkill = (id: string): Promise<void> =>
  http.delete(`/library/skills/${id}`).then(() => undefined);

/** Trigger a zip download of the full skill package. */
export const exportLibrarySkill = async (id: string, slug: string): Promise<void> => {
  const response = await http.get(`/library/skills/${id}/download`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ─── Project Agents ───────────────────────────────────────────────────────────

export const listProjectAgents = (projectId: string): Promise<ProjectAgent[]> =>
  DEMO ? delay([]) : http.get<ProjectAgent[]>(`/projects/${projectId}/agents`).then((r) => r.data);

/** Clone a library agent into the project as an independent copy. */
export const cloneProjectAgentFromLibrary = (
  projectId: string,
  libraryAgentId: string,
): Promise<ProjectAgent> =>
  DEMO
    ? delay<ProjectAgent>({
        id: `pa-${Date.now()}`,
        project_id: projectId,
        library_agent_id: libraryAgentId,
        name: "Agent",
        role: "coder",
        system_prompt: null,
        system_prompt_mode: "append",
        sub_agents: [],
        mcp_servers: [],
        skills: [],
        has_llm_api_key: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    : http
        .post<ProjectAgent>(`/projects/${projectId}/agents/clone`, { library_agent_id: libraryAgentId })
        .then((r) => r.data);

/** Create a custom project agent without a library template. */
export const createProjectAgent = (
  projectId: string,
  data: Partial<Omit<ProjectAgent, "id" | "project_id" | "created_at" | "updated_at">>,
): Promise<ProjectAgent> =>
  DEMO
    ? delay<ProjectAgent>({
        id: `pa-${Date.now()}`,
        project_id: projectId,
        name: data.name ?? "Custom Agent",
        role: data.role ?? "coder",
        system_prompt: data.system_prompt ?? null,
        system_prompt_mode: data.system_prompt_mode ?? "append",
        sub_agents: data.sub_agents ?? [],
        mcp_servers: data.mcp_servers ?? [],
        skills: data.skills ?? [],
        has_llm_api_key: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    : http.post<ProjectAgent>(`/projects/${projectId}/agents`, data).then((r) => r.data);

export const updateProjectAgent = (
  projectId: string,
  agentId: string,
  data: Partial<Omit<ProjectAgent, "id" | "project_id" | "created_at" | "updated_at">>,
): Promise<ProjectAgent> =>
  http.patch<ProjectAgent>(`/projects/${projectId}/agents/${agentId}`, data).then((r) => r.data);

export const removeProjectAgent = (projectId: string, agentId: string): Promise<void> =>
  DEMO
    ? delay(undefined as unknown as void)
    : http.delete(`/projects/${projectId}/agents/${agentId}`).then(() => undefined);

// ─── Documents ────────────────────────────────────────────────────────────────

export const listDocuments = (projectId: string): Promise<Document[]> =>
  DEMO ? delay([]) : http.get<Document[]>(`/projects/${projectId}/documents`).then((r) => r.data);

export const getDocument = (_projectId: string, documentId: string): Promise<Document> =>
  http.get<Document>(`/documents/${documentId}`).then((r) => r.data);

export const uploadDocument = (projectId: string, file: File, folderId?: string | null): Promise<Document> => {
  if (DEMO) {
    return delay<Document>({
      id: `doc-${Date.now()}`,
      project_id: projectId,
      name: file.name,
      file_type: "other",
      mime_type: file.type,
      s3_key: "",
      size_bytes: file.size,
      checksum_sha256: "",
      status: "processing",
      error_message: null,
      metadata: null,
      folder_id: folderId ?? null,
      current_version_id: null,
      uploaded_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  const form = new FormData();
  form.append("file", file);
  return http
    .post<Document>(`/projects/${projectId}/documents/upload`, form, {
      params: folderId ? { folder_id: folderId } : undefined,
    })
    .then((r) => r.data);
};

export const deleteDocument = (_projectId: string, id: string): Promise<void> =>
  DEMO ? delay(undefined as unknown as void) : http.delete(`/documents/${id}`).then(() => undefined);

export const getDocumentDownloadUrl = (_projectId: string, id: string): Promise<string> =>
  DEMO
    ? delay("")
    : http.get<{ url: string }>(`/documents/${id}/download`).then((r) => r.data.url);

export const updateDocumentContent = async (_projectId: string, id: string, content: string): Promise<Document> => {
  if (DEMO) return delay({} as Document);
  try {
    return await http.put<Document>(`/documents/${id}/content`, { content }).then((r) => r.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new Error("Document editing is not enabled on the server yet.");
    }
    throw error;
  }
};

// ─── Document Folders ─────────────────────────────────────────────────────────

export const listFolders = (projectId: string, parentFolderId?: string | null): Promise<DocumentFolder[]> =>
  DEMO ? delay([]) : http.get<DocumentFolder[]>(`/projects/${projectId}/folders`, { params: parentFolderId ? { parent_folder_id: parentFolderId } : undefined }).then((r) => r.data);

export const listAllFolders = (projectId: string): Promise<DocumentFolder[]> =>
  DEMO ? delay([]) : http.get<DocumentFolder[]>(`/projects/${projectId}/folders`).then((r) => r.data);

export const createFolder = (projectId: string, data: { name: string; parent_folder_id?: string | null }): Promise<DocumentFolder> =>
  DEMO
    ? delay<DocumentFolder>({
        id: `folder-${Date.now()}`,
        project_id: projectId,
        parent_folder_id: data.parent_folder_id ?? null,
        name: data.name,
        path: `/${data.name}`,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    : http.post<DocumentFolder>(`/projects/${projectId}/folders`, data).then((r) => r.data);

export const patchFolder = (projectId: string, folderId: string, data: { name?: string; parent_folder_id?: string | null }): Promise<DocumentFolder> =>
  http.patch<DocumentFolder>(`/projects/${projectId}/folders/${folderId}`, data).then((r) => r.data);

export const deleteFolder = (projectId: string, folderId: string): Promise<void> =>
  http.delete(`/projects/${projectId}/folders/${folderId}`).then(() => undefined);

// ─── Document Versions ────────────────────────────────────────────────────────

export const listVersions = (_projectId: string, documentId: string): Promise<DocumentVersion[]> =>
  DEMO ? delay([]) : http.get<DocumentVersion[]>(`/documents/${documentId}/versions`).then((r) => r.data);

export const uploadVersion = (_projectId: string, documentId: string, file: File, changeDescription?: string): Promise<DocumentVersion> => {
  const form = new FormData();
  form.append("file", file);
  return http
    .post<DocumentVersion>(`/documents/${documentId}/versions`, form, {
      params: changeDescription ? { change_description: changeDescription } : undefined,
    })
    .then((r) => r.data);
};

export const getVersionDownloadUrl = (_projectId: string, documentId: string, versionId: string): Promise<string> =>
  http.get<{ url: string }>(`/documents/${documentId}/versions/${versionId}/download`).then((r) => r.data.url);

// ─── Document Tags ────────────────────────────────────────────────────────────

export const listTags = (projectId: string): Promise<DocumentTag[]> =>
  DEMO ? delay([]) : http.get<DocumentTag[]>(`/projects/${projectId}/tags`).then((r) => r.data);

export const createTag = (projectId: string, data: { name: string; color?: string }): Promise<DocumentTag> =>
  http.post<DocumentTag>(`/projects/${projectId}/tags`, data).then((r) => r.data);

export const deleteTag = (projectId: string, tagId: string): Promise<void> =>
  http.delete(`/projects/${projectId}/tags/${tagId}`).then(() => undefined);

export const getDocumentTags = async (_projectId: string, documentId: string): Promise<DocumentTag[]> => {
  if (DEMO) return delay([]);
  try {
    return await http.get<DocumentTag[]>(`/documents/${documentId}/tags`).then((r) => r.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return [];
    throw error;
  }
};

export const assignDocumentTag = (_projectId: string, documentId: string, tagId: string): Promise<void> =>
  http.post(`/documents/${documentId}/tags/${tagId}`).then(() => undefined);

export const unassignDocumentTag = (_projectId: string, documentId: string, tagId: string): Promise<void> =>
  http.delete(`/documents/${documentId}/tags/${tagId}`).then(() => undefined);

// ─── Document Comments ────────────────────────────────────────────────────────

export const listComments = (_projectId: string, documentId: string): Promise<DocumentComment[]> =>
  DEMO ? delay([]) : http.get<DocumentComment[]>(`/documents/${documentId}/comments`).then((r) => r.data);

export const createComment = (_projectId: string, documentId: string, data: { content: string; anchor_type?: string; parent_comment_id?: string | null }): Promise<DocumentComment> =>
  http.post<DocumentComment>(`/documents/${documentId}/comments`, data).then((r) => r.data);

export const patchComment = (_projectId: string, documentId: string, commentId: string, data: { content?: string; resolved?: boolean }): Promise<DocumentComment> =>
  http.patch<DocumentComment>(`/documents/${documentId}/comments/${commentId}`, data).then((r) => r.data);

export const deleteComment = (_projectId: string, documentId: string, commentId: string): Promise<void> =>
  http.delete(`/documents/${documentId}/comments/${commentId}`).then(() => undefined);

// ─── Document Activity ────────────────────────────────────────────────────────

export const listDocumentActivities = (_projectId: string, documentId: string): Promise<DocumentActivityItem[]> =>
  DEMO ? delay([]) : http.get<DocumentActivityItem[]>(`/documents/${documentId}/activity`).then((r) => r.data);

export const listProjectDocumentActivities = (projectId: string): Promise<DocumentActivityItem[]> =>
  DEMO ? delay([]) : http.get<DocumentActivityItem[]>(`/projects/${projectId}/activity/documents`).then((r) => r.data);

// ─── Document Templates ───────────────────────────────────────────────────────

export const listGlobalTemplates = (): Promise<DocumentTemplate[]> =>
  DEMO ? delay([]) : http.get<DocumentTemplate[]>("/templates").then((r) => r.data);

export const listProjectTemplates = (projectId: string): Promise<DocumentTemplate[]> =>
  DEMO ? delay([]) : http.get<DocumentTemplate[]>(`/projects/${projectId}/templates`).then((r) => r.data);

// ─── Document Favorites ───────────────────────────────────────────────────────

export const listFavorites = (projectId: string): Promise<string[]> =>
  DEMO
    ? delay([])
    : http
        .get<Array<{ document_id: string }>>(`/projects/${projectId}/favorites`)
        .then((r) => r.data.map((favorite) => favorite.document_id));

export const checkFavorite = async (projectId: string, documentId: string): Promise<boolean> => {
  if (DEMO) return delay(false);
  const favoriteIds = await listFavorites(projectId);
  return favoriteIds.includes(documentId);
};

export const addFavorite = (_projectId: string, documentId: string): Promise<void> =>
  http.post(`/documents/${documentId}/favorite`).then(() => undefined);

export const removeFavorite = (_projectId: string, documentId: string): Promise<void> =>
  http.delete(`/documents/${documentId}/favorite`).then(() => undefined);

// ─── Document Search ──────────────────────────────────────────────────────────

export const searchDocuments = async (projectId: string, params: { q?: string; type?: string; tag?: string }): Promise<Document[]> => {
  if (DEMO) return delay([]);
  try {
    return await http.get<Document[]>(`/projects/${projectId}/documents/search`, { params }).then((r) => r.data);
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error;
    const docs = await listDocuments(projectId);
    const normalizedQuery = params.q?.trim().toLowerCase();
    let filtered = docs;
    if (normalizedQuery) {
      filtered = filtered.filter((doc) => doc.name.toLowerCase().includes(normalizedQuery));
    }
    if (params.type) {
      filtered = filtered.filter((doc) => doc.file_type === params.type);
    }
    return filtered;
  }
};

// ─── Document Trash ───────────────────────────────────────────────────────────

export const listTrash = async (projectId: string): Promise<Document[]> => {
  if (DEMO) return delay([]);
  try {
    return await http.get<Document[]>(`/projects/${projectId}/documents/trash`).then((r) => r.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return [];
    throw error;
  }
};

export const restoreDocument = (_projectId: string, documentId: string): Promise<Document> =>
  http.post<Document>(`/documents/${documentId}/restore`).then((r) => r.data);

// ─── Document with folder update ─────────────────────────────────────────────

export const moveDocument = (_projectId: string, documentId: string, folderId: string | null): Promise<Document> =>
  http.patch<Document>(`/documents/${documentId}`, { folder_id: folderId }).then((r) => r.data);

// ─── Workspaces ───────────────────────────────────────────────────────────────

export const listWorkspaces = (projectId: string): Promise<Workspace[]> =>
  DEMO ? delay([]) : http.get<Workspace[]>(`/projects/${projectId}/workspaces`).then((r) => r.data);

export const createWorkspace = (
  projectId: string,
  data: { name: string; config?: WorkspaceConfig },
): Promise<Workspace> =>
  DEMO
    ? delay<Workspace>({
        id: `ws-${Date.now()}`,
        project_id: projectId,
        name: data.name,
        status: "idle",
        config: data.config ?? {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    : http.post<Workspace>(`/projects/${projectId}/workspaces`, data).then((r) => r.data);

export const getWorkspace = (id: string): Promise<Workspace> =>
  http.get<Workspace>(`/workspaces/${id}`).then((r) => r.data);

export const patchWorkspace = (id: string, data: Partial<Workspace>): Promise<Workspace> =>
  http.patch<Workspace>(`/workspaces/${id}`, data).then((r) => r.data);

export const deleteWorkspace = (id: string): Promise<void> =>
  http.delete(`/workspaces/${id}`).then(() => undefined);

export const launchWorkspace = (id: string): Promise<Workspace> =>
  http.post<Workspace>(`/workspaces/${id}/launch`).then((r) => r.data);

// ─── Environments ─────────────────────────────────────────────────────────────

export const listEnvironments = (projectId: string): Promise<Environment[]> =>
  DEMO ? delay([]) : http.get<Environment[]>(`/projects/${projectId}/environments`).then((r) => r.data);

export const createEnvironment = (
  projectId: string,
  data: {
    name: string;
    type: EnvironmentType;
    namespace?: string;
    connection_config?: Record<string, unknown>;
  },
): Promise<Environment> =>
  DEMO
    ? delay<Environment>({
        id: `env-${Date.now()}`,
        project_id: projectId,
        name: data.name,
        type: data.type,
        status: "disconnected",
        namespace: data.namespace,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    : http.post<Environment>(`/projects/${projectId}/environments`, data).then((r) => r.data);

export const getEnvironment = (id: string): Promise<Environment> =>
  http.get<Environment>(`/environments/${id}`).then((r) => r.data);

export const patchEnvironment = (id: string, data: Partial<Environment & { connection_config: Record<string, unknown> }>): Promise<Environment> =>
  http.patch<Environment>(`/environments/${id}`, data).then((r) => r.data);

export const deleteEnvironment = (id: string): Promise<void> =>
  http.delete(`/environments/${id}`).then(() => undefined);

export const testEnvironmentConnection = (id: string): Promise<{ ok: boolean; message?: string }> =>
  http.post<{ ok: boolean; message?: string }>(`/environments/${id}/test`).then((r) => r.data);

export const listEnvironmentResources = (
  id: string,
  kind: string,
  namespace = "default",
): Promise<K8sResource[]> =>
  http.get<K8sResource[]>(`/environments/${id}/resources`, { params: { kind, namespace } }).then((r) => r.data);

export const getEnvironmentResource = (
  id: string,
  kind: string,
  name: string,
  namespace = "default",
): Promise<unknown> =>
  http.get(`/environments/${id}/resources/${kind}/${name}`, { params: { namespace } }).then((r) => r.data);

export const getResourceLogs = (
  id: string,
  name: string,
  namespace = "default",
  container?: string,
): Promise<string> =>
  http.get(`/environments/${id}/resources/pods/${name}/logs`, { params: { namespace, container } }).then((r) => String(r.data));

export const listHelmReleases = (envId: string): Promise<HelmRelease[]> =>
  http.get<HelmRelease[]>(`/environments/${envId}/helm/releases`).then((r) => r.data);

export const installHelmChart = (
  envId: string,
  data: {
    release_name: string;
    chart_name: string;
    chart_repo_url?: string;
    chart_version?: string;
    namespace?: string;
    values_override?: Record<string, unknown>;
  },
): Promise<HelmRelease> =>
  http.post<HelmRelease>(`/environments/${envId}/helm/install`, data).then((r) => r.data);

export const uninstallHelmRelease = (envId: string, releaseName: string): Promise<void> =>
  http.delete(`/environments/${envId}/helm/releases/${releaseName}`).then(() => undefined);

export const upgradeHelmChart = (
  envId: string,
  releaseName: string,
  data: {
    chart_repo_url?: string;
    chart_name?: string;
    chart_version?: string;
    namespace?: string;
    values_override?: Record<string, unknown>;
  },
): Promise<HelmRelease> =>
  http.put<HelmRelease>(`/environments/${envId}/helm/releases/${releaseName}`, data).then((r) => r.data);

export const scanProjectCharts = (envId: string): Promise<Array<{ name: string; version: string; description: string; localPath?: string }>> =>
  http.get(`/environments/${envId}/helm/charts/scan`).then((r) => r.data as Array<{ name: string; version: string; description: string; localPath?: string }>);

// ─── Docker Engine ────────────────────────────────────────────────────────────

export const listDockerContainers = (envId: string): Promise<DockerContainer[]> =>
  http.get<DockerContainer[]>(`/environments/${envId}/docker/containers`).then((r) => r.data);

export const getDockerContainer = (envId: string, containerId: string): Promise<unknown> =>
  http.get(`/environments/${envId}/docker/containers/${containerId}`).then((r) => r.data);

export const createDockerShellTicket = (
  envId: string,
  containerId: string,
): Promise<{ ticket: string; expires_in: number }> =>
  http
    .post<{ ticket: string; expires_in: number }>(
      `/environments/${envId}/docker/shell/${encodeURIComponent(containerId)}/ticket`,
    )
    .then((r) => r.data);

export const startDockerContainer = (envId: string, containerId: string): Promise<void> =>
  http.post(`/environments/${envId}/docker/containers/${containerId}/start`).then(() => undefined);

export const stopDockerContainer = (envId: string, containerId: string): Promise<void> =>
  http.post(`/environments/${envId}/docker/containers/${containerId}/stop`).then(() => undefined);

export const restartDockerContainer = (envId: string, containerId: string): Promise<void> =>
  http.post(`/environments/${envId}/docker/containers/${containerId}/restart`).then(() => undefined);

export const removeDockerContainer = (envId: string, containerId: string): Promise<void> =>
  http.delete(`/environments/${envId}/docker/containers/${containerId}`).then(() => undefined);

export const getDockerContainerLogs = (envId: string, containerId: string): Promise<string> =>
  http.get(`/environments/${envId}/docker/containers/${containerId}/logs`).then((r) => String(r.data));

export const listDockerImages = (envId: string): Promise<DockerImage[]> =>
  http.get<DockerImage[]>(`/environments/${envId}/docker/images`).then((r) => r.data);

export const removeDockerImage = (envId: string, imageId: string): Promise<void> =>
  http.delete(`/environments/${envId}/docker/images/${imageId}`).then(() => undefined);

export const listDockerVolumes = (envId: string): Promise<DockerVolume[]> =>
  http.get<DockerVolume[]>(`/environments/${envId}/docker/volumes`).then((r) => r.data);

export const removeDockerVolume = (envId: string, volumeName: string): Promise<void> =>
  http.delete(`/environments/${envId}/docker/volumes/${volumeName}`).then(() => undefined);

export const listDockerNetworks = (envId: string): Promise<DockerNetwork[]> =>
  http.get<DockerNetwork[]>(`/environments/${envId}/docker/networks`).then((r) => r.data);

export const inspectDockerImage = (envId: string, imageId: string): Promise<unknown> =>
  http.get(`/environments/${envId}/docker/images/${encodeURIComponent(imageId)}/inspect`).then((r) => r.data);

export const inspectDockerNetwork = (envId: string, networkId: string): Promise<unknown> =>
  http.get(`/environments/${envId}/docker/networks/${encodeURIComponent(networkId)}/inspect`).then((r) => r.data);

export const inspectDockerVolume = (envId: string, volumeName: string): Promise<unknown> =>
  http.get(`/environments/${envId}/docker/volumes/${encodeURIComponent(volumeName)}/inspect`).then((r) => r.data);

export const listDockerVolumeFiles = (
  envId: string,
  volumeName: string,
  path: string,
): Promise<DockerVolumeFileEntry[]> =>
  http
    .get<DockerVolumeFileEntry[]>(
      `/environments/${envId}/docker/volumes/${encodeURIComponent(volumeName)}/files`,
      { params: { path } },
    )
    .then((r) => r.data);

export const downloadDockerVolumeFile = async (
  envId: string,
  volumeName: string,
  filePath: string,
): Promise<void> => {
  const response = await http.get(
    `/environments/${envId}/docker/volumes/${encodeURIComponent(volumeName)}/files/download`,
    { params: { path: filePath }, responseType: "blob" },
  );
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement("a");
  const fileName = filePath.split("/").filter(Boolean).pop() ?? "download";
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

export const getDockerVolumeFileContent = (
  envId: string,
  volumeName: string,
  filePath: string,
): Promise<DockerVolumeFileContent> =>
  http
    .get<DockerVolumeFileContent>(
      `/environments/${envId}/docker/volumes/${encodeURIComponent(volumeName)}/files/content`,
      { params: { path: filePath } },
    )
    .then((r) => r.data);

export const updateDockerVolumeFileContent = (
  envId: string,
  volumeName: string,
  filePath: string,
  content: string,
): Promise<void> =>
  http
    .put(
      `/environments/${envId}/docker/volumes/${encodeURIComponent(volumeName)}/files/content`,
      { path: filePath, content },
    )
    .then(() => undefined);


// ─── Kubernetes PVC File Browser ──────────────────────────────────────────────

export const listK8sPVCFiles = (
  envId: string,
  pvcName: string,
  namespace: string,
  path: string,
): Promise<K8sPVCFileEntry[]> =>
  http
    .get<K8sPVCFileEntry[]>(
      `/environments/${envId}/kubernetes/pvcs/${encodeURIComponent(pvcName)}/files`,
      { params: { namespace, path } },
    )
    .then((r) => r.data);

export const getK8sPVCFileContent = (
  envId: string,
  pvcName: string,
  namespace: string,
  path: string,
): Promise<K8sPVCFileContent> =>
  http
    .get<K8sPVCFileContent>(
      `/environments/${envId}/kubernetes/pvcs/${encodeURIComponent(pvcName)}/files/content`,
      { params: { namespace, path } },
    )
    .then((r) => r.data);

export const updateK8sPVCFileContent = (
  envId: string,
  pvcName: string,
  namespace: string,
  path: string,
  content: string,
): Promise<void> =>
  http
    .put(
      `/environments/${envId}/kubernetes/pvcs/${encodeURIComponent(pvcName)}/files/content`,
      { namespace, path, content },
    )
    .then(() => undefined);

export const downloadK8sPVCFile = async (
  envId: string,
  pvcName: string,
  namespace: string,
  filePath: string,
  fileName: string,
): Promise<void> => {
  const response = await http.get(
    `/environments/${envId}/kubernetes/pvcs/${encodeURIComponent(pvcName)}/files/download`,
    { params: { namespace, path: filePath }, responseType: "blob" },
  );
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

// ─── Docker Actions ───────────────────────────────────────────────────────────

export const createDockerContainer = (
  envId: string,
  opts: DockerCreateContainerOptions,
): Promise<{ id: string }> =>
  http.post<{ id: string }>(`/environments/${envId}/docker/containers`, opts).then((r) => r.data);

export const execDockerContainer = (
  envId: string,
  containerId: string,
  payload: { cmd: string[]; working_dir?: string; user?: string; timeout_ms?: number },
): Promise<DockerExecResult> =>
  http
    .post<DockerExecResult>(`/environments/${envId}/docker/containers/${containerId}/exec`, payload)
    .then((r) => r.data);

export const getDockerContainerStats = (
  envId: string,
  containerId: string,
): Promise<DockerContainerStats> =>
  http
    .get<DockerContainerStats>(`/environments/${envId}/docker/containers/${containerId}/stats`)
    .then((r) => r.data);

export const pullDockerImage = (
  envId: string,
  payload: { image: string; tag?: string; username?: string; password?: string },
): Promise<void> =>
  http.post(`/environments/${envId}/docker/images/pull`, payload).then(() => undefined);

export const tagDockerImage = (
  envId: string,
  imageId: string,
  payload: { repo: string; tag: string },
): Promise<void> =>
  http
    .post(`/environments/${envId}/docker/images/${encodeURIComponent(imageId)}/tag`, payload)
    .then(() => undefined);

export const pruneDockerImages = (envId: string): Promise<DockerPruneResult> =>
  http.post<DockerPruneResult>(`/environments/${envId}/docker/images/prune`).then((r) => r.data);

export const createDockerVolume = (
  envId: string,
  payload: { name: string; driver?: string; driver_opts?: Record<string, string> },
): Promise<{ name: string }> =>
  http.post<{ name: string }>(`/environments/${envId}/docker/volumes`, payload).then((r) => r.data);

export const pruneDockerVolumes = (envId: string): Promise<DockerPruneResult> =>
  http.post<DockerPruneResult>(`/environments/${envId}/docker/volumes/prune`).then((r) => r.data);

export const createDockerNetwork = (
  envId: string,
  payload: {
    name: string;
    driver?: string;
    subnet?: string;
    gateway?: string;
    internal?: boolean;
  },
): Promise<{ id: string }> =>
  http.post<{ id: string }>(`/environments/${envId}/docker/networks`, payload).then((r) => r.data);

export const removeDockerNetwork = (envId: string, networkId: string): Promise<void> =>
  http
    .delete(`/environments/${envId}/docker/networks/${encodeURIComponent(networkId)}`)
    .then(() => undefined);

export const pruneDockerNetworks = (envId: string): Promise<DockerPruneResult> =>
  http.post<DockerPruneResult>(`/environments/${envId}/docker/networks/prune`).then((r) => r.data);


// ─── Document Copilot ─────────────────────────────────────────────────────────

export interface CopilotSummarizeResult {
  summary: string;
  key_points: string[];
  word_count: number;
}

export interface CopilotAskResult {
  answer: string;
  confidence: number;
  sources: string[];
}

export interface CopilotExtractResult {
  entities: Record<string, unknown>;
  tables: Array<Record<string, unknown>>;
  key_values: Record<string, string>;
}

export const copilotSummarize = (_projectId: string, documentId: string): Promise<CopilotSummarizeResult> =>
  http.post<CopilotSummarizeResult>(`/documents/${documentId}/copilot/summarize`).then((r) => r.data);

export const copilotAsk = (_projectId: string, documentId: string, question: string): Promise<CopilotAskResult> =>
  http.post<CopilotAskResult>(`/documents/${documentId}/copilot/ask`, { question }).then((r) => r.data);

export const copilotExtract = (_projectId: string, documentId: string): Promise<CopilotExtractResult> =>
  http.post<CopilotExtractResult>(`/documents/${documentId}/copilot/extract`).then((r) => r.data);

// ─── Knowledge ───────────────────────────────────────────────────────────────

export interface KnowledgeQueryResult {
  query: string;
  answer?: string | null;
  chunks?: Array<{ content: string; source?: string; score?: number }>;
}

export const queryKnowledge = (
  projectId: string,
  text: string,
  source: "all" | "documents" | "repositories" = "all",
): Promise<KnowledgeQueryResult> =>
  DEMO
    ? delay<KnowledgeQueryResult>({ query: text, answer: `Demo answer for: "${text}"` })
    : http
        .post<KnowledgeQueryResult>(`/projects/${projectId}/knowledge/query`, { text, source, top_k: 5 })
        .then((r) => r.data);

// ─── Analytics ────────────────────────────────────────────────────────────────

export const getProjectAnalytics = (
  projectId: string,
  period: AnalyticsPeriod = "7d"
): Promise<ProjectAnalytics> =>
  DEMO
    ? Promise.resolve({
        task_status_counts: { pending: 3, ready: 2, in_progress: 1, done: 10, failed: 2, cancelled: 0, skipped: 1 },
        daily_throughput: Array.from({ length: 7 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() - (6 - i));
          return { date: d.toISOString().slice(0, 10), done: Math.floor(Math.random() * 4), created: Math.floor(Math.random() * 3) };
        }),
        agent_stats: [],
        blocked_tasks: [],
      })
    : http.get<ProjectAnalytics>(`/analytics/projects/${projectId}`, { params: { period } }).then((r) => r.data);

export const getOrgAnalytics = (): Promise<OrgProjectSummary[]> =>
  DEMO
    ? Promise.resolve([])
    : http.get<OrgProjectSummary[]>("/analytics/org").then((r) => r.data);

export const getProjectDocAnalytics = (
  projectId: string,
  period: AnalyticsPeriod = "7d"
): Promise<DocumentAnalytics> =>
  DEMO
    ? Promise.resolve({ top_documents: [], daily_activity: [], recent_events: [], total_events: 0, total_agent_events: 0, total_human_events: 0 })
    : http
        .get<DocumentAnalytics>(`/analytics/projects/${projectId}/docs`, { params: { period } })
        .then((r) => r.data);

// ── Conversation ─────────────────────────────────────────────────────────────

export async function getConversationHistory(
  projectId: string,
  params: { offset?: number; limit?: number } = {}
): Promise<ConversationHistoryResponse> {
  const q = new URLSearchParams();
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  const res = await http.get<ConversationHistoryResponse>(`/projects/${projectId}/conversation/messages${qs ? `?${qs}` : ""}`);
  return res.data;
}

export async function sendConversationMessage(
  projectId: string,
  content: string,
  specialist?: string
): Promise<ConversationMessage> {
  const res = await http.post<ConversationMessage>(`/projects/${projectId}/conversation/message`, {
    content,
    specialist: specialist ?? null,
  });
  return res.data;
}

// ── Project Skills ────────────────────────────────────────────────────────────

export async function listProjectSkills(projectId: string): Promise<ProjectSkill[]> {
  const res = await http.get<ProjectSkill[]>(`/projects/${projectId}/skills`);
  return res.data;
}

export async function createProjectSkill(
  projectId: string,
  body: { name: string; slug: string; description?: string; content: string }
): Promise<ProjectSkill> {
  const res = await http.post<ProjectSkill>(`/projects/${projectId}/skills`, body);
  return res.data;
}

export async function cloneSkillFromLibrary(
  projectId: string,
  librarySkillId: string
): Promise<ProjectSkill> {
  const res = await http.post<ProjectSkill>(`/projects/${projectId}/skills/clone`, {
    library_skill_id: librarySkillId,
  });
  return res.data;
}

export async function updateProjectSkill(
  projectId: string,
  skillId: string,
  body: Partial<{ name: string; slug: string; description: string; content: string }>
): Promise<ProjectSkill> {
  const res = await http.patch<ProjectSkill>(`/projects/${projectId}/skills/${skillId}`, body);
  return res.data;
}

export async function deleteProjectSkill(projectId: string, skillId: string): Promise<void> {
  await http.delete(`/projects/${projectId}/skills/${skillId}`);
}

// ── Project MCPs ──────────────────────────────────────────────────────────────

export async function listProjectMcps(projectId: string): Promise<ProjectMcp[]> {
  const res = await http.get<ProjectMcp[]>(`/projects/${projectId}/mcps`);
  return res.data;
}

export async function createProjectMcp(
  projectId: string,
  body: {
    name: string;
    slug: string;
    description?: string;
    transport: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
  }
): Promise<ProjectMcp> {
  const res = await http.post<ProjectMcp>(`/projects/${projectId}/mcps`, body);
  return res.data;
}

export async function cloneMcpFromLibrary(
  projectId: string,
  libraryMcpId: string
): Promise<ProjectMcp> {
  const res = await http.post<ProjectMcp>(`/projects/${projectId}/mcps/clone`, {
    library_mcp_id: libraryMcpId,
  });
  return res.data;
}

export async function updateProjectMcp(
  projectId: string,
  mcpId: string,
  body: Partial<ProjectMcp>
): Promise<ProjectMcp> {
  const res = await http.patch<ProjectMcp>(`/projects/${projectId}/mcps/${mcpId}`, body);
  return res.data;
}

export async function deleteProjectMcp(projectId: string, mcpId: string): Promise<void> {
  await http.delete(`/projects/${projectId}/mcps/${mcpId}`);
}

// ── Knowledge Status ──────────────────────────────────────────────────────────

export async function getKnowledgeStatus(projectId: string): Promise<KnowledgeStatus> {
  const res = await http.get<KnowledgeStatus>(`/projects/${projectId}/knowledge/status`);
  return res.data;
}

// ── Knowledge Ingest ──────────────────────────────────────────────────────────

export async function ingestRepository(
  projectId: string,
  repoUrl: string,
  branch = "main"
): Promise<void> {
  await http.post(`/projects/${projectId}/knowledge/repositories/ingest`, {
    source_type: "git",
    repo_url: repoUrl,
    branch,
  });
}

export async function ingestDocumentUrl(
  projectId: string,
  url: string
): Promise<void> {
  await http.post(`/projects/${projectId}/knowledge/documents/ingest`, {
    source_type: "url",
    url,
  });
}
