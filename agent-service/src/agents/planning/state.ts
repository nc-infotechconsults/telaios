export interface PlanningState {
  projectId: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  interviewComplete: boolean;
  planDraft: PlanDraft | null;
  userConfirmed: boolean;
  userRequestedChanges: string | null;
  agentProfiles: AgentProfileSummary[];
  projectRepositories: RepositorySummary[];
  error: string | null;
}

export interface PlanDraft {
  tasks: PlannedTask[];
}

export interface PlannedTask {
  title: string;
  description: string;
  type: "code" | "test" | "review" | "general";
  execution_order: number;
  depends_on_task_indices: number[];
  recommended_agent_profile_id: string | null;
  repository_ids: string[];
}

export interface AgentProfileSummary {
  id: string;
  name: string;
  description: string;
  agent_type: string;
  skills: Array<{ name: string; description: string }>;
}

export interface RepositorySummary {
  id: string;
  name: string;
  remote_url: string;
}
