import { useMemo, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
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
  cancelled: "#374151",
  skipped: "#312e81",
};

const STATUS_BORDER: Record<Task["status"], string> = {
  pending: "#374151",
  ready: "#3b82f6",
  in_progress: "#f59e0b",
  done: "#10b981",
  failed: "#ef4444",
  cancelled: "#6b7280",
  skipped: "#6366f1",
};

const DRIVER_LABEL: Record<AgentProfile["agent_type"], string> = {
  langgraph: "LangGraph",
  opencode: "OpenCode",
  "github-copilot": "Copilot",
};

const DRIVER_PILL: Record<AgentProfile["agent_type"], string> = {
  langgraph: "bg-blue-600/20 text-blue-300 border border-blue-500/30",
  opencode: "bg-purple-600/20 text-purple-300 border border-purple-500/30",
  "github-copilot": "bg-green-600/20 text-green-300 border border-green-500/30",
};

interface TaskNodeData {
  task: Task;
  profile?: AgentProfile;
  repos: Repository[];
  selected?: boolean;
  [key: string]: unknown;
}

function TaskNode({ data }: NodeProps) {
  const { task, profile, repos, selected } = data as TaskNodeData;

  return (
    <div
      className="rounded-xl shadow-lg text-xs cursor-pointer transition-all overflow-hidden min-w-[200px] max-w-[240px]"
      style={{
        background: STATUS_BG[task.status],
        border: `2px solid ${selected ? "#fff" : STATUS_BORDER[task.status]}`,
        boxShadow: selected ? `0 0 0 3px ${STATUS_BORDER[task.status]}` : undefined,
        color: "#f9fafb",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: STATUS_BORDER[task.status] }} />

      {/* Title + type·status */}
      <div className="px-3 pt-2.5 pb-2">
        <div className="font-semibold leading-snug mb-1.5" title={task.title}>
          {task.title}
        </div>
        <div className="flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] capitalize">{task.type}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] capitalize">{task.status.replace("_", " ")}</span>
        </div>
      </div>

      {/* Agent row */}
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{ background: "rgba(0,0,0,0.25)", borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <i className="fa-solid fa-robot text-sm" aria-hidden="true" />
        {profile ? (
          <>
            <span className="font-medium text-[11px] flex-1 truncate" title={profile.name}>{profile.name}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 ${DRIVER_PILL[profile.agent_type]}`}>
              {DRIVER_LABEL[profile.agent_type]}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-white/40 italic">Unassigned</span>
        )}
      </div>

      {/* Repos */}
      {repos.length > 0 && (
        <div className="px-3 py-1.5 flex flex-wrap gap-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {repos.map((r) => (
            <span key={r.id} className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 truncate max-w-[100px]" title={r.name}>
              <i className="fa-solid fa-folder" aria-hidden="true" /> {r.name}
            </span>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: STATUS_BORDER[task.status] }} />
    </div>
  );
}

const nodeTypes = { task: TaskNode };

/** Assign a DAG level to each task: level = max(dep levels) + 1 */
function computeLevels(tasks: Task[]): Map<string, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map<string, number>();

  function level(id: string): number {
    if (memo.has(id)) return memo.get(id)!;
    const t = byId.get(id);
    const deps = t?.depends_on_task_ids ?? [];
    const l = deps.length === 0 ? 0 : Math.max(...deps.map(level)) + 1;
    memo.set(id, l);
    return l;
  }

  tasks.forEach((t) => level(t.id));
  return memo;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  tasks: Task[];
  agentProfiles: AgentProfile[];
  repositories: Repository[];
  height?: number;
  onTaskClick?: (task: Task) => void;
}

const NODE_W = 224;
const NODE_H = 130;
const GAP_X = 48;
const GAP_Y = 72;

export default function PlanDAG({ tasks, agentProfiles, repositories, height = 500, onTaskClick }: Props) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Layout computation — does NOT depend on selectedTaskId so dragging isn't reset on selection
  const { layoutNodes, layoutEdges } = useMemo(() => {
    const levelMap = computeLevels(tasks);

    const byLevel = new Map<number, Task[]>();
    for (const task of tasks) {
      const l = levelMap.get(task.id) ?? 0;
      if (!byLevel.has(l)) byLevel.set(l, []);
      byLevel.get(l)!.push(task);
    }

    const maxRowW = Math.max(
      1,
      ...Array.from(byLevel.values()).map((row) => row.length * NODE_W + (row.length - 1) * GAP_X)
    );

    const layoutNodes: Node[] = tasks.map((t) => {
      const lvl = levelMap.get(t.id) ?? 0;
      const row = byLevel.get(lvl)!;
      const col = row.indexOf(t);
      const rowW = row.length * NODE_W + (row.length - 1) * GAP_X;
      const x = (maxRowW - rowW) / 2 + col * (NODE_W + GAP_X) + 20;
      const y = lvl * (NODE_H + GAP_Y) + 20;

      const profile = agentProfiles.find((p) => p.id === t.agent_profile_id);
      const repos = (t.repository_ids ?? [])
        .map((rid) => repositories.find((r) => r.id === rid))
        .filter(Boolean) as Repository[];

      return {
        id: t.id,
        type: "task",
        position: { x, y },
        data: { task: t, profile, repos, selected: false },
      };
    });

    const layoutEdges: Edge[] = tasks.flatMap((t) =>
      (t.depends_on_task_ids ?? []).map((depId) => ({
        id: `${depId}→${t.id}`,
        source: depId,
        target: t.id,
        animated: t.status === "in_progress",
        style: { stroke: STATUS_BORDER[t.status], strokeWidth: 2 },
        markerEnd: { type: "arrowclosed" as const, color: STATUS_BORDER[t.status] },
      }))
    );

    return { layoutNodes, layoutEdges };
  }, [tasks, agentProfiles, repositories]);

  // ReactFlow state — tracks drag positions independently from layout computation
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(layoutNodes);
  const [rfEdges] = useEdgesState(layoutEdges);

  // Reset positions when the underlying task data changes
  useEffect(() => {
    setRfNodes(layoutNodes.map((n) => ({
      ...n,
      data: { ...n.data, selected: n.id === selectedTaskId },
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutNodes]);

  // Update only the selected highlight without touching positions
  useEffect(() => {
    setRfNodes((prev) =>
      prev.map((n) => ({ ...n, data: { ...n.data, selected: n.id === selectedTaskId } }))
    );
  }, [selectedTaskId, setRfNodes]);

  return (
    <div className="h-full" style={height !== undefined ? { height } : undefined}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          const task = tasks.find((t) => t.id === node.id);
          if (task) {
            setSelectedTaskId(task.id);
            onTaskClick?.(task);
          }
        }}
        onPaneClick={() => setSelectedTaskId(null)}
        nodesConnectable={false}
        edgesFocusable={false}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

