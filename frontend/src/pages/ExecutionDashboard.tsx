import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardBody, CardHeader, Chip, Button, Spinner, useDisclosure } from "@heroui/react";
import {
  getPlans,
  getTasks,
  getRepositories,
  getAgentProfiles,
  retryTask,
  cancelTask,
  cancelPlan,
  resumePlan,
} from "../lib/api";
import { usePlanSSE } from "../lib/sse";
import { formatStatus } from "../lib/statusLabels";
import type { Plan, Task, Repository, AgentProfile, WsEvent } from "../types";
import PlanDAG from "../components/plan/PlanDAG";
import TaskDetailModal from "../components/plan/TaskDetailModal";
import AgentPoolPanel from "../components/agents/AgentPoolPanel";
import AgentActivityPanel from "../components/agents/AgentActivityPanel";
import type { AgentInstance } from "../components/agents/AgentStatusBadge";
import type { AgentEvent, PipelineState } from "../components/agents/AgentActivityPanel";

type PlanViewMode = "graph" | "list";

const REPO_STATUS_STYLES: Record<string, string> = {
  ready: "border-success/40 bg-success/10 text-success",
  error: "border-danger/40 bg-danger/10 text-danger",
  cloning: "border-warning/40 bg-warning/10 text-warning",
  unconfigured: "border-default/40 bg-default/10 text-default-500",
};

const REPO_STATUS_ICON: Record<string, string> = {
  ready: "✓",
  error: "✗",
  cloning: "⟳",
  unconfigured: "○",
};

const PLAN_STATUS_COLOR: Record<
  Plan["status"],
  "default" | "warning" | "primary" | "success" | "danger"
> = {
  draft: "default",
  confirmed: "primary",
  executing: "warning",
  completed: "success",
  failed: "danger",
};

function taskDurationMs(task: Task): number | null {
  if (!task.started_at || !task.completed_at) return null;
  const ms = new Date(task.completed_at).getTime() - new Date(task.started_at).getTime();
  return ms > 0 ? ms : null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

export default function ExecutionDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [repoStatuses, setRepoStatuses] = useState<Record<string, Repository["status"]>>({});
  const [agentInstances, setAgentInstances] = useState<AgentInstance[]>([]);
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [planView, setPlanView] = useState<PlanViewMode>("graph");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onOpenChange: onDetailOpenChange } = useDisclosure();

  function openTaskDetail(task: Task) {
    setSelectedTask(task);
    onDetailOpen();
  }

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      getPlans(projectId).then((plans): Promise<{ plan: Plan | null; tasks: Task[] }> => {
        const active = plans.find(
          (p) =>
            p.status === "confirmed" ||
            p.status === "executing" ||
            p.status === "completed" ||
            p.status === "failed"
        );
        if (active) {
          return getTasks(active.id).then((t) => ({ plan: active, tasks: t }));
        }
        return Promise.resolve({ plan: null, tasks: [] });
      }),
      getRepositories(projectId),
      getAgentProfiles(),
    ])
      .then(([{ plan, tasks: fetchedTasks }, repos, profiles]) => {
        setActivePlan(plan);
        setTasks(fetchedTasks);
        setRepositories(repos);
        setAgentProfiles(profiles);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type === "task_status") {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === event.task_id
            ? { ...t, status: event.status, assigned_instance_id: event.agent_instance_id }
            : t
        )
      );
      // Keep selectedTask in sync
      setSelectedTask((prev) =>
        prev && prev.id === event.task_id
          ? { ...prev, status: event.status, assigned_instance_id: event.agent_instance_id }
          : prev
      );
      if (event.agent_instance_id && event.agent_profile_id) {
        const isBusy = event.status === "in_progress";
        setAgentInstances((prev) => {
          const existing = prev.find((i) => i.instance_id === event.agent_instance_id);
          if (existing) {
            return prev.map((i) =>
              i.instance_id === event.agent_instance_id
                ? { ...i, status: isBusy ? "busy" : "idle", current_task_id: isBusy ? event.task_id : undefined }
                : i
            );
          }
          return [
            ...prev,
            {
              instance_id: event.agent_instance_id!,
              profile_id: event.agent_profile_id!,
              status: isBusy ? "busy" : "idle",
              current_task_id: isBusy ? event.task_id : undefined,
            },
          ];
        });
      }

    } else if (event.type === "plan_executing") {
      setActivePlan((prev) => prev ? { ...prev, status: "executing" } : prev);

    } else if (event.type === "plan_completed") {
      setActivePlan((prev) => prev ? { ...prev, status: "completed" } : prev);

    } else if (event.type === "plan_failed") {
      setActivePlan((prev) =>
        prev ? { ...prev, status: "failed", failure_reason: event.reason ?? null } : prev
      );

    } else if (event.type === "repo_status") {
      setRepoStatuses((prev) => ({ ...prev, [event.repo_id]: event.status as Repository["status"] }));

    } else if (event.type === "agent_status") {
      setAgentInstances((prev) => {
        const existing = prev.find((i) => i.instance_id === event.instance_id);
        const updated = {
          instance_id: event.instance_id,
          profile_id: event.profile_id,
          status: event.status as AgentInstance["status"],
          current_task_id: event.task_id,
        };
        if (existing) {
          return prev.map((i) => (i.instance_id === event.instance_id ? updated : i));
        }
        return [...prev, updated];
      });

    // ── Agent lifecycle events ──────────────────────────────────────────────
    } else if (event.type === "agent_started") {
      const agentEvent: AgentEvent = {
        id: `${event.task_id}-${Date.now()}`,
        type: "started",
        task_id: event.task_id,
        agent_role: event.agent_role,
        timestamp: Date.now(),
      };
      setAgentEvents((prev) => [agentEvent, ...prev].slice(0, 20));

    } else if (event.type === "agent_completed") {
      const agentEvent: AgentEvent = {
        id: `${event.task_id}-${Date.now()}`,
        type: "completed",
        task_id: event.task_id,
        agent_role: event.agent_role,
        timestamp: Date.now(),
      };
      setAgentEvents((prev) => [agentEvent, ...prev].slice(0, 20));

    } else if (event.type === "agent_failed") {
      const agentEvent: AgentEvent = {
        id: `${event.task_id}-${Date.now()}`,
        type: "failed",
        task_id: event.task_id,
        agent_role: event.agent_role,
        error: event.error,
        timestamp: Date.now(),
      };
      setAgentEvents((prev) => [agentEvent, ...prev].slice(0, 20));

    // ── Pipeline events ─────────────────────────────────────────────────────
    } else if (event.type === "pipeline_step_started") {
      setPipelineState({
        plan_id: event.plan_id,
        current_step: event.step,
        step_index: event.step_index,
        total_steps: event.total_steps,
        status: "running",
      });
    } else if (event.type === "pipeline_complete") {
      setPipelineState((prev) =>
        prev
          ? { ...prev, pipeline: event.pipeline, status: "complete" }
          : null
      );
    } else if (event.type === "pipeline_failed") {
      setPipelineState((prev) =>
        prev ? { ...prev, status: "failed" } : null
      );
    }
  }, []);

  // SSE is plan-scoped (keyed on plan ID)
  usePlanSSE(activePlan?.id, handleWsEvent);

  // ── Task control handlers ─────────────────────────────────────────────────
  function handleRetryTask(task: Task) {
    retryTask(task.id)
      .then((updated) => {
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setSelectedTask(updated);
      })
      .catch(console.error);
  }

  function handleCancelTask(task: Task) {
    cancelTask(task.id)
      .then((updated) => {
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setSelectedTask(updated);
      })
      .catch(console.error);
  }

  function handleCancelPlan() {
    if (!activePlan) return;
    cancelPlan(activePlan.id).catch(console.error);
  }

  function handleResumePlan() {
    if (!activePlan) return;
    resumePlan(activePlan.id).catch(console.error);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const cancelled = tasks.filter((t) => t.status === "cancelled").length;
  const skipped = tasks.filter((t) => t.status === "skipped").length;
  const total = tasks.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  // Total wall-clock execution time: sum of all tasks that have timing data
  const totalDurationMs = tasks.reduce<number>((acc, t) => {
    const ms = taskDurationMs(t);
    return ms != null ? acc + ms : acc;
  }, 0);

  const enrichedInstances: AgentInstance[] = agentInstances.map((inst) => {
    const task = tasks.find((t) => t.id === inst.current_task_id);
    return { ...inst, current_task_title: task?.title };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" label="Loading execution state…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-3 border-b border-divider shrink-0 flex-wrap">
        <button
          onClick={() => navigate(`/projects/${projectId}`)}
          aria-label="Back to planning chat"
          className="text-default-400 hover:text-foreground transition-colors text-sm shrink-0"
        >
          ← Planning
        </button>
        <span className="text-default-300 shrink-0">/</span>
        <h2 className="font-semibold text-sm sm:text-base">Execution Dashboard</h2>

        {/* Plan status */}
        {activePlan && (
          <Chip
            size="sm"
            color={PLAN_STATUS_COLOR[activePlan.status]}
            variant="flat"
            className="shrink-0"
          >
            {formatStatus(activePlan.status)}
          </Chip>
        )}

        <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
          {/* Task stats */}
          <Chip size="sm" color="success" variant="flat">{done}/{total} done</Chip>
          {inProgress > 0 && <Chip size="sm" color="warning" variant="flat">{inProgress} running</Chip>}
          {failed > 0 && <Chip size="sm" color="danger" variant="flat">{failed} {failed === 1 ? "failure" : "failures"}</Chip>}
          {cancelled > 0 && <Chip size="sm" color="default" variant="flat">{cancelled} cancelled</Chip>}
          {skipped > 0 && <Chip size="sm" color="default" variant="flat">{skipped} skipped</Chip>}
          {totalDurationMs > 0 && (
            <Chip size="sm" color="default" variant="bordered" className="font-mono">
              ⏱ {formatDuration(totalDurationMs)}
            </Chip>
          )}

          {/* Plan-level controls */}
          {activePlan?.status === "executing" && (
            <Button size="sm" color="danger" variant="flat" onPress={handleCancelPlan}>
              Cancel plan
            </Button>
          )}
          {activePlan?.status === "failed" && (
            <Button size="sm" color="primary" variant="flat" onPress={handleResumePlan}>
              Resume
            </Button>
          )}
        </div>
      </div>

      {/* Failure reason banner */}
      {activePlan?.status === "failed" && activePlan.failure_reason && (
        <div className="px-4 sm:px-6 py-2 bg-danger/10 border-b border-danger/20 text-danger text-xs shrink-0">
          <span className="font-semibold">Plan failed:</span> {activePlan.failure_reason}
        </div>
      )}

      {/* Progress bar */}
      {total > 0 && (
        <div
          className="h-2 bg-default-100 shrink-0"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Execution progress: ${progress}%`}
        >
          <div
            className="h-full bg-success transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Repo status banners */}
          {repositories.length > 0 && (
            <div className="flex gap-2 flex-wrap px-6 py-3 border-b border-divider shrink-0">
              {repositories.map((r) => {
                const st = (repoStatuses[r.id] ?? r.status) as Repository["status"];
                const styleClass = REPO_STATUS_STYLES[st] ?? REPO_STATUS_STYLES.unconfigured;
                const icon = REPO_STATUS_ICON[st] ?? "○";
                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${styleClass}`}
                    title={`${r.name}: ${formatStatus(st)}`}
                  >
                    <span aria-hidden="true">{icon}</span>
                    <span>{r.name}</span>
                    <span className="opacity-70">— {formatStatus(st)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* DAG / List */}
          <div className="flex-1 overflow-hidden p-4">
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <div className="text-5xl">📋</div>
                <p className="text-default-500 text-sm">
                  No tasks yet. Confirm a plan in the planning chat to start execution.
                </p>
                <Button
                  size="sm"
                  variant="bordered"
                  onPress={() => navigate(`/projects/${projectId}`)}
                >
                  Go to Planning
                </Button>
              </div>
            ) : (
              <Card className="h-full flex flex-col clay-card">
                <CardHeader className="flex items-center justify-between pb-0 shrink-0">
                  <span className="text-sm font-medium text-default-500">
                    Task Dependency Plan
                  </span>

                  {/* Graph / List toggle */}
                  <div
                    role="group"
                    aria-label="Plan view"
                    className="flex rounded-lg bg-default-100 p-0.5 gap-0.5"
                  >
                    {(["graph", "list"] as PlanViewMode[]).map((v) => (
                      <button
                        key={v}
                        aria-pressed={planView === v}
                        onClick={() => setPlanView(v)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          planView === v
                            ? "bg-content1 text-foreground shadow-sm"
                            : "text-default-400 hover:text-foreground"
                        }`}
                      >
                        {v === "graph" ? (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
                              <line x1="12" y1="7" x2="5.5" y2="17.5" /><line x1="12" y1="7" x2="18.5" y2="17.5" />
                            </svg>
                            Graph
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                            List
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </CardHeader>

                <CardBody className="p-2 flex-1 overflow-hidden">
                  {planView === "graph" ? (
                    <PlanDAG
                      tasks={tasks}
                      agentProfiles={agentProfiles}
                      repositories={repositories}
                      height={undefined}
                      onTaskClick={openTaskDetail}
                    />
                  ) : (
                    <div className="h-full overflow-y-auto">
                      <ul className="divide-y divide-divider">
                        {[...tasks]
                          .sort((a, b) => a.execution_order - b.execution_order)
                          .map((t) => {
                            const profile = agentProfiles.find((p) => p.id === t.agent_profile_id);
                            const depCount = (t.depends_on_task_ids ?? []).length;
                            return (
                              <li key={t.id} className="flex items-center">
                                <button
                                  type="button"
                                  onClick={() => openTaskDetail(t)}
                                  className="flex-1 text-left px-3 py-2.5 flex items-center gap-3 hover:bg-default-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors"
                                >
                                  {/* Execution order */}
                                  <span className="text-xs text-default-400 w-5 shrink-0 text-right font-mono">
                                    {t.execution_order}
                                  </span>

                                  {/* Status chip */}
                                  <Chip
                                    size="sm"
                                    color={
                                      t.status === "done" ? "success"
                                      : t.status === "in_progress" ? "warning"
                                      : t.status === "failed" ? "danger"
                                      : t.status === "ready" ? "primary"
                                      : "default"
                                    }
                                    variant="flat"
                                    className="shrink-0"
                                  >
                                    {t.status.replace("_", " ")}
                                  </Chip>

                                  {/* Title */}
                                  <span className="flex-1 text-sm font-medium truncate">{t.title}</span>

                                  {/* Type */}
                                  <Chip size="sm" variant="bordered" className="shrink-0 hidden sm:flex">
                                    {t.type}
                                  </Chip>

                                  {/* Agent profile */}
                                  {profile && (
                                    <span className="text-xs text-default-400 shrink-0 hidden md:block truncate max-w-[120px]">
                                      {profile.name}
                                    </span>
                                  )}

                                  {/* Duration */}
                                  {(() => {
                                    const ms = taskDurationMs(t);
                                    return ms != null ? (
                                      <span className="text-xs font-mono text-default-400 shrink-0 hidden sm:block">
                                        {formatDuration(ms)}
                                      </span>
                                    ) : null;
                                  })()}

                                  {/* Deps */}
                                  {depCount > 0 && (
                                    <span className="text-xs text-default-400 shrink-0 hidden sm:block">
                                      ⛓ {depCount}
                                    </span>
                                  )}

                                  {/* Chevron */}
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-default-300" aria-hidden="true">
                                    <polyline points="9 18 15 12 9 6" />
                                  </svg>
                                </button>

                                {/* Inline task controls */}
                                {t.status === "failed" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryTask(t)}
                                    className="shrink-0 px-2 py-1 mx-1 rounded text-xs text-primary hover:bg-primary/10 transition-colors"
                                    title="Retry task"
                                  >
                                    Retry
                                  </button>
                                )}
                                {(t.status === "pending" || t.status === "ready") && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelTask(t)}
                                    className="shrink-0 px-2 py-1 mx-1 rounded text-xs text-danger hover:bg-danger/10 transition-colors"
                                    title="Cancel task"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  )}
                </CardBody>
              </Card>
            )}
          </div>
        </div>

        {/* Right sidebar: agent pool + activity */}
        <div className="hidden lg:flex flex-col w-64 xl:w-72 shrink-0 border-l border-divider overflow-y-auto p-4 gap-4">
          <AgentPoolPanel
            agentProfiles={agentProfiles}
            instances={enrichedInstances}
          />
          <AgentActivityPanel
            pipelineState={pipelineState}
            agentEvents={agentEvents}
          />
        </div>
      </div>

      {/* Task detail modal */}
      <TaskDetailModal
        task={selectedTask}
        tasks={tasks}
        agentProfiles={agentProfiles}
        repositories={repositories}
        isOpen={isDetailOpen}
        onOpenChange={onDetailOpenChange}
        onNavigate={openTaskDetail}
        onRetry={handleRetryTask}
        onCancel={handleCancelTask}
      />
    </div>
  );
}
