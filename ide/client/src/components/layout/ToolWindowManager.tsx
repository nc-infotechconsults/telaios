// ─── ToolWindowManager ─────────────────────────────────────────────────────────
//
// Main layout orchestrator for the AgentScope IDE (JetBrains New UI style).
// Replaces PanelLayout.tsx — composes all layout regions:
//
//  ┌──────────────────────────────────────────────────────────────┐
//  │ headerSlot (HeaderToolbar — plugged in at Task 7)           │
//  ├──┬─────────────────────────────────────────────────────┬────┤
//  │  │  ┌──────────┬───────────────────┬──────────┐        │    │
//  │  │  │ Left     │                   │ Right    │        │    │
//  │G │  │ Sidebar  │   Editor Area     │ Sidebar  │        │ G  │
//  │u │  │ (top+    │                   │ (top+    │        │ u  │
//  │t │  │  bottom) │                   │  bottom) │        │ t  │
//  │t │  ├──────────┴───────────────────┴──────────┤        │ t  │
//  │e │  │ Bottom Panel                             │        │ e  │
//  │r │  │                                          │        │ r  │
//  │L │  └──────────────────────────────────────────┘        │ R  │
//  ├──┴─────────────────────────────────────────────────────┴────┤
//  │ StatusBar                                                    │
//  └──────────────────────────────────────────────────────────────┘
//
// Design:
//   - Uses react-resizable-panels for all resizing
//   - Reads tool window state from layoutStore
//   - Reads tool window components from toolWindowRegistry
//   - Regions with multiple visible tool windows show tabs
//   - Empty regions collapse gracefully (no space allocated)
//   - Gutters hidden on phone breakpoint (class-based, no JS)
// ──────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layoutStore";
import {
  toolWindowRegistry,
  type ToolWindowRegistration,
} from "@/core/tool-window-registry";
import { ToolWindowGutter } from "./ToolWindowGutter";
import { ToolWindow } from "./ToolWindow";
import { FloatingToolWindow } from "./FloatingToolWindow";
import { StatusBar } from "./StatusBar";
import type { ToolWindowPlacement, ToolWindowState } from "@/types/plugin";

// ─── Resize Handle Components ─────────────────────────────────────────────────
// Mirror PanelLayout's glassmorphic gradient style.

/** Vertical resize handle — between left sidebar and editor, or editor and right sidebar. */
function ResizeHandleV({ side }: { side: "left" | "right" }) {
  const gradientDir =
    side === "left"
      ? "from-violet-500/50 to-cyan-500/50"
      : "from-cyan-500/50 to-violet-500/50";
  const activeDir =
    side === "left"
      ? "from-violet-500/80 to-cyan-500/80"
      : "from-cyan-500/80 to-violet-500/80";

  return (
    <PanelResizeHandle
      className={[
        "w-[3px] bg-transparent transition-all duration-300 cursor-col-resize",
        "group flex flex-col justify-center items-center",
        `hover:bg-gradient-to-b hover:${gradientDir}`,
        `active:${activeDir}`,
      ].join(" ")}
    >
      <div className="w-[1px] h-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
    </PanelResizeHandle>
  );
}

/** Horizontal resize handle — between editor/sidebar area and bottom panel. */
function ResizeHandleH() {
  return (
    <PanelResizeHandle
      className={[
        "h-[5px] bg-white/[0.025] transition-all duration-300 cursor-row-resize",
        "group flex justify-center items-center",
        "hover:bg-gradient-to-r hover:from-violet-500/50 hover:to-cyan-500/50",
        "active:from-violet-500/80 active:to-cyan-500/80",
      ].join(" ")}
    >
      <div className="h-[1px] w-12 bg-white/20 group-hover:bg-white/50 rounded-full" />
    </PanelResizeHandle>
  );
}

/** Thin horizontal resize handle — between top and bottom sections within a sidebar. */
function ResizeHandleSidebarSection() {
  return (
    <PanelResizeHandle
      className={[
        "h-[3px] bg-transparent transition-all duration-300 cursor-row-resize",
        "group flex justify-center items-center",
        "hover:bg-gradient-to-r hover:from-violet-500/50 hover:to-cyan-500/50",
        "active:from-violet-500/80 active:to-cyan-500/80",
      ].join(" ")}
    >
      <div className="h-[1px] w-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
    </PanelResizeHandle>
  );
}

// ─── Region Tab Bar ───────────────────────────────────────────────────────────
// When a region has multiple visible tool windows, show tabs.

interface RegionTabBarProps {
  toolWindowIds: string[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

function RegionTabBar({ toolWindowIds, activeId, onSelect }: RegionTabBarProps) {
  if (toolWindowIds.length <= 1) return null;

  return (
    <div className="flex items-center h-7 bg-[#0f0f11] border-b border-white/[0.06] overflow-x-auto shrink-0">
      {toolWindowIds.map((id) => {
        const reg = toolWindowRegistry.get(id);
        if (!reg) return null;

        const isActive = id === activeId;
        const { icon: Icon, label } = reg;

        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={[
              "flex items-center gap-1.5 px-3 h-full text-[11px] font-medium",
              "border-r border-white/[0.04] transition-colors shrink-0",
              isActive
                ? "text-zinc-200 bg-[#141416] border-b-2 border-b-violet-500/70"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]",
            ].join(" ")}
          >
            <Icon size={12} strokeWidth={isActive ? 2 : 1.8} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── ToolWindowRegion ─────────────────────────────────────────────────────────
// Renders a group of tool windows in a specific placement.
// Shows tabs if multiple are visible, renders active content.

interface ToolWindowRegionProps {
  placement: ToolWindowPlacement;
}

function ToolWindowRegion({ placement }: ToolWindowRegionProps) {
  const toolWindows = useLayoutStore((s) => s.toolWindows);
  const activeToolWindowId = useLayoutStore((s) => s.activeToolWindowId);
  const setActiveToolWindow = useLayoutStore((s) => s.setActiveToolWindow);

  const visibleIds = useMemo(
    () =>
      Object.values(toolWindows)
        .filter(
          (tw) =>
            tw.placement === placement &&
            tw.isVisible &&
            tw.viewMode === "dock-pinned"
        )
        .sort((a, b) => a.order - b.order)
        .map((tw) => tw.id),
    [toolWindows, placement]
  );

  // Determine which tool window content to show:
  // If the global active one is in this region, show it.
  // Otherwise show the first visible one.
  const displayId = useMemo(() => {
    if (activeToolWindowId && visibleIds.includes(activeToolWindowId)) {
      return activeToolWindowId;
    }
    return visibleIds[0] ?? null;
  }, [activeToolWindowId, visibleIds]);

  if (visibleIds.length === 0) return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab bar — only shown when 2+ tool windows */}
      <RegionTabBar
        toolWindowIds={visibleIds}
        activeId={displayId}
        onSelect={setActiveToolWindow}
      />

      {/* Content — show the active tool window */}
      <div className="flex-1 min-h-0">
        {displayId && <ToolWindow id={displayId} />}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
// Combines a top and bottom region within a single sidebar.

interface SidebarProps {
  side: "left" | "right";
}

function Sidebar({ side }: SidebarProps) {
  const topPlacement: ToolWindowPlacement = `${side}-top`;
  const bottomPlacement: ToolWindowPlacement = `${side}-bottom`;

  const toolWindows = useLayoutStore((s) => s.toolWindows);

  const hasTop = useMemo(
    () => Object.values(toolWindows).some((tw) => tw.placement === topPlacement && tw.isVisible && tw.viewMode === "dock-pinned"),
    [toolWindows, topPlacement]
  );
  const hasBottom = useMemo(
    () => Object.values(toolWindows).some((tw) => tw.placement === bottomPlacement && tw.isVisible && tw.viewMode === "dock-pinned"),
    [toolWindows, bottomPlacement]
  );

  // If both sections have content, stack them vertically with a resize handle
  if (hasTop && hasBottom) {
    return (
      <PanelGroup direction="vertical">
        <Panel order={1} defaultSize={60} minSize={20}>
          <ToolWindowRegion placement={topPlacement} />
        </Panel>
        <ResizeHandleSidebarSection />
        <Panel order={2} defaultSize={40} minSize={20}>
          <ToolWindowRegion placement={bottomPlacement} />
        </Panel>
      </PanelGroup>
    );
  }

  // Only one section
  if (hasTop) return <ToolWindowRegion placement={topPlacement} />;
  if (hasBottom) return <ToolWindowRegion placement={bottomPlacement} />;

  return null;
}

// ─── UnpinnedToolWindowOverlay ─────────────────────────────────────────────────
// Renders a dock-unpinned tool window as an absolute overlay anchored to its
// sidebar edge. Hides after 300ms when the mouse leaves the overlay area.

interface UnpinnedOverlayProps {
  toolWindow: ToolWindowState;
  /** Sidebar edge to anchor to */
  edge: "left" | "right" | "bottom";
}

function UnpinnedToolWindowOverlay({ toolWindow, edge }: UnpinnedOverlayProps) {
  const hideToolWindow = useLayoutStore((s) => s.hideToolWindow);
  const setActiveToolWindow = useLayoutStore((s) => s.setActiveToolWindow);
  const activeToolWindowId = useLayoutStore((s) => s.activeToolWindowId);
  const leftSidebarWidth = useLayoutStore((s) => s.leftSidebarWidth);
  const rightSidebarWidth = useLayoutStore((s) => s.rightSidebarWidth);
  const bottomPanelHeight = useLayoutStore((s) => s.bottomPanelHeight);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActive = activeToolWindowId === toolWindow.id;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    clearHideTimer();
    if (!isActive) {
      setActiveToolWindow(toolWindow.id);
    }
  }, [clearHideTimer, isActive, setActiveToolWindow, toolWindow.id]);

  const handleMouseLeave = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      hideToolWindow(toolWindow.id);
    }, 300);
  }, [clearHideTimer, hideToolWindow, toolWindow.id]);

  const registration = toolWindowRegistry.get(toolWindow.id);
  if (!registration) return null;

  // Position the overlay: anchored to the sidebar edge, same height as sidebar
  // Left: positioned right after the left gutter (40px), overlays the sidebar area
  // Right: positioned to the left of the right gutter
  // Bottom: positioned above the status bar
  const style: React.CSSProperties = {
    position: "absolute",
    zIndex: 45,
  };

  if (edge === "left") {
    style.left = 40; // gutter width
    style.top = 0;
    style.bottom = 0;
    style.width = leftSidebarWidth;
  } else if (edge === "right") {
    style.right = 40; // gutter width
    style.top = 0;
    style.bottom = 0;
    style.width = rightSidebarWidth;
  } else {
    // bottom
    style.left = 40;
    style.right = 40;
    style.bottom = 0;
    style.height = bottomPanelHeight;
  }

  return (
    <div
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={[
        "flex flex-col overflow-hidden",
        "bg-[#111113]/95 backdrop-blur-xl",
        "shadow-2xl",
        isActive
          ? "border-violet-500/20"
          : "border-white/[0.08]",
        edge === "left" ? "border-r" : "",
        edge === "right" ? "border-l" : "",
        edge === "bottom" ? "border-t" : "",
        // Slide-in animation via CSS transition
        "transition-transform duration-200 ease-out",
      ].join(" ")}
    >
      <ToolWindow id={toolWindow.id} />
    </div>
  );
}

// ─── ToolWindowManager ────────────────────────────────────────────────────────

interface ToolWindowManagerProps {
  /** Workspace ID passed down to child components that need it */
  workspaceId: string;
  /** Header slot — will be HeaderToolbar once built (Task 7) */
  headerSlot?: ReactNode;
  /** Editor area content — CodeEditor component */
  editorSlot: ReactNode;
}

export function ToolWindowManager({
  workspaceId,
  headerSlot,
  editorSlot,
}: ToolWindowManagerProps) {
  const hasLeft = useLayoutStore((s) => s.hasVisibleIn("left"));
  const hasRight = useLayoutStore((s) => s.hasVisibleIn("right"));
  const hasBottom = useLayoutStore((s) => s.hasVisibleIn("bottom"));
  const collapsedRegions = useLayoutStore((s) => s.collapsedRegions);
  const toolWindows = useLayoutStore((s) => s.toolWindows);

  // Gather floating windows
  const floatingWindows = useMemo(
    () =>
      Object.values(toolWindows).filter(
        (tw) => tw.viewMode === "float" && tw.isVisible
      ),
    [toolWindows]
  );

  // Gather visible dock-unpinned windows with their edge
  const unpinnedWindows = useMemo(
    () =>
      Object.values(toolWindows)
        .filter((tw) => tw.viewMode === "dock-unpinned" && tw.isVisible)
        .map((tw) => {
          let edge: "left" | "right" | "bottom";
          if (tw.placement === "left-top" || tw.placement === "left-bottom") edge = "left";
          else if (tw.placement === "right-top" || tw.placement === "right-bottom") edge = "right";
          else edge = "bottom";
          return { tw, edge };
        }),
    [toolWindows]
  );

  // Effective visibility considers both "has visible tool windows" and "not collapsed"
  const showLeft = hasLeft && !collapsedRegions.left;
  const showRight = hasRight && !collapsedRegions.right;
  const showBottom = hasBottom && !collapsedRegions.bottom;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#0a0a0c] text-zinc-300 selection:bg-cyan-500/30 relative">
      {/* Header slot — HeaderToolbar (Task 7) or fallback */}
      {headerSlot}

      {/* Main area: Gutters + Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Ambient glow — decorative only */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/5 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600/5 rounded-full blur-[120px] pointer-events-none z-0" />

        {/* Left Gutter — hidden on phone (class-based, no JS breakpoint yet) */}
        <div className="hidden sm:flex shrink-0">
          <ToolWindowGutter side="left" />
        </div>

        {/* Center column: sidebars + editor + bottom panel */}
        <PanelGroup direction="vertical" className="flex-1 min-h-0 min-w-0">
          {/* Top section: left sidebar + editor + right sidebar */}
          <Panel id="twm-top" order={1} className="min-h-0">
            <PanelGroup direction="horizontal" className="h-full">
              {/* Left sidebar */}
              {showLeft && (
                <>
                  <Panel
                    order={1}
                    defaultSize={20}
                    minSize={12}
                    maxSize={40}
                    className="flex flex-col min-h-0"
                  >
                    <Sidebar side="left" />
                  </Panel>
                  <ResizeHandleV side="left" />
                </>
              )}

              {/* Editor area — always takes remaining space */}
              <Panel order={2} className="flex flex-col bg-transparent min-w-0">
                {editorSlot}
              </Panel>

              {/* Right sidebar */}
              {showRight && (
                <>
                  <ResizeHandleV side="right" />
                  <Panel
                    order={3}
                    defaultSize={20}
                    minSize={12}
                    maxSize={40}
                    className="flex flex-col min-h-0"
                  >
                    <Sidebar side="right" />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {/* Bottom panel */}
          {showBottom && (
            <>
              <ResizeHandleH />
              <Panel
                id="twm-bottom"
                order={2}
                defaultSize={25}
                minSize={10}
                maxSize={60}
                className="min-h-0"
              >
                <ToolWindowRegion placement="bottom" />
              </Panel>
            </>
          )}
        </PanelGroup>

        {/* Right Gutter — hidden on phone */}
        <div className="hidden sm:flex shrink-0">
          <ToolWindowGutter side="right" />
        </div>

        {/* Dock-unpinned tool windows — absolute overlays within the main area */}
        {unpinnedWindows.map(({ tw, edge }) => (
          <UnpinnedToolWindowOverlay key={tw.id} toolWindow={tw} edge={edge} />
        ))}
      </div>

      {/* StatusBar */}
      <StatusBar workspaceId={workspaceId} />

      {/* Floating tool windows — rendered as absolute overlays */}
      {floatingWindows.map((tw) => (
        <FloatingToolWindow key={tw.id} toolWindow={tw} />
      ))}
    </div>
  );
}
