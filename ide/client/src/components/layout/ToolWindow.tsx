// ─── ToolWindow ────────────────────────────────────────────────────────────────
//
// Generic wrapper component for any tool window content.
// Renders a compact header with icon, title, toolbar actions, and close button.
// Content is loaded from the tool window registry by ID.
//
// JetBrains New UI style:
//   - Compact header (~28px height)
//   - Subtle border, no background noise
//   - Header toolbar actions revealed on hover
//   - Close button always visible
// ──────────────────────────────────────────────────────────────────────────────

import { memo, useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Minus,
  MoreHorizontal,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  EyeOff,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layoutStore";
import { toolWindowRegistry } from "@/core/tool-window-registry";
import type { ToolWindowPlacement } from "@/types/plugin";

// ─── More Actions Menu ────────────────────────────────────────────────────────

interface MoreActionsMenuProps {
  id: string;
  onClose: () => void;
}

function MoreActionsMenu({ id, onClose }: MoreActionsMenuProps) {
  const moveToolWindow = useLayoutStore((s) => s.moveToolWindow);
  const hideToolWindow = useLayoutStore((s) => s.hideToolWindow);
  const floatToolWindow = useLayoutStore((s) => s.floatToolWindow);
  const dockToolWindow = useLayoutStore((s) => s.dockToolWindow);
  const unpinToolWindow = useLayoutStore((s) => s.unpinToolWindow);
  const pinToolWindow = useLayoutStore((s) => s.pinToolWindow);
  const currentPlacement = useLayoutStore(
    (s) => s.toolWindows[id]?.placement ?? "left-top"
  );
  const currentViewMode = useLayoutStore(
    (s) => s.toolWindows[id]?.viewMode ?? "dock-pinned"
  );
  const isFloating = currentViewMode === "float";
  const isUnpinned = currentViewMode === "dock-unpinned";

  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const moveOptions: Array<{
    label: string;
    placement: ToolWindowPlacement;
    icon: typeof ArrowLeft;
  }> = [
    { label: "Move to Left", placement: "left-top", icon: ArrowLeft },
    { label: "Move to Right", placement: "right-top", icon: ArrowRight },
    { label: "Move to Bottom", placement: "bottom", icon: ArrowDown },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 min-w-[160px] py-1 bg-[#1a1a1d]/95 backdrop-blur-xl border border-white/[0.08] rounded-lg shadow-2xl z-50"
    >
      {moveOptions
        .filter((opt) => opt.placement !== currentPlacement)
        .map((opt) => (
          <button
            key={opt.placement}
            onClick={() => {
              moveToolWindow(id, opt.placement);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <opt.icon size={12} className="text-zinc-500" />
            {opt.label}
          </button>
        ))}

      <div className="my-1 h-px bg-white/[0.08]" />

      {/* Float / Dock toggle */}
      {isFloating ? (
        <button
          onClick={() => {
            dockToolWindow(id);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
        >
          <Minimize2 size={12} className="text-zinc-500" />
          Dock
        </button>
      ) : (
        <button
          onClick={() => {
            floatToolWindow(id);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
        >
          <Maximize2 size={12} className="text-zinc-500" />
          Float
        </button>
      )}

      {/* Pin / Unpin toggle — only for docked modes (not floating) */}
      {!isFloating && (
        isUnpinned ? (
          <button
            onClick={() => {
              pinToolWindow(id);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <Pin size={12} className="text-zinc-500" />
            Pin
          </button>
        ) : (
          <button
            onClick={() => {
              unpinToolWindow(id);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <PinOff size={12} className="text-zinc-500" />
            Unpin
          </button>
        )
      )}

      <div className="my-1 h-px bg-white/[0.08]" />

      <button
        onClick={() => {
          hideToolWindow(id);
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
      >
        <EyeOff size={12} className="text-zinc-500" />
        Hide
      </button>
    </div>
  );
}

// ─── ToolWindowHeader ─────────────────────────────────────────────────────────

interface ToolWindowHeaderProps {
  id: string;
  /** Additional toolbar actions to show in the header */
  actions?: React.ReactNode;
}

function ToolWindowHeader({ id, actions }: ToolWindowHeaderProps) {
  const hideToolWindow = useLayoutStore((s) => s.hideToolWindow);
  const viewMode = useLayoutStore((s) => s.toolWindows[id]?.viewMode ?? "dock-pinned");
  const registration = toolWindowRegistry.get(id);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const isUnpinned = viewMode === "dock-unpinned";

  const toggleMoreMenu = useCallback(
    () => setShowMoreMenu((prev) => !prev),
    []
  );
  const closeMoreMenu = useCallback(() => setShowMoreMenu(false), []);

  if (!registration) return null;

  const { icon: Icon, label } = registration;

  return (
    <div className="flex items-center h-7 px-2 bg-[#141416] border-b border-white/[0.06] shrink-0 group/header">
      {/* Icon + Label */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Icon size={13} className="text-zinc-500 shrink-0" strokeWidth={1.8} />
        <span className="text-[11px] font-medium text-zinc-400 truncate select-none">
          {label}
        </span>
        {/* Unpinned indicator */}
        {isUnpinned && (
          <PinOff size={10} className="text-zinc-600 shrink-0" strokeWidth={1.5} />
        )}
      </div>

      {/* Toolbar actions — visible on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
        {actions}

        {/* More actions menu */}
        <div className="relative">
          <button
            onClick={toggleMoreMenu}
            className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
            title="More actions"
          >
            <MoreHorizontal size={12} />
          </button>

          {showMoreMenu && (
            <MoreActionsMenu id={id} onClose={closeMoreMenu} />
          )}
        </div>

        {/* Minimize (hide) */}
        <button
          onClick={() => hideToolWindow(id)}
          className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
          title="Hide"
        >
          <Minus size={12} />
        </button>

        {/* Close */}
        <button
          onClick={() => hideToolWindow(id)}
          className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
          title="Close"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── ToolWindow ───────────────────────────────────────────────────────────────

interface ToolWindowProps {
  /** Tool window ID */
  id: string;
  /** Additional toolbar actions for the header */
  headerActions?: React.ReactNode;
}

export const ToolWindow = memo(function ToolWindow({
  id,
  headerActions,
}: ToolWindowProps) {
  const registration = toolWindowRegistry.get(id);
  const isVisible = useLayoutStore((s) => s.toolWindows[id]?.isVisible ?? false);
  const activeToolWindowId = useLayoutStore((s) => s.activeToolWindowId);
  const setActiveToolWindow = useLayoutStore((s) => s.setActiveToolWindow);

  if (!registration || !isVisible) return null;

  const { component: Content } = registration;
  const isActive = activeToolWindowId === id;

  return (
    <div
      className={[
        "flex flex-col h-full min-h-0 bg-[#111113]",
        isActive ? "ring-1 ring-white/[0.06]" : "",
      ].join(" ")}
      onClick={() => {
        if (!isActive) setActiveToolWindow(id);
      }}
    >
      <ToolWindowHeader id={id} actions={headerActions} />

      {/* Content area — fills remaining space */}
      <div className="flex-1 min-h-0 overflow-auto">
        <Content />
      </div>
    </div>
  );
});
