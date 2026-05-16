import { Card, CardBody, CardHeader, Chip, Divider } from "../ui";

export type AgentRole = "code" | "review" | "test" | "knowledge" | "infra" | "general";

export interface AgentEvent {
  /** Unique key for React rendering. */
  id: string;
  type: "started" | "completed" | "failed";
  task_id: string;
  agent_role: string;
  error?: string;
  timestamp: number;
}

export interface PipelineState {
  plan_id: string;
  /** Pipeline display name (only set once pipeline_complete fires). */
  pipeline?: string;
  current_step: string;
  step_index: number;
  total_steps: number;
  status: "running" | "complete" | "failed";
}

interface Props {
  pipelineState: PipelineState | null;
  agentEvents: AgentEvent[];
}

const ROLE_LABEL: Record<string, string> = {
  code: "Coder",
  review: "Reviewer",
  test: "Tester",
  knowledge: "Knowledge",
  infra: "Infrastructure",
  general: "General",
};

const EVENT_COLOR: Record<AgentEvent["type"], "warning" | "success" | "danger"> = {
  started: "warning",
  completed: "success",
  failed: "danger",
};

const EVENT_ICON: Record<AgentEvent["type"], string> = {
  started: "⟳",
  completed: "✓",
  failed: "✗",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function AgentActivityPanel({ pipelineState, agentEvents }: Props) {
  const hasActivity = pipelineState !== null || agentEvents.length > 0;

  if (!hasActivity) {
    return (
      <Card className="apple-card">
        <CardBody>
          <p className="text-sm text-default-400 italic">No agent activity yet.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-default-600">Agent Activity</p>

      {/* Pipeline progress */}
      {pipelineState && (
        <Card className="apple-card">
          <CardHeader className="flex items-start justify-between pb-1">
            <span className="text-sm font-semibold">Pipeline</span>
            <Chip
              size="sm"
              variant="flat"
              color={
                pipelineState.status === "complete"
                  ? "success"
                  : pipelineState.status === "failed"
                    ? "danger"
                    : "warning"
              }
            >
              {pipelineState.status}
            </Chip>
          </CardHeader>

          <Divider />

          <CardBody className="pt-2 space-y-2">
            {pipelineState.pipeline && (
              <p className="text-xs text-default-500 font-medium">{pipelineState.pipeline}</p>
            )}

            {/* Step progress bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-default-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    pipelineState.status === "failed" ? "bg-danger" : "bg-primary"
                  }`}
                  style={{
                    width: `${
                      pipelineState.total_steps > 0
                        ? Math.round(
                            ((pipelineState.step_index +
                              (pipelineState.status === "complete" ? 1 : 0)) /
                              pipelineState.total_steps) *
                              100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
              <span className="text-xs text-default-400 shrink-0">
                {pipelineState.status === "complete"
                  ? pipelineState.total_steps
                  : pipelineState.step_index + 1}
                /{pipelineState.total_steps}
              </span>
            </div>

            {/* Current step label */}
            <p className="text-xs text-default-500">
              Step:{" "}
              <span className="font-medium text-foreground">
                {ROLE_LABEL[pipelineState.current_step] ?? pipelineState.current_step}
              </span>
            </p>
          </CardBody>
        </Card>
      )}

      {/* Recent agent lifecycle events */}
      {agentEvents.length > 0 && (
        <Card className="apple-card">
          <CardHeader className="pb-1">
            <span className="text-sm font-semibold">Recent Events</span>
          </CardHeader>

          <Divider />

          <CardBody className="pt-2 space-y-1.5 max-h-64 overflow-y-auto">
            {agentEvents.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2">
                <span
                  className={`text-xs mt-0.5 shrink-0 ${
                    ev.type === "completed"
                      ? "text-success"
                      : ev.type === "failed"
                        ? "text-danger"
                        : "text-warning"
                  }`}
                  aria-hidden="true"
                >
                  {EVENT_ICON[ev.type]}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Chip size="sm" variant="flat" color={EVENT_COLOR[ev.type]} className="h-4 text-[10px]">
                      {ev.type}
                    </Chip>
                    <span className="text-xs font-medium">
                      {ROLE_LABEL[ev.agent_role] ?? ev.agent_role}
                    </span>
                  </div>

                  {ev.error && (
                    <p className="text-[10px] text-danger truncate mt-0.5" title={ev.error}>
                      {ev.error}
                    </p>
                  )}

                  <p className="text-[10px] text-default-400 mt-0.5">{formatTime(ev.timestamp)}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
