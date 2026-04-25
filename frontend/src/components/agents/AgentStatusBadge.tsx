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
    <span className={`clay-badge ${status === "idle" ? "!bg-success/10 !text-success !border-success/20" : "!bg-warning/10 !text-warning !border-warning/20"}`}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block mr-1.5 ${status === "idle" ? "bg-success" : "bg-warning"} animate-pulse`} />
      {status === "idle" ? "Idle" : "Busy"}
    </span>
  );
}

export default AgentStatusBadge;
