import { useEffect, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
import { GitBranch, Terminal } from "lucide-react";

interface Props {
  workspaceId: string;
}

export function StatusBar({ workspaceId }: Props) {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const setTerminalOpen = useEditorStore((s) => s.setTerminalOpen);

  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const [branch, setBranch] = useState<string>("");
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    api.git.status(workspaceId).then((s) => setBranch(s.branch)).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    const unsub = ws.onStatus(setWsConnected);
    return unsub;
  }, []);

  return (
    <div className="flex items-center justify-between px-3 h-7 bg-white/[0.03] backdrop-blur-md border-t border-white/[0.05] text-xs text-zinc-400 shrink-0 select-none z-10">
      {/* Left */}
      <div className="flex items-center gap-4">
        {/* WS indicator */}
        <span className="relative flex h-2 w-2">
          {wsConnected && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${wsConnected ? "bg-gradient-to-r from-emerald-400 to-cyan-400" : "bg-red-500"}`}
            title={wsConnected ? "Connected" : "Disconnected"}
          />
        </span>
        {branch && (
          <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
            <GitBranch size={12} className="text-violet-400" />
            {branch}
          </span>
        )}
        {activeWorkspace && (
          <span className="text-zinc-500">{activeWorkspace.name}</span>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        {activeTab && (
          <>
            {activeTab.cursorLine != null && (
              <span>
                Ln {activeTab.cursorLine}, Col {activeTab.cursorColumn}
              </span>
            )}
            <span>{activeTab.language}</span>
          </>
        )}
        <button
          onClick={() => setTerminalOpen(true)}
          className="flex items-center gap-1.5 hover:text-white transition-colors group"
          title="Open terminal"
        >
          <Terminal size={14} className="text-cyan-400 group-hover:text-cyan-300 transition-colors" />
          <span>Terminal</span>
        </button>
      </div>
    </div>
  );
}