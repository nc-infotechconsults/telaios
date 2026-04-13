// ─── EditorArea ───────────────────────────────────────────────────────────────
//
// Multi-group editor container. Reads `rootSplit` from editorStore and
// recursively renders react-resizable-panels for splits.
// Leaf nodes render <EditorGroupView>.
//
// Default state (single group, no splits) renders a single editor.
// ──────────────────────────────────────────────────────────────────────────────

import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";
import { useEditorStore } from "@/stores/editorStore";
import { isEditorGroup } from "@/types";
import type { EditorGroup, EditorSplit } from "@/types";
import { EditorGroupView } from "./EditorGroup";

// ─── Resize Handle ────────────────────────────────────────────────────────────

function EditorSplitHandle({ direction }: { direction: "horizontal" | "vertical" }) {
  if (direction === "horizontal") {
    // Vertical divider between side-by-side panels
    return (
      <PanelResizeHandle className="group relative w-[3px] bg-transparent hover:bg-violet-500/20 active:bg-violet-500/40 transition-colors duration-150 z-10">
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/[0.06] group-hover:bg-gradient-to-b group-hover:from-violet-500/50 group-hover:to-cyan-500/50 group-active:from-violet-500/80 group-active:to-cyan-500/80 transition-all" />
      </PanelResizeHandle>
    );
  }

  // Horizontal divider between top/bottom panels
  return (
    <PanelResizeHandle className="group relative h-[3px] bg-transparent hover:bg-violet-500/20 active:bg-violet-500/40 transition-colors duration-150 z-10">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-white/[0.06] group-hover:bg-gradient-to-r group-hover:from-violet-500/50 group-hover:to-cyan-500/50 group-active:from-violet-500/80 group-active:to-cyan-500/80 transition-all" />
    </PanelResizeHandle>
  );
}

// ─── Recursive tree renderer ──────────────────────────────────────────────────

function SplitNode({ node }: { node: EditorGroup | EditorSplit }) {
  // Leaf node — render an EditorGroup
  if (isEditorGroup(node)) {
    return <EditorGroupView groupId={node.id} />;
  }

  // Split node — render a PanelGroup with children
  const panelDirection = node.direction === "horizontal" ? "horizontal" : "vertical";

  return (
    <PanelGroup direction={panelDirection} autoSaveId={`editor-split-${node.id}`}>
      {node.children.map((child, i) => (
        <SplitNodePanel
          key={child.id}
          child={child}
          defaultSize={node.sizes[i]}
          isLast={i === node.children.length - 1}
          parentDirection={node.direction}
        />
      ))}
    </PanelGroup>
  );
}

function SplitNodePanel({
  child,
  defaultSize,
  isLast,
  parentDirection,
}: {
  child: EditorGroup | EditorSplit;
  defaultSize: number;
  isLast: boolean;
  parentDirection: "horizontal" | "vertical";
}) {
  return (
    <>
      <Panel defaultSize={defaultSize} minSize={10}>
        <SplitNode node={child} />
      </Panel>
      {!isLast && <EditorSplitHandle direction={parentDirection} />}
    </>
  );
}

// ─── EditorArea ───────────────────────────────────────────────────────────────

export function EditorArea() {
  const rootSplit = useEditorStore((s) => s.rootSplit);

  return (
    <div className="flex-1 h-full min-h-0 overflow-hidden">
      <SplitNode node={rootSplit} />
    </div>
  );
}
