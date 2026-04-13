// ─── ToolWindowGutter ──────────────────────────────────────────────────────────
//
// JetBrains-style icon gutters on the left and right edges of the IDE.
// Each gutter shows icons for tool windows assigned to that side.
//
// Top section: primary tool windows (explorer, search, git, etc.)
// Bottom section: secondary/utility windows (settings, help, etc.)
//
// Click: toggles tool window visibility
// Hover (dock-unpinned): temporarily shows the window as an overlay
// Drag: reorders within the gutter (future: move between gutters)
// ──────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef } from "react";
import { useLayoutStore } from "@/stores/layoutStore";
import { toolWindowRegistry } from "@/core/tool-window-registry";
import { keybindingService } from "@/core/keybindings";
import { motion } from "framer-motion";
import type { ToolWindowPlacement } from "@/types/plugin";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolWindowGutterProps {
  side: "left" | "right";
}

// ─── GutterIcon ───────────────────────────────────────────────────────────────

function GutterIcon({
  id,
  side,
  isActive,
}: {
  id: string;
  side: "left" | "right";
  isActive: boolean;
}) {
  const toolWindow = useLayoutStore((s) => s.toolWindows[id]);
  const toggleToolWindow = useLayoutStore((s) => s.toggleToolWindow);
  const showToolWindow = useLayoutStore((s) => s.showToolWindow);
  const registration = toolWindowRegistry.get(id);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isUnpinned = toolWindow?.viewMode === "dock-unpinned";

  const handleMouseEnter = useCallback(() => {
    if (!isUnpinned) return;
    // Clear any pending hide timer
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    // Show the unpinned window on hover
    if (!toolWindow?.isVisible) {
      showToolWindow(id);
    }
  }, [isUnpinned, toolWindow?.isVisible, showToolWindow, id]);

  const handleMouseLeave = useCallback(() => {
    if (!isUnpinned) return;
    // The overlay panel manages its own hide-on-leave; no action needed here.
    // The user might be moving their mouse from the icon to the panel.
  }, [isUnpinned]);

  if (!toolWindow || !registration) return null;

  const { icon: Icon, label } = registration;
  const isVisible = toolWindow.isVisible;

  // Build tooltip with shortcut
  const shortcutLabel = registration.shortcut
    ? keybindingService.getLabel(`toolWindow.toggle.${id}`)
    : undefined;
  const tooltip = shortcutLabel ? `${label} (${shortcutLabel})` : label;

  return (
    <button
      title={tooltip}
      onClick={() => toggleToolWindow(id)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={[
        "relative w-9 h-9 rounded-lg flex items-center justify-center",
        "transition-all duration-200 group",
        isActive
          ? "bg-white/[0.08] text-white"
          : isVisible
            ? "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
            : "text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]",
        // Visual cue for unpinned state: dashed bottom border
        isUnpinned ? "border-b border-dashed border-zinc-600" : "",
      ].join(" ")}
    >
      {/* Active indicator — thin line on the inner edge */}
      {isActive && (
        <motion.div
          layoutId={`gutter-indicator-${side}`}
          className={[
            "absolute top-1/2 -translate-y-1/2 w-[2px] h-5",
            "bg-gradient-to-b from-violet-500 to-cyan-500 rounded-full",
            side === "left" ? "right-0" : "left-0",
          ].join(" ")}
          initial={false}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}

      <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
    </button>
  );
}

// ─── ToolWindowGutter ─────────────────────────────────────────────────────────

export function ToolWindowGutter({ side }: ToolWindowGutterProps) {
  const activeToolWindowId = useLayoutStore((s) => s.activeToolWindowId);
  const toolWindows = useLayoutStore((s) => s.toolWindows);

  const gutterIds = useMemo(() => {
    const all = Object.values(toolWindows);
    const topSection: ToolWindowPlacement = side === "left" ? "left-top" : "right-top";
    const bottomSection: ToolWindowPlacement = side === "left" ? "left-bottom" : "right-bottom";

    // An icon's gutter position is determined by gutterSection (when set in registry),
    // falling back to the panel's placement. This lets e.g. the terminal panel render
    // at "bottom" while its icon lives in the "left-bottom" gutter section.
    const sectionOf = (id: string): ToolWindowPlacement => {
      const reg = toolWindowRegistry.get(id);
      const tw = toolWindows[id];
      return reg?.gutterSection ?? tw?.placement ?? topSection;
    };

    return {
      top: all
        .filter((tw) => sectionOf(tw.id) === topSection)
        .sort((a, b) => a.order - b.order)
        .map((tw) => tw.id),
      bottom: all
        .filter((tw) => sectionOf(tw.id) === bottomSection)
        .sort((a, b) => a.order - b.order)
        .map((tw) => tw.id),
    };
  }, [toolWindows, side]);

  const { top: topIds, bottom: bottomIds } = gutterIds;

  // Don't render empty gutters
  if (topIds.length === 0 && bottomIds.length === 0) return null;

  const borderClass = side === "left" ? "border-r" : "border-l";

  return (
    <div
      className={[
        "flex flex-col w-10 bg-[#0f0f11] py-1.5 items-center shrink-0 z-10",
        borderClass,
        "border-white/[0.06]",
      ].join(" ")}
    >
      {/* Top section — primary tool windows */}
      <div className="flex flex-col items-center gap-0.5">
        {topIds.map((id) => (
          <GutterIcon
            key={id}
            id={id}
            side={side}
            isActive={activeToolWindowId === id}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom section — secondary/utility */}
      <div className="flex flex-col items-center gap-0.5">
        {bottomIds.map((id) => (
          <GutterIcon
            key={id}
            id={id}
            side={side}
            isActive={activeToolWindowId === id}
          />
        ))}
      </div>
    </div>
  );
}
