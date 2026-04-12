import { useEffect, useState, useCallback } from "react";
import { FileTree } from "./FileTree";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
import type { WsMessage } from "@/types";
import { RefreshCw } from "lucide-react";

interface Props {
  workspaceId: string;
}

interface DirEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

export function FileExplorer({ workspaceId }: Props) {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const [tree, setTree] = useState<DirEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const entries = await api.workspaces.listDir(workspaceId, ".");
      setTree(entries);
    } catch {
      // workspace may not be ready yet
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh on file-change WebSocket events
  useEffect(() => {
    const unsub = ws.onMessage((msg: WsMessage) => {
      if (
        msg.type === "file:created" ||
        msg.type === "file:deleted" ||
        msg.type === "file:renamed"
      ) {
        refresh();
      }
    });
    return unsub;
  }, [refresh]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-transparent">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-white/[0.01] backdrop-blur-md border-b border-white/[0.05] shrink-0 z-10">
        <span className="drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">{activeWorkspace?.name ?? "Explorer"}</span>
        <button
          onClick={refresh}
          title="Refresh"
          className={`hover:text-cyan-400 transition-colors ${isLoading ? "animate-spin text-cyan-500" : ""}`}
        >
          <RefreshCw size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto pt-2 scrollbar-hide">
        {isLoading && tree.length === 0 ? (
          <div className="px-4 py-4 text-xs text-zinc-500 flex items-center gap-2">
            <RefreshCw size={12} className="animate-spin" /> Loading…
          </div>
        ) : (
          <FileTree
            workspaceId={workspaceId}
            entries={tree}
            depth={0}
          />
        )}
      </div>
    </div>
  );
}