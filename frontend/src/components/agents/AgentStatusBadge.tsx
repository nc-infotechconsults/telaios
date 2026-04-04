export type AgentStatus = "idle" | "busy";

export interface AgentInstance {
  instance_id: string;
  profile_id: string;
  status: AgentStatus;
  current_task_id?: string;
  current_task_title?: string;
}

interface AgentStatusBadgeProps {
  status: AgentStatus;
}

export function AgentStatusBadge({ status }: AgentStatusBadgeProps) {
  return (
    <span className={`w-2 h-2 rounded-full inline-block ${status === "idle" ? "bg-success" : "bg-warning"} animate-pulse`} />
  );
}

export default AgentStatusBadge;
