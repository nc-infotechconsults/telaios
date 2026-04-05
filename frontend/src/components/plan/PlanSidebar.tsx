import { useState } from "react";
import { Chip, Divider, Modal, ModalContent, ModalBody, useDisclosure } from "@heroui/react";
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
  /** All confirmed/executing plans for this project. */
  plans: Plan[];
  /** ID of the plan currently shown. */
  activePlanId: string;
  onPlanChange: (planId: string) => void;
  tasks: Task[];
  agentProfiles?: AgentProfile[];
  repositories?: Repository[];
}

export default function PlanSidebar({
  plans,
  activePlanId,
  onPlanChange,
  tasks,
  agentProfiles = [],
  repositories = [],
}: Props) {
  const [view, setView] = useState<ViewMode>("list");
  const { isOpen: isGraphOpen, onOpen: onGraphOpen, onOpenChange: onGraphOpenChange } = useDisclosure();

  const activePlan = plans.find((p) => p.id === activePlanId);
  const sorted = [...tasks].sort((a, b) => a.execution_order - b.execution_order);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 shrink-0 space-y-3">

        {/* Plan picker — only shown when there are multiple plans */}
        {plans.length > 1 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Plan versions">
            {plans.map((p, i) => (
              <button
                key={p.id}
                aria-pressed={p.id === activePlanId}
                onClick={() => onPlanChange(p.id)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors border ${
                  p.id === activePlanId
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-divider text-default-400 hover:text-foreground"
                }`}
              >
                Plan v{i + 1}
              </button>
            ))}
          </div>
        )}

        {/* Plan title + status */}
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">
            {plans.length === 1 ? "Execution Plan" : `Plan v${plans.findIndex((p) => p.id === activePlanId) + 1}`}
          </span>
          {activePlan && (
            <Chip
              size="sm"
              variant="flat"
              color={
                activePlan.status === "confirmed" || activePlan.status === "executing" || activePlan.status === "completed"
                  ? "success"
                  : "warning"
              }
            >
              {formatStatus(activePlan.status)}
            </Chip>
          )}
        </div>

        {/* List / Graph toggle + graph expand */}
        <div className="flex items-center gap-1">
          <div
            role="tablist"
            aria-label="Plan view"
            className="flex flex-1 rounded-lg bg-default-100 p-0.5 gap-0.5"
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

          {/* Full-screen expand — only useful in graph view */}
          {view === "graph" && (
            <button
              onClick={onGraphOpen}
              aria-label="Expand graph to full screen"
              className="p-1.5 rounded-md text-default-400 hover:text-foreground hover:bg-default-100 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}
        </div>

        <Divider />
      </div>

      {/* ── Content ── */}
      {view === "list" ? (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {sorted.length === 0 ? (
            <p className="text-sm text-default-400 text-center py-4">No tasks yet.</p>
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
            <p className="text-sm text-default-400 text-center py-8 px-4">No tasks yet.</p>
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

      {/* ── Full-screen graph modal ── */}
      <Modal
        isOpen={isGraphOpen}
        onOpenChange={onGraphOpenChange}
        size="full"
        scrollBehavior="inside"
        classNames={{ base: "m-0 rounded-none max-h-screen", body: "p-0 h-[calc(100vh-60px)]" }}
      >
        <ModalContent>
          {() => (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-divider shrink-0">
                <span className="font-semibold text-sm">
                  {activePlan
                    ? `Execution Plan — ${formatStatus(activePlan.status)}`
                    : "Execution Plan"}
                </span>
                <span className="text-xs text-default-400 ml-1">
                  {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                </span>
              </div>
              <ModalBody>
                <PlanDAG
                  tasks={tasks}
                  agentProfiles={agentProfiles}
                  repositories={repositories}
                  height={undefined}
                />
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}

