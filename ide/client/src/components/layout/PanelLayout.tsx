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
import type { PanelId, PanelPosition, PanelConfig } from "@/types";
import { useState, useEffect } from "react";
import { GripVertical, Files, Search, GitBranch, Database, X } from "lucide-react";

const PANEL_COMPONENTS: Record<PanelId, React.FC<{ workspaceId: string }>> = {
  explorer: FileExplorer,
  search: SearchPanel,
  git: GitPanel,
  db: DatabasePanel,
  terminal: () => null,
};

const PANEL_LABELS: Record<PanelId, string> = {
  explorer: "Explorer",
  search: "Search",
  git: "Source Control",
  db: "Database",
  terminal: "Terminal",
};

const PANEL_ICONS: Record<PanelId, React.FC<{ size?: number }>> = {
  explorer: ({ size = 16 }) => <Files size={size} />,
  search: ({ size = 16 }) => <Search size={size} />,
  git: ({ size = 16 }) => <GitBranch size={size} />,
  db: ({ size = 16 }) => <Database size={size} />,
  terminal: () => null,
};

interface Props {
  workspaceId: string;
}

export function PanelLayout({ workspaceId }: Props) {
  const panels = useEditorStore((s) => s.panels);
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const movePanel = useEditorStore((s) => s.movePanel);
  const terminalOpen = useEditorStore((s) => s.terminalOpen);
  const setTerminalOpen = useEditorStore((s) => s.setTerminalOpen);
  const saveTab = useEditorStore((s) => s.saveTab);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const closeTab = useEditorStore((s) => s.closeTab);
  const dragState = useEditorStore((s) => s.dragState);
  const startDrag = useEditorStore((s) => s.startDrag);
  const endDrag = useEditorStore((s) => s.endDrag);

  const [dropTarget, setDropTarget] = useState<PanelPosition | null>(null);

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
    const positions: PanelPosition[] = side === "left" 
      ? ["left-top", "left-bottom"] 
      : ["right-top", "right-bottom"];
    
    const hasOpen = positions.some(p => panels[p]?.isOpen);
    
    if (hasOpen) {
      positions.forEach(p => {
        const config = panels[p];
        if (config?.isOpen) useEditorStore.getState().togglePanel(config.id);
      });
    } else {
      const firstPanel = side === "left" ? "explorer" : "search";
      useEditorStore.getState().togglePanel(firstPanel);
    }
  }

  function handleToggleTerminal() {
    setTerminalOpen(!terminalOpen);
  }

  function handleDragStart(panelId: PanelId, position: PanelPosition) {
    startDrag(panelId, position);
  }

  function handleDragEnd() {
    if (dropTarget && dragState.panelId) {
      movePanel(dragState.panelId, dropTarget);
      setActivePanel(dragState.panelId);
    }
    endDrag();
    setDropTarget(null);
  }

  const leftTopPanel = panels["left-top"];
  const leftBottomPanel = panels["left-bottom"];
  const rightTopPanel = panels["right-top"];
  const rightBottomPanel = panels["right-bottom"];

  const hasLeftSidebar = leftTopPanel?.isOpen || leftBottomPanel?.isOpen;
  const hasRightSidebar = rightTopPanel?.isOpen || rightBottomPanel?.isOpen;

  // Show two left sections only when both are open
  const showLeftBoth = leftTopPanel?.isOpen && leftBottomPanel?.isOpen;
  // Show two right sections only when both are open
  const showRightBoth = rightTopPanel?.isOpen && rightBottomPanel?.isOpen;

  const dropPositions: PanelPosition[] = ["left-top", "left-bottom", "right-top", "right-bottom"];

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#0a0a0c] text-zinc-300 selection:bg-cyan-500/30">
      <TopMenu
        workspaceId={workspaceId}
        onSave={handleSave}
        onSaveAll={handleSaveAll}
        onCloseTab={handleCloseTab}
        onToggleSidebar={() => handleToggleSidebar("left")}
        onToggleTerminal={handleToggleTerminal}
      />

      {/* Main layout: ActivityBars flank the resizable PanelGroup */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Left activity bar — outside PanelGroup so it never participates in resizing */}
        <ActivityBar side="left" />

        <PanelGroup direction="horizontal" className="flex-1 relative">
          {/* ── Left Sidebar ── */}
          {hasLeftSidebar && (
            <>
              {/* Wrap sidebar in a Panel so react-resizable-panels is happy */}
              <Panel defaultSize={20} minSize={12} maxSize={40} className="flex flex-col">
                <PanelGroup direction="vertical">
                  {leftTopPanel?.isOpen && (
                    <SidebarPanel
                      panelConfig={leftTopPanel}
                      position="left-top"
                      workspaceId={workspaceId}
                      onDragStart={handleDragStart}
                      isDropTarget={dropTarget === "left-top"}
                      onDragEnd={handleDragEnd}
                    />
                  )}

                  {/* Resize handle between top and bottom — only when both visible */}
                  {showLeftBoth && (
                    <PanelResizeHandle className="h-[3px] bg-transparent hover:bg-gradient-to-r hover:from-violet-500/50 hover:to-violet-500/30 active:bg-violet-500/80 transition-all duration-300 cursor-row-resize group flex justify-center items-center">
                      <div className="h-[1px] w-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
                    </PanelResizeHandle>
                  )}

                  {leftBottomPanel?.isOpen && (
                    <SidebarPanel
                      panelConfig={leftBottomPanel}
                      position="left-bottom"
                      workspaceId={workspaceId}
                      onDragStart={handleDragStart}
                      isDropTarget={dropTarget === "left-bottom"}
                      onDragEnd={handleDragEnd}
                    />
                  )}
                </PanelGroup>
              </Panel>

              <PanelResizeHandle className="w-[3px] bg-transparent hover:bg-gradient-to-b hover:from-violet-500/50 hover:to-cyan-500/50 active:from-violet-500/80 active:to-cyan-500/80 transition-all duration-300 cursor-col-resize group flex flex-col justify-center items-center">
                <div className="w-[1px] h-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
              </PanelResizeHandle>
            </>
          )}

          {/* ── Editor + Terminal ── */}
          <Panel className="flex flex-col bg-transparent">
            <PanelGroup direction="vertical">
              <Panel className="min-h-20 bg-transparent">
                <CodeEditor workspaceId={workspaceId} />
              </Panel>

              {terminalOpen && (
                <>
                  <PanelResizeHandle className="h-[3px] bg-transparent hover:bg-gradient-to-r hover:from-violet-500/50 hover:to-cyan-500/50 active:bg-gradient-to-r active:from-violet-500/80 active:to-cyan-500/80 transition-all duration-300 cursor-row-resize group flex justify-center items-center">
                    <div className="h-[1px] w-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
                  </PanelResizeHandle>
                  <Panel defaultSize={25} minSize={10} maxSize={60} className="bg-white/[0.02] backdrop-blur-md border-t border-white/[0.05]">
                    <Terminal workspaceId={workspaceId} />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {/* ── Right Sidebar ── */}
          {hasRightSidebar && (
            <>
              <PanelResizeHandle className="w-[3px] bg-transparent hover:bg-gradient-to-b hover:from-cyan-500/50 hover:to-violet-500/50 active:from-cyan-500/80 active:to-violet-500/80 transition-all duration-300 cursor-col-resize group flex flex-col justify-center items-center">
                <div className="w-[1px] h-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
              </PanelResizeHandle>

              {/* Wrap sidebar in a Panel so react-resizable-panels is happy */}
              <Panel defaultSize={20} minSize={12} maxSize={40} className="flex flex-col">
                <PanelGroup direction="vertical">
                  {rightTopPanel?.isOpen && (
                    <SidebarPanel
                      panelConfig={rightTopPanel}
                      position="right-top"
                      workspaceId={workspaceId}
                      onDragStart={handleDragStart}
                      isDropTarget={dropTarget === "right-top"}
                      onDragEnd={handleDragEnd}
                    />
                  )}

                  {showRightBoth && (
                    <PanelResizeHandle className="h-[3px] bg-transparent hover:bg-gradient-to-r hover:from-cyan-500/50 hover:to-cyan-500/30 active:bg-cyan-500/80 transition-all duration-300 cursor-row-resize group flex justify-center items-center">
                      <div className="h-[1px] w-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
                    </PanelResizeHandle>
                  )}

                  {rightBottomPanel?.isOpen && (
                    <SidebarPanel
                      panelConfig={rightBottomPanel}
                      position="right-bottom"
                      workspaceId={workspaceId}
                      onDragStart={handleDragStart}
                      isDropTarget={dropTarget === "right-bottom"}
                      onDragEnd={handleDragEnd}
                    />
                  )}
                </PanelGroup>
              </Panel>
            </>
          )}
        </PanelGroup>

        {/* Right activity bar — outside PanelGroup, mirrors left side */}
        <ActivityBar side="right" />

        {/* Drop-zone overlay shown while a panel header is being dragged */}
        {dragState.panelId && (
          <div className="absolute inset-0 z-50 flex">
            {dropPositions.map((pos) => {
              const isCurrentPos = dragState.sourcePosition === pos;
              return (
                <div
                  key={pos}
                  className={`flex-1 transition-all duration-200 ${
                    isCurrentPos
                      ? "bg-transparent"
                      : dropTarget === pos
                        ? "bg-violet-500/20 border-2 border-dashed border-violet-500"
                        : "hover:bg-white/5"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); if (!isCurrentPos) setDropTarget(pos); }}
                  onDragLeave={() => { if (dropTarget === pos) setDropTarget(null); }}
                  onDrop={() => handleDragEnd()}
                />
              );
            })}
          </div>
        )}
      </div>

      <StatusBar workspaceId={workspaceId} />
      <MobileTabBar />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarPanel — renders as a react-resizable-panels <Panel> with a header
// ---------------------------------------------------------------------------

function SidebarPanel({
  panelConfig,
  position,
  workspaceId,
  onDragStart,
  isDropTarget,
  onDragEnd,
}: {
  panelConfig: PanelConfig;
  position: PanelPosition;
  workspaceId: string;
  onDragStart: (panelId: PanelId, position: PanelPosition) => void;
  isDropTarget: boolean;
  onDragEnd: () => void;
}) {
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const dragState = useEditorStore((s) => s.dragState);
  const togglePanel = useEditorStore((s) => s.togglePanel);

  const Component = PANEL_COMPONENTS[panelConfig.id];
  const PanelIcon = PANEL_ICONS[panelConfig.id];
  const isDragging = dragState.panelId === panelConfig.id;

  // Set this panel as active when it first mounts
  useEffect(() => {
    setActivePanel(panelConfig.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Panel
      defaultSize={panelConfig.size ?? 50}
      className={`bg-white/[0.02] backdrop-blur-md ${
        position.includes("left") ? "border-r" : "border-l"
      } border-white/[0.05] transition-all duration-200 flex flex-col ${
        isDragging ? "opacity-50" : ""
      } ${isDropTarget ? "bg-violet-500/10 ring-2 ring-violet-500 ring-inset" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/5 shrink-0">
        <button
          className="cursor-grab active:cursor-grabbing select-none"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("panelId", panelConfig.id);
            e.dataTransfer.effectAllowed = "move";
            onDragStart(panelConfig.id, position);
          }}
          onDragEnd={onDragEnd}
          title="Drag to move panel"
        >
          <GripVertical size={12} className="text-zinc-600 hover:text-zinc-400" />
        </button>

        <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
          {PanelIcon && <PanelIcon size={14} />}
          {PANEL_LABELS[panelConfig.id] || panelConfig.id}
        </span>

        <div className="flex-1" />

        <button
          onClick={() => togglePanel(panelConfig.id)}
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
  );
}
