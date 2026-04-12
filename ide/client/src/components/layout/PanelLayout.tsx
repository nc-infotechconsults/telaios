import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";
import { ActivityBar } from "./ActivityBar";
import { StatusBar } from "./StatusBar";
import { MobileTabBar } from "./MobileTabBar";
import { TopMenu } from "./TopMenu";
import { FileExplorer } from "@/components/explorer/FileExplorer";
import { SearchPanel } from "@/components/panels/SearchPanel";
import { GitPanel } from "@/components/panels/GitPanel";
import { DatabasePanel } from "@/components/panels/DatabasePanel";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { Terminal } from "@/components/terminal/Terminal";
import { useEditorStore } from "@/stores/editorStore";
import type { PanelId, PanelArea, PanelState } from "@/types";
import { useMemo, useState, useEffect } from "react";
import {
  GripVertical,
  Files,
  Search,
  GitBranch,
  Database,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";

// ── Panel content registry ────────────────────────────────────────────────────

const PANEL_COMPONENTS: Record<PanelId, React.FC<{ workspaceId: string }>> = {
  explorer: FileExplorer,
  search:   SearchPanel,
  git:      GitPanel,
  db:       DatabasePanel,
  terminal: Terminal,
};

const PANEL_LABELS: Record<PanelId, string> = {
  explorer: "Explorer",
  search:   "Search",
  git:      "Source Control",
  db:       "Database",
  terminal: "Terminal",
};

const PANEL_ICONS: Record<PanelId, React.FC<{ size?: number }>> = {
  explorer: ({ size = 16 }) => <Files size={size} />,
  search:   ({ size = 16 }) => <Search size={size} />,
  git:      ({ size = 16 }) => <GitBranch size={size} />,
  db:       ({ size = 16 }) => <Database size={size} />,
  terminal: ({ size = 16 }) => <TerminalIcon size={size} />,
};

// ── Resize handle styles ──────────────────────────────────────────────────────

/** Thin handle between panels within the same sidebar section. */
const HANDLE_H = (
  <PanelResizeHandle className="h-[3px] bg-transparent hover:bg-gradient-to-r hover:from-violet-500/50 hover:to-cyan-500/50 active:from-violet-500/80 active:to-cyan-500/80 transition-all duration-300 cursor-row-resize group flex justify-center items-center">
    <div className="h-[1px] w-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
  </PanelResizeHandle>
);

/** Thicker handle that marks the boundary between the top and bottom sections of a sidebar. */
const HANDLE_H_SECTION = (
  <PanelResizeHandle className="h-[5px] bg-white/[0.025] hover:bg-gradient-to-r hover:from-violet-500/50 hover:to-cyan-500/50 active:from-violet-500/80 active:to-cyan-500/80 transition-all duration-300 cursor-row-resize group flex justify-center items-center">
    <div className="h-[1px] w-12 bg-white/20 group-hover:bg-white/50 rounded-full" />
  </PanelResizeHandle>
);

const HANDLE_V_LEFT = (
  <PanelResizeHandle className="w-[3px] bg-transparent hover:bg-gradient-to-b hover:from-violet-500/50 hover:to-cyan-500/50 active:from-violet-500/80 active:to-cyan-500/80 transition-all duration-300 cursor-col-resize group flex flex-col justify-center items-center">
    <div className="w-[1px] h-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
  </PanelResizeHandle>
);

const HANDLE_V_RIGHT = (
  <PanelResizeHandle className="w-[3px] bg-transparent hover:bg-gradient-to-b hover:from-cyan-500/50 hover:to-violet-500/50 active:from-cyan-500/80 active:to-violet-500/80 transition-all duration-300 cursor-col-resize group flex flex-col justify-center items-center">
    <div className="w-[1px] h-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
  </PanelResizeHandle>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function openPanelsByArea(
  panels: Record<PanelId, PanelState>,
  area: PanelArea,
): PanelState[] {
  return Object.values(panels)
    .filter((p) => p.area === area && p.isOpen)
    .sort((a, b) => a.order - b.order);
}

// ── PanelLayout ───────────────────────────────────────────────────────────────

interface Props {
  workspaceId: string;
}

export function PanelLayout({ workspaceId }: Props) {
  const panels      = useEditorStore((s) => s.panels);
  const saveTab     = useEditorStore((s) => s.saveTab);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const closeTab    = useEditorStore((s) => s.closeTab);
  const togglePanel = useEditorStore((s) => s.togglePanel);

  // ── Open panels per area ────────────────────────────────────────────────────
  const leftTopPanels     = useMemo(() => openPanelsByArea(panels, "left-top"),    [panels]);
  const leftBottomPanels  = useMemo(() => openPanelsByArea(panels, "left-bottom"), [panels]);
  const rightTopPanels    = useMemo(() => openPanelsByArea(panels, "right-top"),   [panels]);
  const rightBottomPanels = useMemo(() => openPanelsByArea(panels, "right-bottom"),[panels]);
  const bottomPanels      = useMemo(() => openPanelsByArea(panels, "bottom"),       [panels]);

  const hasLeftSidebar  = leftTopPanels.length > 0  || leftBottomPanels.length > 0;
  const hasRightSidebar = rightTopPanels.length > 0 || rightBottomPanels.length > 0;
  const hasBottomPanel  = bottomPanels.length > 0;

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (activeTabId) await saveTab(workspaceId, activeTabId);
  }

  async function handleSaveAll() {
    const tabs = useEditorStore.getState().tabs;
    for (const tab of tabs) {
      if (tab.isDirty) await saveTab(workspaceId, tab.id);
    }
  }

  function handleCloseTab() {
    if (activeTabId) closeTab(activeTabId);
  }

  function handleToggleSidebar(side: "left" | "right") {
    const { panels: currentPanels } = useEditorStore.getState();
    const areas: PanelArea[] = side === "left"
      ? ["left-top", "left-bottom"]
      : ["right-top", "right-bottom"];

    const hasOpen = Object.values(currentPanels).some(
      (p) => areas.includes(p.area) && p.isOpen,
    );

    if (hasOpen) {
      Object.values(currentPanels)
        .filter((p) => areas.includes(p.area) && p.isOpen)
        .forEach((p) => useEditorStore.getState().togglePanel(p.id));
    } else {
      useEditorStore.getState().togglePanel(side === "left" ? "explorer" : "db");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#0a0a0c] text-zinc-300 selection:bg-cyan-500/30">
      <TopMenu
        workspaceId={workspaceId}
        onSave={handleSave}
        onSaveAll={handleSaveAll}
        onCloseTab={handleCloseTab}
        onToggleSidebar={() => handleToggleSidebar("left")}
        onToggleTerminal={() => togglePanel("terminal")}
      />

      {/*
        Main area:
        • Left ActivityBar — full height
        • Center PanelGroup (vertical): [top section] + [bottom panel]
        • Right ActivityBar — full height
      */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Ambient glow — decorative only */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/5 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600/5 rounded-full blur-[120px] pointer-events-none z-0" />

        {/* Left ActivityBar — full height */}
        <ActivityBar side="left" />

        {/* Center column: editor + optional bottom panel */}
        <PanelGroup direction="vertical" className="flex-1 min-h-0 min-w-0">

          {/* ── Top section: sidebars + editor ── */}
          <Panel id="main-top" order={1} className="min-h-0">
            <PanelGroup direction="horizontal" className="h-full">

              {/* Left sidebar — flat vertical PanelGroup */}
              {hasLeftSidebar && (
                <>
                  <Panel order={1} defaultSize={20} minSize={12} maxSize={40} className="flex flex-col min-h-0">
                    <PanelGroup direction="vertical">
                      {/* Left-top panels */}
                      {leftTopPanels.map((ps, i) => (
                        <SidebarPanel
                          key={ps.id}
                          panelState={ps}
                          panelOrder={i + 1}
                          workspaceId={workspaceId}
                          precedingHandle={i > 0 ? HANDLE_H : null}
                        />
                      ))}

                      {/* Section separator */}
                      {leftTopPanels.length > 0 && leftBottomPanels.length > 0 && HANDLE_H_SECTION}

                      {/* Left-bottom panels */}
                      {leftBottomPanels.map((ps, i) => (
                        <SidebarPanel
                          key={ps.id}
                          panelState={ps}
                          panelOrder={leftTopPanels.length + i + 1}
                          workspaceId={workspaceId}
                          precedingHandle={i > 0 ? HANDLE_H : (leftTopPanels.length === 0 && i === 0) ? null : null}
                        />
                      ))}
                    </PanelGroup>
                  </Panel>
                  {HANDLE_V_LEFT}
                </>
              )}

              {/* Editor */}
              <Panel order={2} className="flex flex-col bg-transparent min-w-0">
                <CodeEditor workspaceId={workspaceId} />
              </Panel>

              {/* Right sidebar — flat vertical PanelGroup */}
              {hasRightSidebar && (
                <>
                  {HANDLE_V_RIGHT}
                  <Panel order={3} defaultSize={20} minSize={12} maxSize={40} className="flex flex-col min-h-0">
                    <PanelGroup direction="vertical">
                      {/* Right-top panels */}
                      {rightTopPanels.map((ps, i) => (
                        <SidebarPanel
                          key={ps.id}
                          panelState={ps}
                          panelOrder={i + 1}
                          workspaceId={workspaceId}
                          precedingHandle={i > 0 ? HANDLE_H : null}
                        />
                      ))}

                      {/* Section separator */}
                      {rightTopPanels.length > 0 && rightBottomPanels.length > 0 && HANDLE_H_SECTION}

                      {/* Right-bottom panels */}
                      {rightBottomPanels.map((ps, i) => (
                        <SidebarPanel
                          key={ps.id}
                          panelState={ps}
                          panelOrder={rightTopPanels.length + i + 1}
                          workspaceId={workspaceId}
                          precedingHandle={i > 0 ? HANDLE_H : (rightTopPanels.length === 0 && i === 0) ? null : null}
                        />
                      ))}
                    </PanelGroup>
                  </Panel>
                </>
              )}

            </PanelGroup>
          </Panel>

          {/* ── Bottom section (e.g. Terminal) ── */}
          {hasBottomPanel && (
            <>
              {HANDLE_H}
              <Panel
                id="main-bottom"
                order={2}
                defaultSize={25}
                minSize={10}
                maxSize={60}
                className="min-h-0"
              >
                <PanelGroup direction="horizontal">
                  {bottomPanels.map((ps, i) => (
                    <SidebarPanel
                      key={ps.id}
                      panelState={ps}
                      panelOrder={i + 1}
                      workspaceId={workspaceId}
                      precedingHandle={i > 0 ? HANDLE_V_LEFT : null}
                    />
                  ))}
                </PanelGroup>
              </Panel>
            </>
          )}

        </PanelGroup>

        {/* Right ActivityBar — full height */}
        <ActivityBar side="right" />
      </div>

      <StatusBar workspaceId={workspaceId} />
      <MobileTabBar />
    </div>
  );
}

// ── SidebarPanel ──────────────────────────────────────────────────────────────

function SidebarPanel({
  panelState,
  panelOrder,
  workspaceId,
  precedingHandle,
}: {
  panelState: PanelState;
  panelOrder: number;
  workspaceId: string;
  /** Optional resize handle to render before this panel (inside the Fragment). */
  precedingHandle: React.ReactNode;
}) {
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const dragState      = useEditorStore((s) => s.dragState);
  const togglePanel    = useEditorStore((s) => s.togglePanel);
  const movePanel      = useEditorStore((s) => s.movePanel);
  const startDrag      = useEditorStore((s) => s.startDrag);
  const endDrag        = useEditorStore((s) => s.endDrag);

  const [isDragOver, setIsDragOver] = useState(false);

  // Clear drag-over highlight when a drag ends globally
  useEffect(() => {
    if (!dragState.panelId) setIsDragOver(false);
  }, [dragState.panelId]);

  // Focus this panel when it first mounts
  useEffect(() => {
    setActivePanel(panelState.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Component   = PANEL_COMPONENTS[panelState.id];
  const PanelIcon   = PANEL_ICONS[panelState.id];
  const isDragging  = dragState.panelId === panelState.id;
  const isBottom    = panelState.area === "bottom";

  // Border: left areas → right border; right areas → left border; bottom → top border
  const borderClass = isBottom
    ? "border-t border-white/[0.05]"
    : panelState.area.startsWith("left")
      ? "border-r border-white/[0.05]"
      : "border-l border-white/[0.05]";

  function handleDragOver(e: React.DragEvent) {
    if (!dragState.panelId || dragState.panelId === panelState.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (!dragState.panelId || dragState.panelId === panelState.id) return;
    // Move dragged panel into this panel's area (append)
    movePanel(dragState.panelId, panelState.area);
    setActivePanel(dragState.panelId);
    endDrag();
  }

  return (
    <>
      {precedingHandle}
      <Panel
        order={panelOrder}
        defaultSize={panelState.size ?? 50}
        className={[
          "bg-white/[0.02] backdrop-blur-md flex flex-col",
          borderClass,
          isDragging ? "opacity-50" : "",
          isDragOver ? "bg-violet-500/10 ring-2 ring-violet-500 ring-inset" : "",
        ].join(" ")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/5 shrink-0">
          <button
            className="cursor-grab active:cursor-grabbing select-none"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("panelId", panelState.id);
              e.dataTransfer.effectAllowed = "move";
              startDrag(panelState.id);
            }}
            onDragEnd={() => endDrag()}
            title="Drag to move panel"
          >
            <GripVertical size={12} className="text-zinc-600 hover:text-zinc-400" />
          </button>

          <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
            {PanelIcon && <PanelIcon size={14} />}
            {PANEL_LABELS[panelState.id] ?? panelState.id}
          </span>

          <div className="flex-1" />

          <button
            onClick={() => togglePanel(panelState.id)}
            className="p-1 text-zinc-600 hover:text-zinc-400 hover:bg-white/5 rounded"
            title="Close panel"
          >
            <X size={12} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {Component
            ? <Component workspaceId={workspaceId} />
            : <div className="flex items-center justify-center h-full text-zinc-500 text-sm">Unknown panel</div>
          }
        </div>
      </Panel>
    </>
  );
}
