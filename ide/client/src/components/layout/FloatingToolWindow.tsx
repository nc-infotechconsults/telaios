// ─── FloatingToolWindow ────────────────────────────────────────────────────────
//
// Renders a tool window in a draggable floating overlay.
// Title bar is draggable via native mouse events (no framer-motion drag).
//
// Features:
//   - Draggable title bar
//   - Dock button returns to docked mode
//   - Close button hides the window
//   - Click-to-front z-index management via activeToolWindowId
//   - Renders tool window content from the registry
// ──────────────────────────────────────────────────────────────────────────────

import { memo, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { X, Minimize2 } from "lucide-react";
import { useLayoutStore } from "@/stores/layoutStore";
import { toolWindowRegistry } from "@/core/tool-window-registry";
import type { ToolWindowState } from "@/types/plugin";

interface FloatingToolWindowProps {
  toolWindow: ToolWindowState;
}

export const FloatingToolWindow = memo(function FloatingToolWindow({
  toolWindow,
}: FloatingToolWindowProps) {
  const dockToolWindow = useLayoutStore((s) => s.dockToolWindow);
  const hideToolWindow = useLayoutStore((s) => s.hideToolWindow);
  const setFloatPosition = useLayoutStore((s) => s.setFloatPosition);
  const setActiveToolWindow = useLayoutStore((s) => s.setActiveToolWindow);
  const activeToolWindowId = useLayoutStore((s) => s.activeToolWindowId);

  const registration = toolWindowRegistry.get(toolWindow.id);
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  const isActive = activeToolWindowId === toolWindow.id;

  const handleDock = useCallback(() => {
    dockToolWindow(toolWindow.id);
  }, [dockToolWindow, toolWindow.id]);

  const handleClose = useCallback(() => {
    hideToolWindow(toolWindow.id);
  }, [hideToolWindow, toolWindow.id]);

  const handleBringToFront = useCallback(() => {
    if (!isActive) {
      setActiveToolWindow(toolWindow.id);
    }
  }, [isActive, setActiveToolWindow, toolWindow.id]);

  // ── Native drag handlers ───────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only drag on title bar, not buttons inside it
      if ((e.target as HTMLElement).closest("button")) return;

      dragging.current = true;
      const pos = toolWindow.floatPosition ?? { x: 120, y: 80 };
      dragStart.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      handleBringToFront();
    },
    [toolWindow.floatPosition, handleBringToFront]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      setFloatPosition(
        toolWindow.id,
        dragStart.current.ox + dx,
        dragStart.current.oy + dy
      );
    },
    [setFloatPosition, toolWindow.id]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  if (!registration) return null;

  const { icon: Icon, label, component: Content } = registration;
  const pos = toolWindow.floatPosition ?? { x: 120, y: 80 };
  const size = toolWindow.floatSize ?? { width: 400, height: 350 };

  // Z-index: active floating window above others
  const zIndex = isActive ? 60 : 50;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      onPointerDown={handleBringToFront}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        zIndex,
      }}
      className={[
        "flex flex-col rounded-lg overflow-hidden shadow-2xl",
        "border bg-[#111113]/95 backdrop-blur-xl",
        isActive
          ? "border-violet-500/30 ring-1 ring-violet-500/20"
          : "border-white/[0.1]",
      ].join(" ")}
    >
      {/* Draggable title bar */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="flex items-center h-7 px-2 bg-[#141416] border-b border-white/[0.06] shrink-0 cursor-grab active:cursor-grabbing select-none group/float-header"
      >
        {/* Icon + Label */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Icon
            size={13}
            className="text-zinc-500 shrink-0"
            strokeWidth={1.8}
          />
          <span className="text-[11px] font-medium text-zinc-400 truncate">
            {label}
          </span>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/float-header:opacity-100 transition-opacity">
          {/* Dock (return to sidebar) */}
          <button
            onClick={handleDock}
            className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
            title="Dock"
          >
            <Minimize2 size={12} />
          </button>

          {/* Close */}
          <button
            onClick={handleClose}
            className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <Content />
      </div>
    </motion.div>
  );
});
