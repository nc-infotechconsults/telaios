import { useState } from "react";
import {
  Chip,
  Divider,
  Modal,
  ModalContent,
  ModalBody,
  ModalHeader,
  useDisclosure,
} from "@heroui/react";
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

const TYPE_COLOR: Record<Task["type"], "default" | "primary" | "secondary" | "warning"> = {
  code: "primary",
  test: "secondary",
  review: "warning",
  general: "default",
};

const DRIVER_COLOR: Record<AgentProfile["agent_type"], "primary" | "secondary" | "success"> = {
  langgraph: "primary",
  opencode: "secondary",
  "github-copilot": "success",
};

type ViewMode = "list" | "graph";

interface Props {
  plans: Plan[];
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
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const { isOpen: isGraphOpen, onOpen: onGraphOpen, onOpenChange: onGraphOpenChange } = useDisclosure();
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onOpenChange: onDetailOpenChange } = useDisclosure();

  const activePlan = plans.find((p) => p.id === activePlanId);
  const sorted = [...tasks].sort((a, b) => a.execution_order - b.execution_order);

  function openDetail(task: Task) {
    setSelectedTask(task);
    onDetailOpen();
  }

  const selProfile = selectedTask ? agentProfiles.find((p) => p.id === selectedTask.agent_profile_id) : undefined;
  const selRepos = selectedTask
    ? (selectedTask.repository_ids ?? [])
        .map((rid) => repositories.find((r) => r.id === rid))
        .filter(Boolean) as Repository[]
    : [];

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 shrink-0 space-y-3">

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

        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">
            {plans.length === 1 ? "Execution Plan" : `Plan v${plans.findIndex((p) => p.id === activePlanId) + 1}`}
          </span>
          {activePlan && (
            <Chip
              size="sm"
              variant="flat"
              color={
                activePlan.status === "confirmed" ||
                activePlan.status === "executing" ||
                activePlan.status === "completed"
                  ? "success"
                  : "warning"
              }
            >
              {formatStatus(activePlan.status)}
            </Chip>
          )}
        </div>

        {/* List / Graph toggle */}
        <div className="flex items-center gap-1">
          <div role="group" aria-label="Plan view" className="flex flex-1 rounded-lg bg-default-100 p-0.5 gap-0.5">
            {(["list", "graph"] as ViewMode[]).map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
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

      {/* ── List view ── */}
      {view === "list" ? (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {sorted.length === 0 ? (
            <p className="text-sm text-default-400 text-center py-4">No tasks yet.</p>
          ) : (
            <div className="flex flex-col">
              {sorted.map((t, i) => {
                const profile = agentProfiles.find((p) => p.id === t.agent_profile_id);
                const taskRepos = (t.repository_ids ?? [])
                  .map((rid) => repositories.find((r) => r.id === rid))
                  .filter(Boolean) as Repository[];
                const depTasks = (t.depends_on_task_ids ?? [])
                  .map((id) => sorted.find((s) => s.id === id))
                  .filter(Boolean) as Task[];
                const unlocksTasks = sorted.filter((s) =>
                  (s.depends_on_task_ids ?? []).includes(t.id)
                );

                return (
                  <div key={t.id}>
                    {/* Connector line between items */}
                    {i > 0 && (
                      <div className="flex justify-center h-4">
                        <div className="w-px bg-divider" />
                      </div>
                    )}

                    <button
                      onClick={() => openDetail(t)}
                      className="w-full text-left p-3 rounded-xl bg-default-50 border border-divider hover:bg-default-100 hover:border-primary/40 transition-all group space-y-2"
                    >
                      {/* Title + status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-default-200 text-default-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-xs font-semibold leading-snug group-hover:text-primary transition-colors">
                            {t.title}
                          </span>
                        </div>
                        <Chip size="sm" color={STATUS_COLOR[t.status]} variant="flat" className="shrink-0">
                          {formatStatus(t.status)}
                        </Chip>
                      </div>

                      {/* Type + agent + repo badges */}
                      <div className="flex flex-wrap gap-1 pl-7">
                        <Chip size="sm" color={TYPE_COLOR[t.type]} variant="bordered">{t.type}</Chip>
                        {profile && (
                          <>
                            <Chip size="sm" color={DRIVER_COLOR[profile.agent_type]} variant="flat">
                              {profile.agent_type}
                            </Chip>
                            <Chip size="sm" variant="bordered" className="max-w-[110px] truncate" title={profile.name}>
                              {profile.name}
                            </Chip>
                          </>
                        )}
                        {taskRepos.map((r) => (
                          <Chip key={r.id} size="sm" variant="bordered" color="primary">
                            📁 {r.name}
                          </Chip>
                        ))}
                      </div>

                      {/* Dependencies */}
                      {depTasks.length > 0 && (
                        <div className="pl-7 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-default-400 shrink-0">⛓ needs:</span>
                          {depTasks.map((dep) => (
                            <span
                              key={dep.id}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-default-200 text-default-600"
                            >
                              {dep.title}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Unlocks */}
                      {unlocksTasks.length > 0 && (
                        <div className="pl-7 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-default-400 shrink-0">↗ unlocks:</span>
                          {unlocksTasks.map((dep) => (
                            <span
                              key={dep.id}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-default-200 text-default-600"
                            >
                              {dep.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── Graph view ── */
        <div className="flex-1 overflow-hidden">
          {sorted.length === 0 ? (
            <p className="text-sm text-default-400 text-center py-8 px-4">No tasks yet.</p>
          ) : (
            <PlanDAG
              tasks={tasks}
              agentProfiles={agentProfiles}
              repositories={repositories}
              height={undefined}
              onTaskClick={openDetail}
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
                  onTaskClick={openDetail}
                />
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Task detail modal ── */}
      <Modal isOpen={isDetailOpen} onOpenChange={onDetailOpenChange} size="lg" scrollBehavior="inside">
        <ModalContent>
          {() =>
            selectedTask && (
              <>
                <ModalHeader className="flex items-center gap-3 pb-2">
                  <span className="flex-1 text-base font-semibold leading-snug">{selectedTask.title}</span>
                  <Chip size="sm" color={STATUS_COLOR[selectedTask.status]} variant="flat" className="shrink-0">
                    {formatStatus(selectedTask.status)}
                  </Chip>
                </ModalHeader>
                <ModalBody className="pb-6 space-y-4">

                  {selectedTask.description && (
                    <p className="text-sm text-default-600 leading-relaxed">{selectedTask.description}</p>
                  )}

                  <Divider />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] text-default-400 mb-1 uppercase tracking-wide">Type</p>
                      <Chip size="sm" color={TYPE_COLOR[selectedTask.type]} variant="bordered">
                        {selectedTask.type}
                      </Chip>
                    </div>
                    <div>
                      <p className="text-[11px] text-default-400 mb-1 uppercase tracking-wide">Execution order</p>
                      <span className="text-sm font-mono text-foreground">#{selectedTask.execution_order}</span>
                    </div>
                  </div>

                  {selProfile && (
                    <div>
                      <p className="text-[11px] text-default-400 mb-1.5 uppercase tracking-wide">Agent</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Chip size="sm" color={DRIVER_COLOR[selProfile.agent_type]} variant="flat">
                          {selProfile.agent_type}
                        </Chip>
                        <Chip size="sm" variant="bordered">{selProfile.name}</Chip>
                      </div>
                    </div>
                  )}

                  {selRepos.length > 0 && (
                    <div>
                      <p className="text-[11px] text-default-400 mb-1.5 uppercase tracking-wide">Repositories</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selRepos.map((r) => (
                          <Chip key={r.id} size="sm" variant="bordered" color="primary">📁 {r.name}</Chip>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedTask.depends_on_task_ids ?? []).length > 0 && (
                    <div>
                      <p className="text-[11px] text-default-400 mb-1.5 uppercase tracking-wide">Depends on</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTask.depends_on_task_ids!.map((depId) => {
                          const dep = sorted.find((t) => t.id === depId);
                          return dep ? (
                            <button
                              key={depId}
                              onClick={() => setSelectedTask(dep)}
                              className="text-xs px-2.5 py-1 rounded-full bg-default-100 hover:bg-default-200 text-default-700 transition-colors"
                            >
                              ⛓ {dep.title}
                            </button>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}

                  {(() => {
                    const unlocks = sorted.filter((t) =>
                      (t.depends_on_task_ids ?? []).includes(selectedTask.id)
                    );
                    return unlocks.length > 0 ? (
                      <div>
                        <p className="text-[11px] text-default-400 mb-1.5 uppercase tracking-wide">Unlocks</p>
                        <div className="flex flex-wrap gap-1.5">
                          {unlocks.map((dep) => (
                            <button
                              key={dep.id}
                              onClick={() => setSelectedTask(dep)}
                              className="text-xs px-2.5 py-1 rounded-full bg-default-100 hover:bg-default-200 text-default-700 transition-colors"
                            >
                              ↗ {dep.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {selectedTask.result && (
                    <div>
                      <p className="text-[11px] text-default-400 mb-1.5 uppercase tracking-wide">Result</p>
                      <p className="text-xs text-default-600 bg-default-50 rounded-lg p-3 leading-relaxed">
                        {selectedTask.result}
                      </p>
                    </div>
                  )}

                  {selectedTask.assigned_instance_id && (
                    <div>
                      <p className="text-[11px] text-default-400 mb-1 uppercase tracking-wide">Agent instance</p>
                      <code className="text-xs bg-default-100 px-2 py-0.5 rounded">
                        {selectedTask.assigned_instance_id}
                      </code>
                    </div>
                  )}
                </ModalBody>
              </>
            )
          }
        </ModalContent>
      </Modal>
    </div>
  );
}
