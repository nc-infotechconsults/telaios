import { useMemo } from "react";
import type { GitCommit } from "@/types";

interface Props {
  commits: GitCommit[];
  onSelect?: (commit: GitCommit) => void;
}

// ── Lane computation ──────────────────────────────────────────────────────────

interface GraphNode {
  commit: GitCommit;
  lane: number;
  edges: { fromLane: number; toLane: number; targetRow: number }[];
}

const LANE_COLORS = [
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#3b82f6", // blue
  "#a78bfa", // purple
  "#34d399", // green
];

function laneColor(lane: number) {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

function computeGraph(commits: GitCommit[]): GraphNode[] {
  // Map hash → row index
  const rowByHash = new Map<string, number>();
  commits.forEach((c, i) => rowByHash.set(c.hash, i));

  // Assign lanes greedily
  const laneTakenUntil: number[] = []; // row at which each lane becomes free
  const nodeByHash = new Map<string, GraphNode>();

  const nodes: GraphNode[] = commits.map((commit, row) => {
    // Try to inherit lane from first parent (continuity)
    let lane = -1;
    const firstParent = commit.parentHashes[0];
    if (firstParent) {
      const parentNode = nodeByHash.get(firstParent);
      if (parentNode !== undefined && laneTakenUntil[parentNode.lane] !== undefined) {
        // check if lane is still free at this row
        if ((laneTakenUntil[parentNode.lane] ?? row) >= row) {
          lane = parentNode.lane;
        }
      }
    }

    // Find first free lane
    if (lane === -1) {
      lane = 0;
      while ((laneTakenUntil[lane] ?? -1) > row) lane++;
    }

    laneTakenUntil[lane] = row;

    const node: GraphNode = { commit, lane, edges: [] };
    nodeByHash.set(commit.hash, node);
    return node;
  });

  // Build edges: for each commit, draw edge to each parent
  nodes.forEach((node, row) => {
    node.commit.parentHashes.forEach((parentHash) => {
      const targetRow = rowByHash.get(parentHash);
      if (targetRow === undefined) return; // parent not in current window
      const parentNode = nodes[targetRow];
      if (!parentNode) return;
      node.edges.push({
        fromLane: node.lane,
        toLane: parentNode.lane,
        targetRow,
      });
    });
  });

  return nodes;
}

// ── Rendering constants ───────────────────────────────────────────────────────

const ROW_H = 34; // px per row
const LANE_W = 14; // px per lane
const DOT_R = 3;   // commit dot radius
const PADDING_LEFT = 6;

export function GitGraph({ commits, onSelect }: Props) {
  const nodes = useMemo(() => computeGraph(commits.slice(0, 200)), [commits]);

  if (nodes.length === 0) return null;

  const maxLane = Math.max(0, ...nodes.map((n) => n.lane));
  const svgWidth = PADDING_LEFT + (maxLane + 1) * LANE_W + 4;
  const svgHeight = nodes.length * ROW_H;

  function cx(lane: number) {
    return PADDING_LEFT + lane * LANE_W + LANE_W / 2;
  }
  function cy(row: number) {
    return row * ROW_H + ROW_H / 2;
  }

  return (
    <div className="flex overflow-x-hidden">
      {/* SVG graph */}
      <div className="shrink-0" style={{ width: svgWidth }}>
        <svg width={svgWidth} height={svgHeight}>
          {nodes.map((node, row) => (
            <g key={node.commit.hash}>
              {/* Edges to parents */}
              {node.edges.map((edge, ei) => {
                const x1 = cx(edge.fromLane);
                const y1 = cy(row);
                const x2 = cx(edge.toLane);
                const y2 = cy(edge.targetRow);
                const color = laneColor(edge.fromLane);

                if (x1 === x2) {
                  // Straight vertical line
                  return (
                    <line
                      key={ei}
                      x1={x1} y1={y1}
                      x2={x2} y2={y2}
                      stroke={color}
                      strokeWidth={1.5}
                      strokeOpacity={0.7}
                    />
                  );
                }

                // Curved bezier
                const midY = (y1 + y2) / 2;
                return (
                  <path
                    key={ei}
                    d={`M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                  />
                );
              })}

              {/* Commit dot */}
              <circle
                cx={cx(node.lane)}
                cy={cy(row)}
                r={DOT_R}
                fill={laneColor(node.lane)}
              />
            </g>
          ))}
        </svg>
      </div>

      {/* Commit list aligned to rows */}
      <div className="flex-1 min-w-0">
        {nodes.map((node) => {
          const refs = node.commit.refs.filter(Boolean);
          return (
            <div
              key={node.commit.hash}
              style={{ height: ROW_H }}
              className="flex items-center gap-2 px-2 hover:bg-white/[0.03] cursor-pointer group"
              onClick={() => onSelect?.(node.commit)}
            >
              {refs.length > 0 && (
                <div className="flex gap-0.5 shrink-0">
                  {refs.slice(0, 2).map((ref) => (
                    <InlineRefBadge key={ref} ref_={ref} />
                  ))}
                </div>
              )}
              <span className="text-zinc-300 text-[11px] truncate">{node.commit.message}</span>
              <span className="font-mono text-[9px] text-zinc-600 ml-auto shrink-0 group-hover:text-violet-400 transition-colors">
                {node.commit.shortHash}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InlineRefBadge({ ref_ }: { ref_: string }) {
  const isHead = ref_.startsWith("HEAD");
  const isTag = ref_.startsWith("tag:");
  const isRemote = ref_.includes("origin/") || ref_.includes("upstream/");

  const colors = isHead
    ? "bg-violet-500/20 text-violet-300"
    : isTag
      ? "bg-amber-500/20 text-amber-300"
      : isRemote
        ? "bg-sky-500/20 text-sky-300"
        : "bg-emerald-500/20 text-emerald-300";

  const label = isTag
    ? ref_.replace("tag: ", "")
    : ref_.replace("HEAD -> ", "");

  return (
    <span className={`inline-flex items-center px-1 text-[9px] font-medium rounded ${colors} max-w-[80px] truncate`}>
      {label}
    </span>
  );
}
