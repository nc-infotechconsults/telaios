import axios from "axios";
import type {
  Project,
  Repository,
  Plan,
  Task,
  Message,
  AgentProfile,
  ProjectAgent,
  AgentRole,
  Settings,
  User,
  Document,
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
    : http.put<Settings>("/settings", data).then((r) => r.data);

export const testLlm = (data: { provider: string; model: string; apiKey?: string; baseUrl?: string }): Promise<{ ok: boolean }> =>
  DEMO
    ? delay({ ok: true })
    : axios.post("/agent/test-llm", data).then((r) => r.data);

// ─── Documents ────────────────────────────────────────────────────────────────

export const listDocuments = (projectId: string): Promise<Document[]> =>
  DEMO ? delay([]) : http.get<Document[]>(`/projects/${projectId}/documents`).then((r) => r.data);

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
