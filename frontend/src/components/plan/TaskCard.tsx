import { Chip } from "@heroui/react";
import type { Task, AgentProfile, Repository } from "../../types";

const STATUS_COLOR: Record<Task["status"], "default" | "primary" | "warning" | "success" | "danger"> = {
  pending: "default",
  ready: "primary",
  in_progress: "warning",
  done: "success",
  failed: "danger",
  cancelled: "default",
  skipped: "default",
};

const TYPE_COLOR: Record<Task["type"], "default" | "primary" | "secondary" | "warning"> = {
  code: "primary",
  test: "secondary",
  review: "warning",
  general: "default",
  knowledge: "secondary",
  infra: "warning",
};

const DRIVER_COLOR: Record<AgentProfile["agent_type"], "primary" | "secondary" | "success"> = {
  langgraph: "primary",
  opencode: "secondary",
  "github-copilot": "success",
};

interface Props {
  task: Task;
  profile?: AgentProfile;
  repositories?: Repository[];
  showResult?: boolean;
}

export default function TaskCard({ task, profile, repositories, showResult }: Props) {
  const taskRepos = (repositories ?? []).filter((r) => (task.repository_ids ?? []).includes(r.id));

  return (
    <div className="p-3 rounded-xl border border-divider bg-content1 space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-tight">{task.title}</span>
        <Chip size="sm" color={STATUS_COLOR[task.status]} variant="flat" className="shrink-0">
          {task.status.replace("_", " ")}
        </Chip>
      </div>

      {/* Description */}
      <p className="text-xs text-default-500 leading-snug line-clamp-2">{task.description}</p>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1">
        <Chip size="sm" color={TYPE_COLOR[task.type]} variant="bordered">
          {task.type}
        </Chip>

        {profile && (
          <>
            <Chip size="sm" color={DRIVER_COLOR[profile.agent_type]} variant="flat">
              {profile.agent_type}
            </Chip>
            <Chip size="sm" color="secondary" variant="bordered">
              {profile.name}
            </Chip>
          </>
        )}

        {taskRepos.map((r) => (
          <Chip key={r.id} size="sm" variant="bordered" color="primary">
            📁 {r.name}
          </Chip>
        ))}

        {(task.depends_on_task_ids ?? []).length > 0 && (
          <Chip size="sm" variant="bordered" color="default">
            ⛓ {task.depends_on_task_ids!.length} dep{task.depends_on_task_ids!.length > 1 ? "s" : ""}
          </Chip>
        )}
      </div>

      {/* Result (execution phase) */}
      {showResult && task.result && (
        <p className="text-xs text-default-400 italic bg-default-50 rounded p-2 line-clamp-3">
          {task.result}
        </p>
      )}

      {/* Assigned instance */}
      {task.assigned_instance_id && (
        <p className="text-xs text-default-400">
          Instance: <code className="bg-default-100 px-1 rounded">{task.assigned_instance_id}</code>
        </p>
      )}
    </div>
  );
}
