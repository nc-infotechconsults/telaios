import { Chip, Button, Divider } from "@heroui/react";
import { useNavigate, useParams } from "react-router-dom";
import type { Plan, Task, AgentProfile, Repository } from "../../types";
import { formatStatus } from "../../lib/statusLabels";

const PLAN_STATUS_COLOR: Record<
  Plan["status"],
  "default" | "warning" | "primary" | "success" | "danger"
> = {
  draft: "warning",
  confirmed: "primary",
  executing: "primary",
  completed: "success",
  failed: "danger",
};

const TASK_STATUS_COLOR: Record<
  Task["status"],
  "default" | "primary" | "warning" | "success" | "danger"
> = {
  pending: "default",
  ready: "primary",
  in_progress: "warning",
  done: "success",
  failed: "danger",
  cancelled: "default",
  skipped: "default",
};

interface Props {
  plans: Plan[];
  planTasks: Record<string, Task[]>;
  activePlanId: string | null;
  onActivate: (planId: string) => void;
  agentProfiles?: AgentProfile[];
  repositories?: Repository[];
}

function taskProgress(tasks: Task[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  return { total, done, failed, inProgress };
}

export default function PlanListTab({
  plans,
  planTasks,
  activePlanId,
  onActivate,
  agentProfiles = [],
  repositories = [],
}: Props) {
  const navigate = useNavigate();
  const { id: projectId } = useParams<{ id: string }>();

  const sorted = [...plans].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="text-5xl">📋</div>
        <p className="font-semibold text-lg">No plans yet</p>
        <p className="text-default-400 text-sm max-w-xs">
          Start a conversation in the Planning Chat tab to let the AI agent draft an execution plan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Execution Plans</h2>
          <p className="text-default-400 text-sm mt-0.5">
            {sorted.length} plan{sorted.length !== 1 ? "s" : ""} for this project
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {sorted.map((plan, idx) => {
          const tasks = planTasks[plan.id] ?? [];
          const { total, done, failed, inProgress } = taskProgress(tasks);
          const progress = total > 0 ? Math.round((done / total) * 100) : 0;
          const isActive = plan.id === activePlanId;
          const isExecutable =
            plan.status === "confirmed" ||
            plan.status === "executing" ||
            plan.status === "completed";

          const createdDate = new Date(plan.created_at).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const confirmedDate = plan.confirmed_at
            ? new Date(plan.confirmed_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : null;

          // Unique agents in this plan
          const agentIds = [...new Set(tasks.map((t) => t.agent_profile_id).filter(Boolean))];
          const planAgents = agentIds
            .map((id) => agentProfiles.find((p) => p.id === id))
            .filter(Boolean) as AgentProfile[];

          // Unique repos
          const repoIds = [
            ...new Set(tasks.flatMap((t) => t.repository_ids ?? [])),
          ];
          const planRepos = repoIds
            .map((id) => repositories.find((r) => r.id === id))
            .filter(Boolean) as Repository[];

          // Task type breakdown
          const typeCounts: Partial<Record<Task["type"], number>> = {};
          for (const t of tasks) {
            typeCounts[t.type] = (typeCounts[t.type] ?? 0) + 1;
          }

          return (
            <div
              key={plan.id}
              className={`rounded-xl border transition-all ${
                isActive
                  ? "border-primary bg-primary/5"
                  : "border-divider bg-content1 hover:border-primary/30"
              }`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {isActive && (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-primary animate-pulse" aria-label="Active plan" />
                  )}
                  <h3 className="font-semibold text-sm">
                    Plan v{idx + 1}
                  </h3>
                  <Chip
                    size="sm"
                    color={PLAN_STATUS_COLOR[plan.status]}
                    variant="flat"
                    className="shrink-0"
                  >
                    {formatStatus(plan.status)}
                  </Chip>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {!isActive && plan.status !== "draft" && (
                    <Button
                      size="sm"
                      variant="bordered"
                      onPress={() => onActivate(plan.id)}
                    >
                      View in sidebar
                    </Button>
                  )}
                  {isExecutable && (
                    <Button
                      size="sm"
                      color="primary"
                      onPress={() => navigate(`/projects/${projectId}/execute`)}
                    >
                      Execution →
                    </Button>
                  )}
                </div>
              </div>

              <Divider />

              {/* Body */}
              <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Dates */}
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-default-400 uppercase tracking-wide mb-0.5">Created</p>
                    <p className="text-xs text-foreground">{createdDate}</p>
                  </div>
                  {confirmedDate && (
                    <div>
                      <p className="text-[10px] text-default-400 uppercase tracking-wide mb-0.5">Confirmed</p>
                      <p className="text-xs text-foreground">{confirmedDate}</p>
                    </div>
                  )}
                </div>

                {/* Task summary */}
                <div className="space-y-2">
                  <p className="text-[10px] text-default-400 uppercase tracking-wide">
                    Tasks ({total})
                  </p>

                  {total > 0 ? (
                    <>
                      {/* Progress bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-default-400">
                          <span>{done} done</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-default-200 overflow-hidden">
                          <div
                            className="h-full bg-success rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Status chips */}
                      <div className="flex flex-wrap gap-1">
                        {(Object.entries({
                          done,
                          in_progress: inProgress,
                          failed,
                          pending: total - done - inProgress - failed,
                        }) as [Task["status"], number][])
                          .filter(([, count]) => count > 0)
                          .map(([status, count]) => (
                            <Chip
                              key={status}
                              size="sm"
                              color={TASK_STATUS_COLOR[status]}
                              variant="flat"
                              className="text-[10px]"
                            >
                              {count} {formatStatus(status)}
                            </Chip>
                          ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-default-400 italic">No tasks</p>
                  )}
                </div>
              </div>

              {/* Footer: type breakdown + agents + repos */}
              {(planAgents.length > 0 || planRepos.length > 0 || Object.keys(typeCounts).length > 0) && (
                <>
                  <Divider />
                  <div className="px-5 py-3 flex flex-wrap gap-x-6 gap-y-2">
                    {Object.keys(typeCounts).length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-default-400 uppercase tracking-wide shrink-0">Types:</span>
                        <div className="flex flex-wrap gap-1">
                          {(Object.entries(typeCounts) as [Task["type"], number][]).map(([type, count]) => (
                            <Chip key={type} size="sm" variant="bordered" className="text-[10px]">
                              {count}× {type}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    )}

                    {planAgents.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-default-400 uppercase tracking-wide shrink-0">🤖</span>
                        <div className="flex flex-wrap gap-1">
                          {planAgents.map((a) => (
                            <Chip key={a.id} size="sm" variant="flat" color="primary" className="text-[10px]">
                              {a.name}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    )}

                    {planRepos.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-default-400 uppercase tracking-wide shrink-0">📁</span>
                        <div className="flex flex-wrap gap-1">
                          {planRepos.map((r) => (
                            <Chip key={r.id} size="sm" variant="bordered" color="default" className="text-[10px]">
                              {r.name}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
