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
  const isIdle = status === "idle";
  const badgeClass = isIdle
    ? "!bg-success/10 !text-success !border-success/20"
    : "!bg-warning/10 !text-warning !border-warning/20";
  const dotClass = isIdle ? "bg-success" : "bg-warning";
  return (
    <span className={`apple-badge ${badgeClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block mr-1.5 ${dotClass} animate-pulse`} />
      {isIdle ? "Idle" : "Busy"}
    </span>
  );
}

export default AgentStatusBadge;
