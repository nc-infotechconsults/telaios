import axios from "axios";
import type {
  Project,
  Repository,
  Plan,
  Task,
  Message,
  AgentProfile,
  Settings,
} from "../types";
import * as demo from "../demo/data";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

/** Simulated network delay used in demo mode. */
function delay<T>(data: T, ms = 300): Promise<T> {
  return new Promise((res) => setTimeout(() => res(structuredClone(data) as T), ms));
}

const http = axios.create({ baseURL: "/api" });

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
        remote_url: data.remote_url ?? "",
        branch: data.branch ?? "main",
        auth_type: data.auth_type ?? "none",
        has_credentials: false,
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

export const getPlan = (projectId: string): Promise<Plan | null> =>
  DEMO
    ? delay((demo.PLANS[projectId] ?? [])[0] ?? null)
    : http.get<Plan[]>("/plans", { params: { project_id: projectId } }).then((r) => r.data[0] ?? null);

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const getTasks = (planId: string): Promise<Task[]> =>
  DEMO ? delay(demo.TASKS[planId] ?? []) : http.get<Task[]>(`/tasks?plan_id=${planId}`).then((r) => r.data);

// ─── Messages ────────────────────────────────────────────────────────────────

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

// ─── Settings ────────────────────────────────────────────────────────────────

export const getSettings = (): Promise<Settings> =>
  DEMO ? delay(demo.SETTINGS) : http.get<Settings>("/settings").then((r) => r.data);

export const updateSettings = (data: Partial<Settings> & { llm_api_key_raw?: string }): Promise<Settings> =>
  DEMO
    ? delay<Settings>({ ...demo.SETTINGS, ...data, updated_at: new Date().toISOString() })
    : http.put<Settings>("/settings", data).then((r) => r.data);

export const testLlm = (data: { provider: string; model: string; api_key?: string; base_url?: string }): Promise<{ ok: boolean }> =>
  DEMO
    ? delay({ ok: true })
    : axios.post("/agent/test-llm", data).then((r) => r.data);
