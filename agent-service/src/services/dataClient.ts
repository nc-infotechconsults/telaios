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

export interface PlanDto {
  id: string;
  project_id: string;
  title: string | null;
  status: string;
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

  async getPlan(planId: string): Promise<PlanDto> {
    const res = await client.get(`/plans/${planId}`);
    return res.data;
  },

  async getProjectRepositories(projectId: string) {
    const res = await client.get(`/projects/${projectId}/repositories`);
    return res.data;
  },

  async getPlanMessages(planId: string) {
    const res = await client.get(`/plans/${planId}/messages`);
    return res.data as Array<{ role: string; content: string; id: string; created_at: string }>;
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
    return res.data as {
      id: string;
      plan_id: string;
      title: string;
      description: string;
      type: string;
      status: string;
      execution_order: number;
      agent_profile_id: string | null;
      depends_on_task_ids: string[];
      repository_ids: string[];
    };
  },

  async deleteTasksByPlan(planId: string) {
    const res = await client.delete(`/plans/${planId}/tasks`);
    return res.data as { deleted: number };
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
