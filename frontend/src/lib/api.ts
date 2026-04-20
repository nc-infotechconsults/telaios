import axios from "axios";
import type {
  Project,
  Repository,
  Plan,
  Task,
  TaskArtifact,
  Message,
  AgentProfile,
  ProjectAgent,
  AgentRole,
  ProjectMember,
  ProjectRole,
  Settings,
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
} from "../types";
import * as demo from "../demo/data";
import { toast } from "./toast";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const TOKEN_KEY = "swe_auth_token";

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

export const getProjects = (): Promise<Project[]> =>
  DEMO ? delay(demo.PROJECTS) : http.get<Project[]>("/projects").then((r) => r.data);

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
        source_type: data.source_type ?? "remote",
        remote_url: data.remote_url,
        branch: data.branch ?? "main",
        auth_type: data.auth_type ?? "none",
        has_credentials: false,
        local_path: data.local_path,
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

// ─── Plans ───────────────────────────────────────────────────────────────────

export const getPlans = (projectId: string): Promise<Plan[]> =>
  DEMO ? delay(demo.PLANS[projectId] ?? []) : http.get<Plan[]>("/plans", { params: { project_id: projectId } }).then((r) => r.data);

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
    : http.post<Plan>("/plans", { project_id: projectId, title }).then((r) => r.data);

export const deletePlan = (planId: string): Promise<void> =>
  DEMO ? delay(undefined) : http.delete(`/plans/${planId}`).then(() => undefined);

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const getTasks = (planId: string): Promise<Task[]> =>
  DEMO ? delay(demo.TASKS[planId] ?? []) : http.get<Task[]>(`/tasks?plan_id=${planId}`).then((r) => r.data);

export const retryTask = (taskId: string): Promise<Task> =>
  DEMO ? delay({} as Task) : http.post<Task>(`/tasks/${taskId}/retry`).then((r) => r.data);

export const cancelTask = (taskId: string): Promise<Task> =>
  DEMO ? delay({} as Task) : http.post<Task>(`/tasks/${taskId}/cancel`).then((r) => r.data);

export const cancelPlan = (planId: string): Promise<{ cancelled: number }> =>
  DEMO ? delay({ cancelled: 0 }) : http.post<{ cancelled: number }>(`/plans/${planId}/cancel`).then((r) => r.data);

export const resumePlan = (planId: string): Promise<void> =>
  DEMO ? delay(undefined) : axios.post(`/agent/plans/${planId}/resume`).then(() => undefined);

// ─── Task Artifacts ───────────────────────────────────────────────────────────

export const getTaskArtifacts = (taskId: string): Promise<TaskArtifact[]> =>
  DEMO ? delay([]) : http.get<TaskArtifact[]>(`/tasks/${taskId}/artifacts`).then((r) => r.data);

// ─── Messages ────────────────────────────────────────────────────────────────

export const getPlanMessages = (planId: string): Promise<Message[]> =>
  DEMO ? delay(demo.MESSAGES[planId] ?? []) : http.get<Message[]>(`/plans/${planId}/messages`).then((r) => r.data);

export const getMessages = (projectId: string): Promise<Message[]> =>
  DEMO ? delay(demo.MESSAGES[projectId] ?? []) : http.get<Message[]>(`/messages?project_id=${projectId}`).then((r) => r.data);

// ─── Agent Profiles ──────────────────────────────────────────────────────────

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
): Promise<string[]> =>
  DEMO
    ? delay(["read_file", "write_file", "list_directory"])
    : http
        .post<{ tools: string[] }>("/agent-profiles/mcp-discover", serverConfig)
        .then((r) => r.data.tools ?? []);

// ─── Project Agents ───────────────────────────────────────────────────────────

export const listProjectAgents = (projectId: string): Promise<ProjectAgent[]> =>
  DEMO ? delay([]) : http.get<ProjectAgent[]>(`/projects/${projectId}/agents`).then((r) => r.data);

export const assignProjectAgent = (
  projectId: string,
  data: { agent_profile_id: string; role: AgentRole; scope?: Record<string, unknown> | null },
): Promise<ProjectAgent> =>
  DEMO
    ? delay<ProjectAgent>({
        id: `pa-${Date.now()}`,
        project_id: projectId,
        agent_profile_id: data.agent_profile_id,
        agent_profile: {} as AgentProfile,
        role: data.role,
        scope: data.scope ?? null,
        assigned_at: new Date().toISOString(),
      })
    : http.post<ProjectAgent>(`/projects/${projectId}/agents`, data).then((r) => r.data);

export const patchProjectAgent = (
  projectId: string,
  agentId: string,
  data: { role?: AgentRole; scope?: Record<string, unknown> | null },
): Promise<ProjectAgent> =>
  http.patch<ProjectAgent>(`/projects/${projectId}/agents/${agentId}`, data).then((r) => r.data);

export const removeProjectAgent = (projectId: string, agentId: string): Promise<void> =>
  DEMO
    ? delay(undefined as unknown as void)
    : http.delete(`/projects/${projectId}/agents/${agentId}`).then(() => undefined);

// ─── Settings ────────────────────────────────────────────────────────────────

export const getSettings = (): Promise<Settings> =>
  DEMO ? delay(demo.SETTINGS) : http.get<Settings>("/settings").then((r) => r.data);

export const updateSettings = (data: Partial<Settings> & { llm_api_key_raw?: string }): Promise<Settings> =>
  DEMO
    ? delay<Settings>({ ...demo.SETTINGS, ...data, updated_at: new Date().toISOString() })
    : http.patch<Settings>("/settings", data).then((r) => r.data);

export const testLlm = (data: { provider: string; model: string; apiKey?: string; baseUrl?: string }): Promise<{ ok: boolean }> =>
  DEMO
    ? delay({ ok: true })
    : axios.post("/agent/test-llm", data).then((r) => r.data);

// ─── Documents ────────────────────────────────────────────────────────────────

export const listDocuments = (projectId: string): Promise<Document[]> =>
  DEMO ? delay([]) : http.get<Document[]>(`/projects/${projectId}/documents`).then((r) => r.data);

export const getDocument = (projectId: string, documentId: string): Promise<Document> =>
  http.get<Document>(`/projects/${projectId}/documents/${documentId}`).then((r) => r.data);

export const uploadDocument = (projectId: string, file: File): Promise<Document> => {
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
      folder_id: null,
      current_version_id: null,
      uploaded_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  const form = new FormData();
  form.append("file", file);
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

export const scanProjectCharts = (envId: string): Promise<Array<{ name: string; version: string; description: string; localPath?: string }>> =>
  http.get(`/environments/${envId}/helm/charts/scan`).then((r) => r.data as Array<{ name: string; version: string; description: string; localPath?: string }>);

// ─── Docker Engine ────────────────────────────────────────────────────────────

export const listDockerContainers = (envId: string): Promise<DockerContainer[]> =>
  http.get<DockerContainer[]>(`/environments/${envId}/docker/containers`).then((r) => r.data);

export const getDockerContainer = (envId: string, containerId: string): Promise<unknown> =>
  http.get(`/environments/${envId}/docker/containers/${containerId}`).then((r) => r.data);

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
  const fileName = filePath.split("/").filter(Boolean).pop() ?? "archive";
  a.href = url;
  a.download = `${fileName}.tar`;
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
