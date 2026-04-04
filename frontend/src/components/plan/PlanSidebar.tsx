import { useState } from "react";
import { Chip, Divider } from "@heroui/react";
import type { Plan, Task, AgentProfile, Repository } from "../../types";
import { formatStatus } from "../../lib/statusLabels";
import PlanDAG from "./PlanDAG";

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

type ViewMode = "list" | "graph";

interface Props {
  plan: Plan;
  tasks: Task[];
  agentProfiles?: AgentProfile[];
  repositories?: Repository[];
}

export default function PlanSidebar({ plan, tasks, agentProfiles = [], repositories = [] }: Props) {
  const [view, setView] = useState<ViewMode>("list");
  const sorted = [...tasks].sort((a, b) => a.execution_order - b.execution_order);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0 space-y-3">
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
            {formatStatus(plan.status)}
          </Chip>
        </div>

        {/* List / Graph toggle */}
        <div
          role="tablist"
          aria-label="Plan view"
          className="flex rounded-lg bg-default-100 p-0.5 gap-0.5"
        >
          {(["list", "graph"] as ViewMode[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-md text-xs font-medium transition-colors ${
                view === v
                  ? "bg-content1 text-foreground shadow-sm"
                  : "text-default-400 hover:text-foreground"
              }`}
            >
              {v === "list" ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  List
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
                    <line x1="12" y1="7" x2="5.5" y2="17.5" /><line x1="12" y1="7" x2="18.5" y2="17.5" />
                  </svg>
                  Graph
                </>
              )}
            </button>
          ))}
        </div>

        <Divider />
      </div>

      {/* Content */}
      {view === "list" ? (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
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
                        {formatStatus(t.status)}
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
      ) : (
        <div className="flex-1 overflow-hidden">
          {sorted.length === 0 ? (
            <p className="text-sm text-default-400 text-center py-8 px-4">
              No tasks yet. Keep chatting!
            </p>
          ) : (
            <PlanDAG
              tasks={tasks}
              agentProfiles={agentProfiles}
              repositories={repositories}
              height={undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}
