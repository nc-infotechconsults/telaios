export interface AgentTask {
  id: string;
  title: string;
  description: string;
  type: string;
  agentProfileId: string | null;
}

export type ArtifactType = "diff" | "test_result" | "review" | "log" | "file" | "link";

export interface AgentArtifact {
  type: ArtifactType;
  title: string;
  content: string;
  content_type?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
  artifacts?: AgentArtifact[];
}

export type AgentStatus = "idle" | "busy" | "error";

export interface CodingAgentDriver {
  execute(task: AgentTask, workspaces: Record<string, string>): Promise<AgentResult>;
  getStatus(): Promise<AgentStatus>;
}
