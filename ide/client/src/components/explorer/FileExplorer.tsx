import { useEffect, useRef, useCallback } from "react";
import { FileTree, type FileTreeHandle } from "./FileTree";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useEditorStore } from "@/stores/editorStore";
import { ws } from "@/lib/ws";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { WsMessage } from "@/types";
import { RefreshCw, FilePlus, FolderPlus } from "lucide-react";

interface Props {
  workspaceId: string;
}

export function FileExplorer({ workspaceId }: Props) {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  // Only subscribe to the pieces we render in this component
  const isRootLoading  = useFileTreeStore((s) => s.loading["."]) ?? false;
  const hasCachedRoot  = useFileTreeStore((s) => s.dirCache["."] !== undefined);
  const pendingDelete  = useFileTreeStore((s) => s.pendingDelete);

  const fileTreeRef = useRef<FileTreeHandle>(null);

  // ── Mount / workspaceId change ──────────────────────────────────────────────

  useEffect(() => {
    const { reset, loadDir } = useFileTreeStore.getState();
    reset();
    loadDir(workspaceId, ".");
  }, [workspaceId]);

  // ── WebSocket events ────────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = ws.onMessage((msg: WsMessage) => {
      if (
        msg.type === "file:created" ||
        msg.type === "file:deleted" ||
        msg.type === "file:renamed"
      ) {
        useFileTreeStore.getState().handleWsEvent(workspaceId, msg);
      }
    });
    return unsub;
  }, [workspaceId]);

  // ── Reveal active file in explorer ──────────────────────────────────────────
  // When the user opens a file from search or any other entrypoint, auto-expand
  // the tree to that file and scroll Virtuoso to its row.

  const activeTabId = useEditorStore((s) => s.activeTabId);

  useEffect(() => {
    if (!activeTabId || activeTabId.startsWith("db://")) return;
    const tab = useEditorStore.getState().tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    useFileTreeStore.getState().expandToPath(workspaceId, tab.path).then(() => {
      fileTreeRef.current?.scrollToPath(tab.path);
    });
  }, [activeTabId, workspaceId]);

  // ── Toolbar actions ─────────────────────────────────────────────────────────

  const handleNewFile = useCallback(() => {
    useFileTreeStore.getState().startCreate(".", "file");
  }, []);

  const handleNewFolder = useCallback(() => {
    useFileTreeStore.getState().startCreate(".", "folder");
  }, []);

  const handleRefresh = useCallback(() => {
    useFileTreeStore.getState().refreshDir(workspaceId, ".");
  }, [workspaceId]);

  // ── Delete dialog helpers ───────────────────────────────────────────────────

  const pendingDeleteName = pendingDelete?.split("/").pop() ?? "";

  const handleConfirmDelete = useCallback(() => {
    useFileTreeStore.getState().confirmDelete(workspaceId);
  }, [workspaceId]);

  const handleCancelDelete = useCallback(() => {
    useFileTreeStore.getState().cancelDelete();
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-transparent">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-white/[0.01] backdrop-blur-md border-b border-white/[0.05] shrink-0 z-10">
        <span className="drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">
          {activeWorkspace?.name ?? "Explorer"}
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={handleNewFile}
            title="New File"
            className="p-1 hover:text-cyan-400 hover:bg-white/[0.04] rounded transition-colors"
          >
            <FilePlus size={14} strokeWidth={2} />
          </button>

          <button
            onClick={handleNewFolder}
            title="New Folder"
            className="p-1 hover:text-cyan-400 hover:bg-white/[0.04] rounded transition-colors"
          >
            <FolderPlus size={14} strokeWidth={2} />
          </button>

          <button
            onClick={handleRefresh}
            title="Refresh"
            className={`p-1 hover:text-cyan-400 hover:bg-white/[0.04] rounded transition-colors ${
              isRootLoading ? "animate-spin text-cyan-500" : ""
            }`}
          >
            <RefreshCw size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Tree — flex-1 + min-h-0 gives Virtuoso a measurable height to fill */}
      <div className="flex-1 min-h-0">
        {isRootLoading && !hasCachedRoot ? (
          <div className="px-4 py-4 text-xs text-zinc-500 flex items-center gap-2">
            <RefreshCw size={12} className="animate-spin" /> Loading…
          </div>
        ) : (
          <FileTree ref={fileTreeRef} workspaceId={workspaceId} />
        )}
      </div>

      {/* Single delete confirmation dialog — rendered once at the explorer level */}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete Entry"
        message={`Are you sure you want to delete "${pendingDeleteName}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}
