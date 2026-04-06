import axios from "axios";
import { config } from "../core/config";

const client = axios.create({
  baseURL: config.DATA_API_URL,
  headers: config.DATA_API_KEY
    ? { Authorization: `Bearer ${config.DATA_API_KEY}` }
    : {},
});

export interface SettingsDto {
  llm_provider: string;
  llm_model: string;
  llm_api_key_raw?: string;
  llm_base_url?: string;
}

export const dataClient = {
  async getSettings(): Promise<SettingsDto> {
    const res = await client.get("/settings/raw");
    return res.data;
  },

  async getAgentProfiles() {
    const res = await client.get("/agent-profiles");
    return res.data;
  },

  async getProjectRepositories(projectId: string) {
    const res = await client.get(`/projects/${projectId}/repositories`);
    return res.data;
  },

  async createPlan(data: object) {
    const res = await client.post("/plans", data);
    return res.data;
  },

  async updatePlan(planId: string, data: object) {
    const res = await client.patch(`/plans/${planId}`, data);
    return res.data;
  },

  async createTask(data: object) {
    const res = await client.post("/tasks", data);
    return res.data;
  },

  async updateTask(taskId: string, data: object) {
    const res = await client.patch(`/tasks/${taskId}`, data);
    return res.data;
  },

  async getPlanTasks(planId: string) {
    const res = await client.get(`/tasks?plan_id=${planId}`);
    return res.data;
  },

  async saveMessage(data: object) {
    const res = await client.post("/messages", data);
    return res.data;
  },

  async updateRepositoryStatus(
    repoId: string,
    data: { status: string; local_clone_path?: string; error_message?: string }
  ) {
    const res = await client.patch(`/repositories/${repoId}`, data);
    return res.data;
  },
};
