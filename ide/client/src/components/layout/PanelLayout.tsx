import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { ActivityBar } from "./ActivityBar";
import { StatusBar } from "./StatusBar";
import { MobileTabBar } from "./MobileTabBar";
import { TopMenu } from "./TopMenu";
import { SectionDivider } from "./SectionDivider";
import { FileExplorer } from "@/components/explorer/FileExplorer";
import { SearchPanel } from "@/components/panels/SearchPanel";
import { GitPanel } from "@/components/panels/GitPanel";
import { DatabasePanel } from "@/components/panels/DatabasePanel";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { Terminal } from "@/components/terminal/Terminal";
import { useEditorStore } from "@/stores/editorStore";
import type { PanelId, PanelArea, PanelState } from "@/types";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  GripVertical,
  Files,
  Search,
  GitBranch,
  Database,
  Terminal as TerminalIcon,
  X,
  ChevronsDownUp,
  ChevronsUpDown,
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

/** Thicker handle used between the editor main area and the bottom strip. */
const HANDLE_H_SECTION = (
  <PanelResizeHandle className="h-[5px] bg-white/[0.025] hover:bg-gradient-to-r hover:from-violet-500/50 hover:to-cyan-500/50 active:from-violet-500/80 active:to-cyan-500/80 transition-all duration-300 cursor-row-resize group flex justify-center items-center">
    <div className="h-[1px] w-12 bg-white/20 group-hover:bg-white/50 rounded-full" />
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

// ── SidebarSection ────────────────────────────────────────────────────────────

/**
 * Wraps a list of stacked panels in a single collapsible react-resizable-panels
 * Panel. Used to implement section-level collapse/expand.
 */
function SidebarSection({
  panels,
  workspaceId,
  order,
  panelRef,
  collapsible,
}: {
  panels: PanelState[];
  workspaceId: string;
  order: number;
  panelRef: React.RefObject<ImperativePanelHandle>;
  collapsible: boolean;
}) {
  if (panels.length === 0) return null;

  return (
    <Panel
      ref={panelRef}
      order={order}
      defaultSize={50}
      minSize={15}
      collapsible={collapsible}
      collapsedSize={0}
      className="flex flex-col min-h-0"
    >
      <PanelGroup direction="vertical">
        {panels.map((ps, i) => (
          <SidebarPanel
            key={ps.id}
            panelState={ps}
            panelOrder={i + 1}
            workspaceId={workspaceId}
            nextPanelId={panels[i + 1]?.id}
            siblingsCount={panels.length}
            precedingHandle={i > 0 ? HANDLE_H : null}
          />
        ))}
      </PanelGroup>
    </Panel>
  );
}

// ── PanelLayout ───────────────────────────────────────────────────────────────

interface Props {
  workspaceId: string;
}

export function PanelLayout({ workspaceId }: Props) {
  const panels           = useEditorStore((s) => s.panels);
  const saveTab          = useEditorStore((s) => s.saveTab);
  const activeTabId      = useEditorStore((s) => s.activeTabId);
  const closeTab         = useEditorStore((s) => s.closeTab);
  const togglePanel      = useEditorStore((s) => s.togglePanel);
  const dragState        = useEditorStore((s) => s.dragState);
  const collapsedSections= useEditorStore((s) => s.collapsedSections);

  // ── Imperative refs for section collapse ────────────────────────────────────
  const leftTopRef     = useRef<ImperativePanelHandle>(null);
  const leftBottomRef  = useRef<ImperativePanelHandle>(null);
  const rightTopRef    = useRef<ImperativePanelHandle>(null);
  const rightBottomRef = useRef<ImperativePanelHandle>(null);

  // ── Open panels per area ────────────────────────────────────────────────────
  const leftTopPanels     = useMemo(() => openPanelsByArea(panels, "left-top"),    [panels]);
  const leftBottomPanels  = useMemo(() => openPanelsByArea(panels, "left-bottom"), [panels]);
  const rightTopPanels    = useMemo(() => openPanelsByArea(panels, "right-top"),   [panels]);
  const rightBottomPanels = useMemo(() => openPanelsByArea(panels, "right-bottom"),[panels]);
  const bottomPanels      = useMemo(() => openPanelsByArea(panels, "bottom"),       [panels]);

  const hasLeftSidebar  = leftTopPanels.length > 0  || leftBottomPanels.length > 0;
  const hasRightSidebar = rightTopPanels.length > 0 || rightBottomPanels.length > 0;
  const hasBottomPanel  = bottomPanels.length > 0;

  // Both sections must be present for the divider (and collapsibility) to make sense
  const showLeftDivider  = leftTopPanels.length > 0  && leftBottomPanels.length > 0;
  const showRightDivider = rightTopPanels.length > 0 && rightBottomPanels.length > 0;

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

              {/* Left sidebar */}
              {hasLeftSidebar && (
                <>
                  <Panel order={1} defaultSize={20} minSize={12} maxSize={40} className="flex flex-col min-h-0">
                    <PanelGroup direction="vertical">

                      {/* Left-top section */}
                      <SidebarSection
                        panels={leftTopPanels}
                        workspaceId={workspaceId}
                        order={1}
                        panelRef={leftTopRef}
                        collapsible={showLeftDivider}
                      />

                      {/* Section separator with collapse controls + drop zone */}
                      {showLeftDivider && (
                        <SectionDivider
                          side="left"
                          topRef={leftTopRef}
                          bottomRef={leftBottomRef}
                          dragState={dragState}
                          topCollapsed={!!collapsedSections["left-top"]}
                          bottomCollapsed={!!collapsedSections["left-bottom"]}
                        />
                      )}

                      {/* Left-bottom section */}
                      <SidebarSection
                        panels={leftBottomPanels}
                        workspaceId={workspaceId}
                        order={showLeftDivider ? 2 : 1}
                        panelRef={leftBottomRef}
                        collapsible={showLeftDivider}
                      />

                    </PanelGroup>
                  </Panel>
                  {HANDLE_V_LEFT}
                </>
              )}

              {/* Editor */}
              <Panel order={2} className="flex flex-col bg-transparent min-w-0">
                <CodeEditor workspaceId={workspaceId} />
              </Panel>

              {/* Right sidebar */}
              {hasRightSidebar && (
                <>
                  {HANDLE_V_RIGHT}
                  <Panel order={3} defaultSize={20} minSize={12} maxSize={40} className="flex flex-col min-h-0">
                    <PanelGroup direction="vertical">

                      {/* Right-top section */}
                      <SidebarSection
                        panels={rightTopPanels}
                        workspaceId={workspaceId}
                        order={1}
                        panelRef={rightTopRef}
                        collapsible={showRightDivider}
                      />

                      {/* Section separator */}
                      {showRightDivider && (
                        <SectionDivider
                          side="right"
                          topRef={rightTopRef}
                          bottomRef={rightBottomRef}
                          dragState={dragState}
                          topCollapsed={!!collapsedSections["right-top"]}
                          bottomCollapsed={!!collapsedSections["right-bottom"]}
                        />
                      )}

                      {/* Right-bottom section */}
                      <SidebarSection
                        panels={rightBottomPanels}
                        workspaceId={workspaceId}
                        order={showRightDivider ? 2 : 1}
                        panelRef={rightBottomRef}
                        collapsible={showRightDivider}
                      />

                    </PanelGroup>
                  </Panel>
                </>
              )}

            </PanelGroup>
          </Panel>

          {/* ── Bottom strip (e.g. Terminal) ── */}
          {hasBottomPanel && (
            <>
              {HANDLE_H_SECTION}
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
                      nextPanelId={bottomPanels[i + 1]?.id}
                      siblingsCount={bottomPanels.length}
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
  nextPanelId,
  siblingsCount,
  precedingHandle,
}: {
  panelState: PanelState;
  panelOrder: number;
  workspaceId: string;
  /** Id of the panel that follows this one in the same area (for drop ordering). */
  nextPanelId?: PanelId;
  /** Total number of open panels in this section (hides collapse btn when 1). */
  siblingsCount: number;
  /** Optional resize handle to render before this panel (inside the Fragment). */
  precedingHandle: React.ReactNode;
}) {
  const setActivePanel       = useEditorStore((s) => s.setActivePanel);
  const dragState            = useEditorStore((s) => s.dragState);
  const togglePanel          = useEditorStore((s) => s.togglePanel);
  const togglePanelCollapse  = useEditorStore((s) => s.togglePanelCollapse);
  const movePanel            = useEditorStore((s) => s.movePanel);
  const startDrag            = useEditorStore((s) => s.startDrag);
  const endDrag              = useEditorStore((s) => s.endDrag);

  // "top" | "bottom" | null — which half the cursor is over during a drag
  const [dropSide, setDropSide] = useState<"top" | "bottom" | null>(null);

  // Clear drop indicator when drag ends
  useEffect(() => {
    if (!dragState.panelId) setDropSide(null);
  }, [dragState.panelId]);

  const Component  = PANEL_COMPONENTS[panelState.id];
  const PanelIcon  = PANEL_ICONS[panelState.id];
  const isDragging = dragState.panelId === panelState.id;
  const isBottom   = panelState.area === "bottom";
  const isCollapsed = panelState.isCollapsed;
  const canCollapse = siblingsCount > 1;

  // Border direction per area
  const borderClass = isBottom
    ? "border-t border-white/[0.05]"
    : panelState.area.startsWith("left")
      ? "border-r border-white/[0.05]"
      : "border-l border-white/[0.05]";

  // ── Drag handlers ─────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    if (!dragState.panelId || dragState.panelId === panelState.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropSide(e.clientY < rect.top + rect.height / 2 ? "top" : "bottom");
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDropSide(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const side = dropSide;
    setDropSide(null);
    if (!dragState.panelId || dragState.panelId === panelState.id) return;
    // top half → insert before this panel; bottom half → insert before the next
    const insertBefore = side === "top" ? panelState.id : nextPanelId;
    movePanel(dragState.panelId, panelState.area, insertBefore);
    setActivePanel(dragState.panelId);
    endDrag();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {precedingHandle}
      <Panel
        order={panelOrder}
        defaultSize={isCollapsed ? 0 : (panelState.size ?? 50)}
        collapsible={canCollapse}
        collapsedSize={0}
        className={[
          "bg-white/[0.02] backdrop-blur-md flex flex-col relative",
          borderClass,
          isDragging ? "opacity-50" : "",
        ].join(" ")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Top drop indicator */}
        {dropSide === "top" && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500 to-cyan-500 z-10 pointer-events-none" />
        )}

        {/* Header */}
        <div
          className="flex items-center gap-2 px-2 py-1.5 border-b border-white/5 shrink-0"
          onClick={() => setActivePanel(panelState.id)}
        >
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

          <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5 select-none">
            {PanelIcon && <PanelIcon size={14} />}
            {PANEL_LABELS[panelState.id] ?? panelState.id}
          </span>

          <div className="flex-1" />

          {/* Collapse-to-header button (only when 2+ panels in section) */}
          {canCollapse && (
            <button
              onClick={(e) => { e.stopPropagation(); togglePanelCollapse(panelState.id); }}
              className="p-1 text-zinc-600 hover:text-zinc-400 hover:bg-white/5 rounded"
              title={isCollapsed ? "Expand panel" : "Collapse panel"}
            >
              {isCollapsed
                ? <ChevronsUpDown size={12} />
                : <ChevronsDownUp size={12} />
              }
            </button>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); togglePanel(panelState.id); }}
            className="p-1 text-zinc-600 hover:text-zinc-400 hover:bg-white/5 rounded"
            title="Close panel"
          >
            <X size={12} />
          </button>
        </div>

        {/* Content — hidden when collapsed to header only */}
        {!isCollapsed && (
          <div className="flex-1 min-h-0 overflow-hidden">
            {Component
              ? <Component workspaceId={workspaceId} />
              : <div className="flex items-center justify-center h-full text-zinc-500 text-sm">Unknown panel</div>
            }
          </div>
        )}

        {/* Bottom drop indicator */}
        {dropSide === "bottom" && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500 to-cyan-500 z-10 pointer-events-none" />
        )}
      </Panel>
    </>
  );
}
