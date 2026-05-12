import axios from "axios";
import type {
  Project,
  Repository,
  RepositoryTestResult,
  Plan,
  Task,
  TaskArtifact,
  Message,
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
        status: "planning",
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
  projectId: string,
  data: Pick<Repository, "provider_type" | "remote_url" | "branch" | "auth_type" | "bucket_name" | "region" | "endpoint"> & { credentials?: string }
): Promise<RepositoryTestResult> =>
  DEMO
    ? delay<RepositoryTestResult>({ ok: true, code: "OK", message: "Demo: repository reachable", default_branch: data.branch ?? "main" })
    : http.post<RepositoryTestResult>(`/projects/${projectId}/repositories/test`, data).then((r) => r.data);

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

// ─── LLM Providers ───────────────────────────────────────────────────────────

export const getLlmProviders = (): Promise<LlmProviderDefinition[]> =>
  DEMO ? delay([]) : http.get<LlmProviderDefinition[]>("/llm/providers").then((r) => r.data);

// ─── System Settings (admin) ──────────────────────────────────────────────────

export const getSettings = (): Promise<AppSettings> =>
  DEMO ? delay<AppSettings>({ id: 1, llm_provider: null, llm_model: null, llm_base_url: null, llm_temperature: null, llm_max_tokens: null, llm_top_p: null, llm_frequency_penalty: null, llm_presence_penalty: null, has_api_key: false, updated_at: new Date().toISOString() }) : http.get<AppSettings>("/settings").then((r) => r.data);

export const patchSettings = (data: PatchSettingsPayload): Promise<AppSettings> =>
  DEMO ? delay<AppSettings>({ id: 1, llm_provider: data.llm_provider ?? null, llm_model: data.llm_model ?? null, llm_base_url: data.llm_base_url ?? null, llm_temperature: data.llm_temperature ?? null, llm_max_tokens: data.llm_max_tokens ?? null, llm_top_p: data.llm_top_p ?? null, llm_frequency_penalty: data.llm_frequency_penalty ?? null, llm_presence_penalty: data.llm_presence_penalty ?? null, has_api_key: !!data.llm_api_key_raw, updated_at: new Date().toISOString() }) : http.patch<AppSettings>("/settings", data).then((r) => r.data);

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

export const getDocument = (projectId: string, documentId: string): Promise<Document> =>
  http.get<Document>(`/projects/${projectId}/documents/${documentId}`).then((r) => r.data);

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
  if (folderId) form.append("folder_id", folderId);
  return http.post<Document>(`/projects/${projectId}/documents`, form).then((r) => r.data);
};

export const deleteDocument = (projectId: string, id: string): Promise<void> =>
  DEMO ? delay(undefined as unknown as void) : http.delete(`/projects/${projectId}/documents/${id}`).then(() => undefined);

export const getDocumentDownloadUrl = (projectId: string, id: string): Promise<string> =>
  DEMO
    ? delay("")
    : http.get<{ url: string }>(`/projects/${projectId}/documents/${id}/download`).then((r) => r.data.url);

export const updateDocumentContent = (projectId: string, id: string, content: string): Promise<Document> =>
  DEMO
    ? delay({} as Document)
    : http.put<Document>(`/projects/${projectId}/documents/${id}/content`, { content }).then((r) => r.data);

// ─── Document Folders ─────────────────────────────────────────────────────────

export const listFolders = (projectId: string, parentFolderId?: string | null): Promise<DocumentFolder[]> =>
  DEMO ? delay([]) : http.get<DocumentFolder[]>(`/projects/${projectId}/folders`, { params: parentFolderId ? { parent_folder_id: parentFolderId } : undefined }).then((r) => r.data);

export const listAllFolders = (projectId: string): Promise<DocumentFolder[]> =>
  DEMO ? delay([]) : http.get<DocumentFolder[]>(`/projects/${projectId}/folders/all`).then((r) => r.data);

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

export const listVersions = (projectId: string, documentId: string): Promise<DocumentVersion[]> =>
  DEMO ? delay([]) : http.get<DocumentVersion[]>(`/projects/${projectId}/documents/${documentId}/versions`).then((r) => r.data);

export const uploadVersion = (projectId: string, documentId: string, file: File, changeDescription?: string): Promise<DocumentVersion> => {
  const form = new FormData();
  form.append("file", file);
  if (changeDescription) form.append("change_description", changeDescription);
  return http.post<DocumentVersion>(`/projects/${projectId}/documents/${documentId}/versions`, form).then((r) => r.data);
};

export const getVersionDownloadUrl = (projectId: string, documentId: string, versionId: string): Promise<string> =>
  http.get<{ url: string }>(`/projects/${projectId}/documents/${documentId}/versions/${versionId}/download`).then((r) => r.data.url);

// ─── Document Tags ────────────────────────────────────────────────────────────

export const listTags = (projectId: string): Promise<DocumentTag[]> =>
  DEMO ? delay([]) : http.get<DocumentTag[]>(`/projects/${projectId}/tags`).then((r) => r.data);

export const createTag = (projectId: string, data: { name: string; color?: string }): Promise<DocumentTag> =>
  http.post<DocumentTag>(`/projects/${projectId}/tags`, data).then((r) => r.data);

export const deleteTag = (projectId: string, tagId: string): Promise<void> =>
  http.delete(`/projects/${projectId}/tags/${tagId}`).then(() => undefined);

export const getDocumentTags = (projectId: string, documentId: string): Promise<DocumentTag[]> =>
  DEMO ? delay([]) : http.get<DocumentTag[]>(`/projects/${projectId}/documents/${documentId}/tags`).then((r) => r.data);

export const assignDocumentTag = (projectId: string, documentId: string, tagId: string): Promise<void> =>
  http.post(`/projects/${projectId}/documents/${documentId}/tags/${tagId}`).then(() => undefined);

export const unassignDocumentTag = (projectId: string, documentId: string, tagId: string): Promise<void> =>
  http.delete(`/projects/${projectId}/documents/${documentId}/tags/${tagId}`).then(() => undefined);

// ─── Document Comments ────────────────────────────────────────────────────────

export const listComments = (projectId: string, documentId: string): Promise<DocumentComment[]> =>
  DEMO ? delay([]) : http.get<DocumentComment[]>(`/projects/${projectId}/documents/${documentId}/comments`).then((r) => r.data);

export const createComment = (projectId: string, documentId: string, data: { content: string; anchor_type?: string; parent_comment_id?: string | null }): Promise<DocumentComment> =>
  http.post<DocumentComment>(`/projects/${projectId}/documents/${documentId}/comments`, data).then((r) => r.data);

export const patchComment = (projectId: string, documentId: string, commentId: string, data: { content?: string; resolved?: boolean }): Promise<DocumentComment> =>
  http.patch<DocumentComment>(`/projects/${projectId}/documents/${documentId}/comments/${commentId}`, data).then((r) => r.data);

export const deleteComment = (projectId: string, documentId: string, commentId: string): Promise<void> =>
  http.delete(`/projects/${projectId}/documents/${documentId}/comments/${commentId}`).then(() => undefined);

// ─── Document Activity ────────────────────────────────────────────────────────

export const listDocumentActivities = (projectId: string, documentId: string): Promise<DocumentActivityItem[]> =>
  DEMO ? delay([]) : http.get<DocumentActivityItem[]>(`/projects/${projectId}/documents/${documentId}/activity`).then((r) => r.data);

export const listProjectDocumentActivities = (projectId: string): Promise<DocumentActivityItem[]> =>
  DEMO ? delay([]) : http.get<DocumentActivityItem[]>(`/projects/${projectId}/activity/documents`).then((r) => r.data);

// ─── Document Templates ───────────────────────────────────────────────────────

export const listGlobalTemplates = (): Promise<DocumentTemplate[]> =>
  DEMO ? delay([]) : http.get<DocumentTemplate[]>("/templates").then((r) => r.data);

export const listProjectTemplates = (projectId: string): Promise<DocumentTemplate[]> =>
  DEMO ? delay([]) : http.get<DocumentTemplate[]>(`/projects/${projectId}/templates`).then((r) => r.data);

// ─── Document Favorites ───────────────────────────────────────────────────────

export const listFavorites = (projectId: string): Promise<string[]> =>
  DEMO ? delay([]) : http.get<string[]>(`/projects/${projectId}/favorites`).then((r) => r.data);

export const checkFavorite = (projectId: string, documentId: string): Promise<boolean> =>
  DEMO ? delay(false) : http.get<{ is_favorite: boolean }>(`/projects/${projectId}/documents/${documentId}/favorite`).then((r) => r.data.is_favorite);

export const addFavorite = (projectId: string, documentId: string): Promise<void> =>
  http.post(`/projects/${projectId}/documents/${documentId}/favorite`).then(() => undefined);

export const removeFavorite = (projectId: string, documentId: string): Promise<void> =>
  http.delete(`/projects/${projectId}/documents/${documentId}/favorite`).then(() => undefined);

// ─── Document Search ──────────────────────────────────────────────────────────

export const searchDocuments = (projectId: string, params: { q?: string; type?: string; tag?: string }): Promise<Document[]> =>
  DEMO ? delay([]) : http.get<Document[]>(`/projects/${projectId}/documents/search`, { params }).then((r) => r.data);

// ─── Document Trash ───────────────────────────────────────────────────────────

export const listTrash = (projectId: string): Promise<Document[]> =>
  DEMO ? delay([]) : http.get<Document[]>(`/projects/${projectId}/documents/trash`).then((r) => r.data);

export const restoreDocument = (projectId: string, documentId: string): Promise<Document> =>
  http.post<Document>(`/projects/${projectId}/documents/${documentId}/restore`).then((r) => r.data);

// ─── Document with folder update ─────────────────────────────────────────────

export const moveDocument = (projectId: string, documentId: string, folderId: string | null): Promise<Document> =>
  http.patch<Document>(`/projects/${projectId}/documents/${documentId}`, { metadata: { folder_id: folderId } }).then((r) => r.data);

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

export const copilotSummarize = (projectId: string, documentId: string): Promise<CopilotSummarizeResult> =>
  http.post<CopilotSummarizeResult>(`/projects/${projectId}/documents/${documentId}/copilot/summarize`).then((r) => r.data);

export const copilotAsk = (projectId: string, documentId: string, question: string): Promise<CopilotAskResult> =>
  http.post<CopilotAskResult>(`/projects/${projectId}/documents/${documentId}/copilot/ask`, { question }).then((r) => r.data);

export const copilotExtract = (projectId: string, documentId: string): Promise<CopilotExtractResult> =>
  http.post<CopilotExtractResult>(`/projects/${projectId}/documents/${documentId}/copilot/extract`).then((r) => r.data);

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
