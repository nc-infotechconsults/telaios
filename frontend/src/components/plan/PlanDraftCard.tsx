import { Button, Chip } from "@heroui/react";
import type { Plan, Task, AgentProfile, Repository } from "../../types";
import { formatStatus } from "../../lib/statusLabels";

const TYPE_STYLE: Record<Task["type"], string> = {
  code: "text-blue-400",
  test: "text-purple-400",
  review: "text-yellow-400",
  general: "text-default-400",
};

const STATUS_COLOR: Record<Plan["status"], "warning" | "success" | "primary" | "default"> = {
  draft: "warning",
  confirmed: "success",
  executing: "success",
  completed: "success",
};

interface Props {
  plan: Plan;
  tasks: Task[];
  agentProfiles: AgentProfile[];
  repositories: Repository[];
  version: number;
  onConfirm: () => void;
  onRequestChanges: () => void;
}

export default function PlanDraftCard({
  plan,
  tasks,
  agentProfiles,
  repositories,
  version,
  onConfirm,
  onRequestChanges,
}: Props) {
  const sorted = [...tasks].sort((a, b) => a.execution_order - b.execution_order);
  const indexMap = Object.fromEntries(sorted.map((t, i) => [t.id, i + 1]));
  const uniqueRepoCount = new Set(tasks.flatMap((t) => t.repository_ids ?? [])).size;
  const isDraft = plan.status === "draft";

  return (
    <div className="w-full rounded-2xl border border-divider overflow-hidden bg-content1 shadow-sm">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-default-100 border-b border-divider">
        <span aria-hidden="true" className="text-base">📋</span>
        <span className="font-semibold text-sm">
          Execution Plan{version > 1 ? ` (v${version})` : ""}
        </span>
        <Chip size="sm" variant="flat" color={STATUS_COLOR[plan.status]}>
          {formatStatus(plan.status)}
        </Chip>
        <div className="ml-auto flex gap-3 text-xs text-default-400">
          <span>{tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
          <span aria-hidden="true">·</span>
          <span>{uniqueRepoCount} repo{uniqueRepoCount !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* ── Task list ── */}
      <ol className="divide-y divide-divider" aria-label="Plan tasks">
        {sorted.map((t, i) => {
          const profile = agentProfiles.find((p) => p.id === t.agent_profile_id);
          const taskRepos = (t.repository_ids ?? [])
            .map((rid) => repositories.find((r) => r.id === rid))
            .filter(Boolean) as Repository[];
          const depNums = (t.depends_on_task_ids ?? [])
            .map((did) => indexMap[did])
            .filter(Boolean);

          return (
            <li key={t.id} className="flex gap-3 px-4 py-3">
              <span
                className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-default-200 flex items-center justify-center text-[10px] font-bold"
                aria-hidden="true"
              >
                {i + 1}
              </span>

              <div className="flex-1 min-w-0 space-y-0.5">
                {/* Title + type */}
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-semibold text-sm leading-snug">{t.title}</span>
                  <code className={`text-[11px] ${TYPE_STYLE[t.type]}`}>[{t.type}]</code>
                </div>

                {/* Description */}
                {t.description && (
                  <p className="text-xs text-default-500 leading-snug line-clamp-2">
                    {t.description}
                  </p>
                )}

                {/* Metadata: repos, agent, dependencies */}
                {(taskRepos.length > 0 || profile || depNums.length > 0) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-default-400 mt-0.5">
                    {taskRepos.map((r) => (
                      <span key={r.id}>
                        <span aria-hidden="true">📁</span>&nbsp;{r.name}
                      </span>
                    ))}
                    {profile && (
                      <span>
                        <span aria-hidden="true">🤖</span>&nbsp;{profile.name}
                      </span>
                    )}
                    {depNums.length > 0 && (
                      <span>
                        <span aria-hidden="true">⛓</span>&nbsp;after #{depNums.join(", #")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* ── Footer ── */}
      {isDraft ? (
        <div className="flex gap-2 px-4 py-3 border-t border-divider bg-default-100">
          <Button size="sm" color="success" onPress={onConfirm} className="flex-1">
            ✓ Confirm &amp; Execute
          </Button>
          <Button size="sm" variant="bordered" onPress={onRequestChanges} className="flex-1">
            ✎ Request Changes
          </Button>
        </div>
      ) : (
        <div className="px-4 py-2.5 border-t border-divider bg-success/10 text-success text-xs font-semibold text-center">
          ✓ Plan confirmed — execution started
        </div>
      )}
    </div>
  );
}
