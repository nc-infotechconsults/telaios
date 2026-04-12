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

interface Props {
  workspaceId: string;
}

export function PanelLayout({ workspaceId }: Props) {
  const sidebarOpen = useEditorStore((s) => s.sidebarOpen);
  const terminalOpen = useEditorStore((s) => s.terminalOpen);
  const activePanel = useEditorStore((s) => s.activePanel);
  const setSidebarOpen = useEditorStore((s) => s.setSidebarOpen);
  const setTerminalOpen = useEditorStore((s) => s.setTerminalOpen);
  const saveTab = useEditorStore((s) => s.saveTab);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const closeTab = useEditorStore((s) => s.closeTab);

  // TopMenu handlers
  async function handleSave() {
    if (activeTabId) {
      await saveTab(workspaceId, activeTabId);
    }
  }

  async function handleSaveAll() {
    const tabs = useEditorStore.getState().tabs;
    for (const tab of tabs) {
      if (tab.isDirty) {
        await saveTab(workspaceId, tab.id);
      }
    }
  }

  function handleCloseTab() {
    if (activeTabId) {
      closeTab(activeTabId);
    }
  }

  function handleToggleSidebar() {
    setSidebarOpen(!sidebarOpen);
  }

  function handleToggleTerminal() {
    setTerminalOpen(!terminalOpen);
  }

  const SideContent = () => {
    switch (activePanel) {
      case "explorer":
        return <FileExplorer workspaceId={workspaceId} />;
      case "search":
        return <SearchPanel workspaceId={workspaceId} />;
      case "git":
        return <GitPanel workspaceId={workspaceId} />;
      case "db":
        return <DatabasePanel />;
      default:
        return (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            Panel coming soon
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#0a0a0c] text-zinc-300 selection:bg-cyan-500/30">
      {/* Top menu bar */}
      <TopMenu
        workspaceId={workspaceId}
        onSave={handleSave}
        onSaveAll={handleSaveAll}
        onCloseTab={handleCloseTab}
        onToggleSidebar={handleToggleSidebar}
        onToggleTerminal={handleToggleTerminal}
      />

      {/* Main area: activity bar + sidebar + editor */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Background ambient glow */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Activity bar (icons column) */}
        <ActivityBar />

        {/* Sidebar + editor split */}
        <PanelGroup direction="horizontal" className="flex-1 relative">
          {sidebarOpen && (
            <>
              <Panel
                defaultSize={20}
                minSize={12}
                maxSize={40}
                className="bg-white/[0.02] backdrop-blur-md border-r border-white/[0.05]"
              >
                <SideContent />
              </Panel>
              <PanelResizeHandle className="w-[3px] bg-transparent hover:bg-gradient-to-b hover:from-violet-500/50 hover:to-cyan-500/50 active:bg-gradient-to-b active:from-violet-500/80 active:to-cyan-500/80 transition-all duration-300 cursor-col-resize group flex flex-col justify-center items-center">
                <div className="w-[1px] h-8 bg-white/10 group-hover:bg-white/50 rounded-full" />
              </PanelResizeHandle>
            </>
          )}

          {/* Editor + terminal vertical split */}
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
        </PanelGroup>
      </div>

      {/* Status bar */}
      <StatusBar workspaceId={workspaceId} />

      {/* Mobile bottom nav */}
      <MobileTabBar />
    </div>
  );
}