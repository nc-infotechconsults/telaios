export interface AgentTask {
  id: string;
  title: string;
  description: string;
  type: string;
  agentProfileId: string | null;
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
}

export type AgentStatus = "idle" | "busy" | "error";

export interface CodingAgentDriver {
  execute(task: AgentTask, workspaces: Record<string, string>): Promise<AgentResult>;
  getStatus(): Promise<AgentStatus>;
}
