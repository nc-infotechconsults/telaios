import { useState } from "react";
import { PanelResizeHandle } from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import type { DragState, PanelArea } from "@/types";

interface SectionDividerProps {
  /** Which sidebar this divider belongs to. */
  side: "left" | "right";
  /** Ref for the top section Panel (used to imperatively collapse/expand). */
  topRef: React.RefObject<ImperativePanelHandle>;
  /** Ref for the bottom section Panel. */
  bottomRef: React.RefObject<ImperativePanelHandle>;
  /** Current drag state from the store (passed as prop to avoid extra subscription). */
  dragState: DragState;
  /** Whether the top section is currently collapsed. */
  topCollapsed: boolean;
  /** Whether the bottom section is currently collapsed. */
  bottomCollapsed: boolean;
}

/**
 * The draggable, collapsible section separator between the top and bottom
 * sections of a sidebar.
 *
 * Responsibilities:
 *  1. Acts as a `PanelResizeHandle` so the two sections can be resized.
 *  2. Shows collapse arrows for the top and bottom section on hover.
 *  3. Acts as a drop zone: dropping a panel here moves it to the start of
 *     the appropriate section on this sidebar.
 */
export function SectionDivider({
  side,
  topRef,
  bottomRef,
  dragState,
  topCollapsed,
  bottomCollapsed,
}: SectionDividerProps) {
  const movePanel = useEditorStore((s) => s.movePanel);
  const endDrag   = useEditorStore((s) => s.endDrag);

  const [isDropOver, setIsDropOver] = useState(false);

  // Where a panel dropped onto this divider should land
  const dropArea: PanelArea = side === "left" ? "left-bottom" : "right-bottom";

  const isDragging = dragState.panelId !== null;

  function collapseTop(e: React.MouseEvent) {
    e.stopPropagation();
    if (topCollapsed) {
      topRef.current?.expand();
    } else {
      topRef.current?.collapse();
    }
  }

  function collapseBottom(e: React.MouseEvent) {
    e.stopPropagation();
    if (bottomCollapsed) {
      bottomRef.current?.expand();
    } else {
      bottomRef.current?.collapse();
    }
  }

  return (
    <PanelResizeHandle
      className={[
        "h-[6px] transition-all duration-200 cursor-row-resize group relative flex items-center justify-center",
        isDropOver
          ? "bg-violet-500/20"
          : isDragging
            ? "bg-white/[0.04]"
            : "bg-white/[0.025] hover:bg-white/[0.05]",
      ].join(" ")}
      onDragOver={(e) => {
        if (!dragState.panelId) return;
        e.preventDefault();
        e.stopPropagation();
        (e as unknown as DragEvent).dataTransfer!.dropEffect = "move";
        setIsDropOver(true);
      }}
      onDragLeave={(e) => {
        e.stopPropagation();
        setIsDropOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDropOver(false);
        if (!dragState.panelId) return;
        movePanel(dragState.panelId, dropArea, undefined);
        endDrag();
      }}
    >
      {/* Centre grip line */}
      <div
        className={[
          "h-[1px] w-12 rounded-full transition-all duration-150",
          isDropOver
            ? "bg-gradient-to-r from-violet-500 to-cyan-500 opacity-100"
            : "bg-white/20 group-hover:bg-white/50",
        ].join(" ")}
      />

      {/* Collapse-top button (top half, left side) */}
      <button
        className="absolute left-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={collapseTop}
        title={topCollapsed ? "Expand top section" : "Collapse top section"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {topCollapsed ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
      </button>

      {/* Collapse-bottom button (top half, right side) */}
      <button
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={collapseBottom}
        title={bottomCollapsed ? "Expand bottom section" : "Collapse bottom section"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {bottomCollapsed ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {/* Drop-zone indicator label */}
      {isDropOver && (
        <span className="absolute left-1/2 -translate-x-1/2 text-[9px] text-violet-300 whitespace-nowrap pointer-events-none">
          Move to {side} bottom
        </span>
      )}
    </PanelResizeHandle>
  );
}
