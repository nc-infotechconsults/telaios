// ─── EditorGroup ──────────────────────────────────────────────────────────────
//
// A self-contained editor group: tab bar + breadcrumb + code editor.
// Each group manages its own tabs and active file independently.
// Click anywhere in the group to make it the active group.
//
// Edge drop zones: when dragging a tab over the top/bottom/left/right edges
// of the group, a highlight overlay appears. Dropping creates a new split in
// that direction via `splitWithTab`.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useCallback, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { EditorTabBar } from "./EditorTabBar";
import { EditorBreadcrumb } from "./EditorBreadcrumb";
import { CodeEditor } from "./CodeEditor";
import { useWorkspaceId } from "@/core/bootstrap";
import { useBreadcrumbSymbols } from "@/hooks/useBreadcrumbSymbols";
import type { SplitDirection } from "@/types";

/** MIME type — must match EditorTabBar.tsx */
const TAB_DND_MIME = "application/x-ide-tab";

/**
 * Fraction of the group width/height that counts as an edge drop zone.
 * e.g. 0.2 means the outer 20% on each side.
 */
const EDGE_ZONE = 0.2;

type DropEdge = "left" | "right" | "top" | "bottom" | null;

/** Map edge → split direction */
function edgeToDirection(edge: DropEdge): SplitDirection | null {
  switch (edge) {
    case "left":
    case "right":
      return "horizontal";
    case "top":
    case "bottom":
      return "vertical";
    default:
      return null;
  }
}

/** Determine which edge the cursor is closest to. */
function detectEdge(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): DropEdge {
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;

  // Check if cursor is within an edge zone
  const inLeft = relX < EDGE_ZONE;
  const inRight = relX > 1 - EDGE_ZONE;
  const inTop = relY < EDGE_ZONE;
  const inBottom = relY > 1 - EDGE_ZONE;

  // If not in any edge zone, no edge
  if (!inLeft && !inRight && !inTop && !inBottom) return null;

  // If in multiple zones (corner), pick the one closest to the edge
  const distLeft = relX;
  const distRight = 1 - relX;
  const distTop = relY;
  const distBottom = 1 - relY;

  const min = Math.min(distLeft, distRight, distTop, distBottom);
  if (min === distLeft) return "left";
  if (min === distRight) return "right";
  if (min === distTop) return "top";
  return "bottom";
}

interface Props {
  groupId: string;
}

export function EditorGroupView({ groupId }: Props) {
  const workspaceId = useWorkspaceId();
  const groups = useEditorStore((s) => s.groups);
  const activeGroupId = useEditorStore((s) => s.activeGroupId);
  const setActiveGroup = useEditorStore((s) => s.setActiveGroup);
  const splitWithTab = useEditorStore((s) => s.splitWithTab);

  const group = groups[groupId];
  const isActive = groupId === activeGroupId;

  const activeTab = useMemo(() => {
    if (!group) return null;
    return group.tabs.find((t) => t.id === group.activeTabId) ?? null;
  }, [group]);

  // Show breadcrumb path for the active tab (non-virtual regular files and diffs)
  const breadcrumbPath = useMemo(() => {
    if (!activeTab) return null;
    if (activeTab.isVirtual && activeTab.virtualType === "diff") {
      return activeTab.diffFilePath ?? activeTab.path;
    }
    if (!activeTab.isVirtual) {
      return activeTab.path;
    }
    return null;
  }, [activeTab]);

  // Symbol-aware breadcrumb segments (only tracks symbols when group is active)
  const breadcrumbSegments = useBreadcrumbSymbols(breadcrumbPath, isActive);

  // ── Edge drop zone state ──────────────────────────────────────────────────
  const [dropEdge, setDropEdge] = useState<DropEdge>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEdgeDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(TAB_DND_MIME)) return;
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const edge = detectEdge(e.clientX, e.clientY, rect);

      // Only show edge zones if we're hovering a real edge — let the tab bar
      // handle its own drop events when the cursor is in the center.
      if (edge) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }
      setDropEdge(edge);
    },
    [],
  );

  const handleEdgeDragLeave = useCallback(
    (e: React.DragEvent) => {
      // Only clear if leaving the container entirely (not entering a child)
      if (
        containerRef.current &&
        !containerRef.current.contains(e.relatedTarget as Node)
      ) {
        setDropEdge(null);
      }
    },
    [],
  );

  const handleEdgeDrop = useCallback(
    (e: React.DragEvent) => {
      if (!dropEdge) return;

      const direction = edgeToDirection(dropEdge);
      if (!direction) {
        setDropEdge(null);
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setDropEdge(null);

      const raw = e.dataTransfer.getData(TAB_DND_MIME);
      if (!raw) return;

      try {
        const { tabId, fromGroupId } = JSON.parse(raw) as {
          tabId: string;
          fromGroupId: string;
        };

        // For left/top edges: the new split appears *before* the current group
        // For right/bottom edges: the new split appears *after* (default splitWithTab behavior)
        // splitWithTab always appends the new group after the source in the split,
        // so we call it on the current groupId — it creates a sibling split.
        //
        // If the drop comes from the same group and it only has 1 tab, splitting
        // is pointless — just bail.
        const sourceGroup = groups[fromGroupId];
        if (fromGroupId === groupId && sourceGroup && sourceGroup.tabs.length <= 1) {
          return;
        }

        splitWithTab(tabId, fromGroupId, direction);
      } catch {
        // Invalid data — ignore
      }
    },
    [dropEdge, groups, groupId, splitWithTab],
  );

  if (!group) return null;

  return (
    <div
      ref={containerRef}
      className={[
        "flex flex-col h-full bg-transparent relative",
        isActive
          ? "ring-1 ring-inset ring-violet-500/30"
          : "ring-1 ring-inset ring-transparent",
      ].join(" ")}
      onMouseDown={() => {
        if (!isActive) setActiveGroup(groupId);
      }}
      onDragOver={handleEdgeDragOver}
      onDragLeave={handleEdgeDragLeave}
      onDrop={handleEdgeDrop}
    >
      <EditorTabBar workspaceId={workspaceId} groupId={groupId} />
      {breadcrumbSegments.length > 0 && (
        <EditorBreadcrumb segments={breadcrumbSegments} />
      )}
      <div className="flex-1 min-h-0">
        <CodeEditor workspaceId={workspaceId} groupId={groupId} />
      </div>

      {/* ── Edge drop zone overlays ──────────────────────────────────────── */}
      {dropEdge && <EdgeDropOverlay edge={dropEdge} />}
    </div>
  );
}

// ─── Edge drop overlay ──────────────────────────────────────────────────────
// Semi-transparent highlight that indicates where the new split will appear.
// ─────────────────────────────────────────────────────────────────────────────

function EdgeDropOverlay({ edge }: { edge: NonNullable<DropEdge> }) {
  const styles: React.CSSProperties = {
    position: "absolute",
    zIndex: 30,
    pointerEvents: "none",
    background: "rgba(139, 92, 246, 0.12)",
    border: "2px solid rgba(139, 92, 246, 0.5)",
    borderRadius: 2,
    transition: "all 100ms ease-out",
  };

  switch (edge) {
    case "left":
      Object.assign(styles, { top: 0, left: 0, bottom: 0, width: "50%" });
      break;
    case "right":
      Object.assign(styles, { top: 0, right: 0, bottom: 0, width: "50%" });
      break;
    case "top":
      Object.assign(styles, { top: 0, left: 0, right: 0, height: "50%" });
      break;
    case "bottom":
      Object.assign(styles, { bottom: 0, left: 0, right: 0, height: "50%" });
      break;
  }

  return <div style={styles} />;
}
