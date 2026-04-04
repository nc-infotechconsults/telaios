import { Chip, Divider } from "@heroui/react";
import type { Plan, Task, AgentProfile, Repository } from "../../types";

const STATUS_COLOR: Record<Task["status"], "default" | "primary" | "warning" | "success" | "danger"> = {
  pending: "default",
  ready: "primary",
  in_progress: "warning",
  done: "success",
  failed: "danger",
};

const DRIVER_COLOR: Record<AgentProfile["agent_type"], "primary" | "secondary" | "success"> = {
  langgraph: "primary",
  opencode: "secondary",
  "github-copilot": "success",
};

interface Props {
  plan: Plan;
  tasks: Task[];
  agentProfiles?: AgentProfile[];
  repositories?: Repository[];
}

export default function PlanSidebar({ plan, tasks, agentProfiles = [], repositories = [] }: Props) {
  const sorted = [...tasks].sort((a, b) => a.execution_order - b.execution_order);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Execution Plan</span>
        <Chip
          size="sm"
          variant="flat"
          color={
            plan.status === "confirmed" || plan.status === "executing" || plan.status === "completed"
              ? "success"
              : "warning"
          }
        >
          {plan.status}
        </Chip>
      </div>
      <Divider />

      {sorted.length === 0 ? (
        <p className="text-sm text-default-400 text-center py-4">
          No tasks yet. Keep chatting!
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((t, i) => {
            const profile = agentProfiles.find((p) => p.id === t.agent_profile_id);
            const taskRepos = (t.repository_ids ?? [])
              .map((rid) => repositories.find((r) => r.id === rid))
              .filter(Boolean) as Repository[];

            return (
              <div
                key={t.id}
                className="p-3 rounded-xl bg-default-50 space-y-1.5 border border-divider"
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs font-semibold leading-tight">
                    {i + 1}. {t.title}
                  </span>
                  <Chip size="sm" color={STATUS_COLOR[t.status]} variant="flat" className="shrink-0">
                    {t.status.replace("_", " ")}
                  </Chip>
                </div>

                <div className="flex flex-wrap gap-1">
                  <Chip size="sm" variant="bordered">{t.type}</Chip>
                  {profile && (
                    <>
                      <Chip size="sm" color={DRIVER_COLOR[profile.agent_type]} variant="flat">
                        {profile.agent_type}
                      </Chip>
                      <Chip
                        size="sm"
                        color="secondary"
                        variant="bordered"
                        className="max-w-[120px] truncate"
                        title={profile.name}
                      >
                        {profile.name}
                      </Chip>
                    </>
                  )}
                </div>

                {taskRepos.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {taskRepos.map((r) => (
                      <Chip key={r.id} size="sm" variant="bordered" color="primary">
                        📁 {r.name}
                      </Chip>
                    ))}
                  </div>
                )}

                {(t.depends_on_task_ids ?? []).length > 0 && (
                  <p className="text-[10px] text-default-400">
                    ⛓ depends on {t.depends_on_task_ids!.length} task
                    {t.depends_on_task_ids!.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
