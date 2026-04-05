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

const http = axios.create({ baseURL: "/api" });

// Projects
export const getProjects = () => http.get<Project[]>("/projects").then((r) => r.data);
export const createProject = (data: Partial<Project>) => http.post<Project>("/projects", data).then((r) => r.data);
export const updateProject = (id: string, data: Partial<Project>) => http.patch<Project>(`/projects/${id}`, data).then((r) => r.data);

// Repositories
export const getRepositories = (projectId: string) =>
  http.get<Repository[]>(`/projects/${projectId}/repositories`).then((r) => r.data);
export const createRepository = (projectId: string, data: Partial<Repository>) =>
  http.post<Repository>(`/projects/${projectId}/repositories`, data).then((r) => r.data);
export const updateRepository = (projectId: string, id: string, data: Partial<Repository>) =>
  http.patch<Repository>(`/projects/${projectId}/repositories/${id}`, data).then((r) => r.data);
export const deleteRepository = (projectId: string, id: string) =>
  http.delete(`/projects/${projectId}/repositories/${id}`);

// Plans
export const getPlans = (projectId: string) =>
  http.get<Plan[]>("/plans", { params: { project_id: projectId } }).then((r) => r.data);

export const getPlan = (projectId: string) =>
  http.get<Plan[]>("/plans", { params: { project_id: projectId } }).then((r) => r.data[0] ?? null);

// Tasks
export const getTasks = (planId: string) =>
  http.get<Task[]>(`/tasks?plan_id=${planId}`).then((r) => r.data);

// Messages
export const getMessages = (projectId: string) =>
  http.get<Message[]>(`/messages?project_id=${projectId}`).then((r) => r.data);

// Agent Profiles
export const getAgentProfiles = () => http.get<AgentProfile[]>("/agent-profiles").then((r) => r.data);
export const getAgentProfile = (id: string) => http.get<AgentProfile>(`/agent-profiles/${id}`).then((r) => r.data);
export const createAgentProfile = (data: Partial<AgentProfile>) =>
  http.post<AgentProfile>("/agent-profiles", data).then((r) => r.data);
export const updateAgentProfile = (id: string, data: Partial<AgentProfile>) =>
  http.patch<AgentProfile>(`/agent-profiles/${id}`, data).then((r) => r.data);
export const deleteAgentProfile = (id: string) => http.delete(`/agent-profiles/${id}`);

// Settings
export const getSettings = () => http.get<Settings>("/settings").then((r) => r.data);
export const updateSettings = (data: Partial<Settings> & { llm_api_key_raw?: string }) =>
  http.put<Settings>("/settings", data).then((r) => r.data);
export const testLlm = (data: { provider: string; model: string; api_key?: string; base_url?: string }) =>
  axios.post("/agent/test-llm", data).then((r) => r.data);
