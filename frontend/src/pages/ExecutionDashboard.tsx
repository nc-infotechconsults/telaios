import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardBody, CardHeader, Chip, Button, Spinner } from "@heroui/react";
import { getPlan, getTasks, getRepositories, getAgentProfiles } from "../lib/api";
import { useProjectWebSocket } from "../lib/ws";
import { formatStatus } from "../lib/statusLabels";
import type { Task, Repository, AgentProfile, WsEvent } from "../types";
import PlanDAG from "../components/plan/PlanDAG";
import TaskCard from "../components/plan/TaskCard";
import AgentPoolPanel from "../components/agents/AgentPoolPanel";
import type { AgentInstance } from "../components/agents/AgentStatusBadge";

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

export default function ExecutionDashboard() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [repoStatuses, setRepoStatuses] = useState<Record<string, Repository["status"]>>({});
  const [agentInstances, setAgentInstances] = useState<AgentInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [planView, setPlanView] = useState<PlanViewMode>("graph");

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      getPlan(projectId).then((p) => (p ? getTasks(p.id) : [])),
      getRepositories(projectId),
      getAgentProfiles(),
    ])
      .then(([fetchedTasks, repos, profiles]) => {
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
    }
  }, []);

  useProjectWebSocket(projectId, handleWsEvent);

  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const total = tasks.length;

  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

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
      <div className="flex items-center gap-4 px-6 py-3 border-b border-divider shrink-0">
        <button
          onClick={() => navigate(`/projects/${projectId}`)}
          aria-label="Back to planning chat"
          className="text-default-400 hover:text-foreground transition-colors text-sm"
        >
          ← Planning
        </button>
        <span className="text-default-300">/</span>
        <h2 className="font-semibold">Execution Dashboard</h2>

        <div className="flex items-center gap-2 ml-auto">
          <Chip size="sm" color="success" variant="flat">{done}/{total} done</Chip>
          {inProgress > 0 && <Chip size="sm" color="warning" variant="flat">{inProgress} running</Chip>}
          {failed > 0 && <Chip size="sm" color="danger" variant="flat">{failed} {failed === 1 ? "failure" : "failures"}</Chip>}
        </div>
      </div>

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

          {/* DAG */}
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
              <Card className="h-full flex flex-col">
                <CardHeader className="flex items-center justify-between pb-0 shrink-0">
                  <span className="text-sm font-medium text-default-500">
                    Task Dependency Plan
                  </span>

                  {/* Graph / List toggle */}
                  <div
                    role="tablist"
                    aria-label="Plan view"
                    className="flex rounded-lg bg-default-100 p-0.5 gap-0.5"
                  >
                    {(["graph", "list"] as PlanViewMode[]).map((v) => (
                      <button
                        key={v}
                        role="tab"
                        aria-selected={planView === v}
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
                    />
                  ) : (
                    <div className="h-full overflow-y-auto p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 content-start">
                      {[...tasks]
                        .sort((a, b) => a.execution_order - b.execution_order)
                        .map((t) => (
                          <TaskCard
                            key={t.id}
                            task={t}
                            profile={agentProfiles.find((p) => p.id === t.agent_profile_id)}
                            repositories={repositories}
                            showResult
                          />
                        ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            )}
          </div>
        </div>

        {/* Right sidebar: agent pool */}
        <div className="w-72 shrink-0 border-l border-divider overflow-y-auto p-4">
          <AgentPoolPanel
            agentProfiles={agentProfiles}
            instances={enrichedInstances}
          />
        </div>
      </div>
    </div>
  );
}
