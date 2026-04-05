import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Task, AgentProfile, Repository } from "../../types";

const STATUS_BG: Record<Task["status"], string> = {
  pending: "#1f2937",
  ready: "#1d4ed8",
  in_progress: "#b45309",
  done: "#065f46",
  failed: "#991b1b",
};

const STATUS_BORDER: Record<Task["status"], string> = {
  pending: "#374151",
  ready: "#3b82f6",
  in_progress: "#f59e0b",
  done: "#10b981",
  failed: "#ef4444",
};

const DRIVER_BADGE: Record<AgentProfile["agent_type"], string> = {
  langgraph: "bg-blue-700 text-blue-100",
  opencode: "bg-purple-700 text-purple-100",
  "github-copilot": "bg-green-800 text-green-100",
};

interface TaskNodeData {
  task: Task;
  profile?: AgentProfile;
  repos: Repository[];
  [key: string]: unknown;
}

function TaskNode({ data }: NodeProps) {
  const { task, profile, repos } = data as TaskNodeData;

  return (
    <div
      className="rounded-lg p-2 min-w-[180px] max-w-[220px] shadow-lg text-xs"
      style={{
        background: STATUS_BG[task.status],
        border: `2px solid ${STATUS_BORDER[task.status]}`,
        color: "#f9fafb",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: STATUS_BORDER[task.status] }} />

      {/* Task title */}
      <div className="font-semibold leading-tight mb-1 truncate" title={task.title}>
        {task.title}
      </div>

      {/* Type chip */}
      <div className="flex flex-wrap gap-1 mb-1">
        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px]">
          {task.type} · {task.status.replace("_", " ")}
        </span>
      </div>

      {/* Agent profile + driver badges */}
      {profile && (
        <div className="flex flex-wrap gap-1 mb-1">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${DRIVER_BADGE[profile.agent_type]}`}
          >
            {profile.agent_type}
          </span>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 truncate max-w-[120px]"
            title={profile.name}
          >
            {profile.name}
          </span>
        </div>
      )}

      {/* Repo badges */}
      {repos.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {repos.map((r) => (
            <span key={r.id} className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 truncate max-w-[90px]" title={r.name}>
              📁 {r.name}
            </span>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: STATUS_BORDER[task.status] }} />
    </div>
  );
}

const nodeTypes = { task: TaskNode };

interface Props {
  tasks: Task[];
  agentProfiles: AgentProfile[];
  repositories: Repository[];
  height?: number;
}

export default function PlanDAG({ tasks, agentProfiles, repositories, height = 500 }: Props) {
  const { nodes, edges } = useMemo(() => {
    const cols = 4;
    const cellW = 260;
    const cellH = 170;

    const nodes: Node[] = tasks.map((t, i) => {
      const profile = agentProfiles.find((p) => p.id === t.agent_profile_id);
      const repos = (t.repository_ids ?? [])
        .map((rid) => repositories.find((r) => r.id === rid))
        .filter(Boolean) as Repository[];

      return {
        id: t.id,
        type: "task",
        position: {
          x: (i % cols) * cellW + 20,
          y: Math.floor(i / cols) * cellH + 20,
        },
        data: { task: t, profile, repos },
      };
    });

    const edges: Edge[] = tasks.flatMap((t) =>
      (t.depends_on_task_ids ?? []).map((depId) => ({
        id: `${depId}→${t.id}`,
        source: depId,
        target: t.id,
        animated: t.status === "in_progress",
        style: { stroke: STATUS_BORDER[t.status], strokeWidth: 2 },
        markerEnd: { type: "arrowclosed" as const, color: STATUS_BORDER[t.status] },
      }))
    );

    return { nodes, edges };
  }, [tasks, agentProfiles, repositories]);

  return (
    <div style={height !== undefined ? { height } : { height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeStrokeColor={(n) => STATUS_BORDER[(n.data as TaskNodeData).task.status]}
          nodeColor={(n) => STATUS_BG[(n.data as TaskNodeData).task.status]}
        />
      </ReactFlow>
    </div>
  );
}
