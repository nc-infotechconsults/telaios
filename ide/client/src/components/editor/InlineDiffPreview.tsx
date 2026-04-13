// ─── Inline Diff Preview ──────────────────────────────────────────────────────
//
// Compact Monaco-based diff viewer embedded inside ToolCallCard.
// Shows before/after for agent file edits with Accept / Reject / Copy controls.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { Check, X, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { api } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InlineDiffPreviewProps {
  /** File path relative to workspace root */
  filePath: string;
  /** Original file content (before edit) */
  before: string;
  /** New file content (after edit) */
  after: string;
  /** Language ID for syntax highlighting */
  language?: string;
}

type DiffStatus = "pending" | "accepted" | "rejected";

const STATUS_BORDER: Record<DiffStatus, string> = {
  pending: "border-emerald-500/25",
  accepted: "border-emerald-500/40",
  rejected: "border-zinc-600/30",
};

const STATUS_BG: Record<DiffStatus, string> = {
  pending: "bg-emerald-500/5",
  accepted: "bg-emerald-500/10",
  rejected: "bg-zinc-800/30",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function InlineDiffPreview({
  filePath,
  before,
  after,
  language,
}: InlineDiffPreviewProps) {
  const [status, setStatus] = useState<DiffStatus>("pending");
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState(false);

  // ── Accept: write file, refresh editor buffer ────────────────────────────
  const handleAccept = useCallback(async () => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspace?.id;
    if (!workspaceId) return;

    setBusy(true);
    try {
      await api.workspaces.writeFile(workspaceId, filePath, after);

      // If the file is open in the editor, update its buffer & clear dirty flag
      const { tabs } = useEditorStore.getState();
      const tab = tabs.find((t) => t.path === filePath);
      if (tab) {
        useEditorStore.getState().updateTabContent(tab.id, after);
        useEditorStore.getState().markTabSaved(tab.id);
      }

      setStatus("accepted");
    } catch (err) {
      console.error("[InlineDiffPreview] Accept failed:", err);
    } finally {
      setBusy(false);
    }
  }, [filePath, after]);

  // ── Reject: dismiss ──────────────────────────────────────────────────────
  const handleReject = useCallback(() => {
    setStatus("rejected");
    setExpanded(false);
  }, []);

  // ── Copy new content ─────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(after);
    } catch {
      // Fallback: no clipboard API
    }
  }, [after]);

  const fileName = filePath.split("/").pop() ?? filePath;
  const isPending = status === "pending";

  return (
    <div
      className={`rounded-lg border ${STATUS_BORDER[status]} ${STATUS_BG[status]} overflow-hidden transition-colors`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.05]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>

        <span className="text-[11px] text-zinc-300 font-mono truncate flex-1">
          {fileName}
        </span>

        {status === "accepted" && (
          <span className="text-[10px] text-emerald-400 font-medium">
            Accepted
          </span>
        )}
        {status === "rejected" && (
          <span className="text-[10px] text-zinc-500 font-medium">
            Rejected
          </span>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Copy new content"
          >
            <Copy size={11} />
          </button>
          {isPending && (
            <>
              <button
                type="button"
                onClick={handleAccept}
                disabled={busy}
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 transition-colors disabled:opacity-50"
                title="Accept change"
              >
                <Check size={11} className="inline -mt-0.5 mr-0.5" />
                Accept
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-700/30 text-zinc-400 hover:bg-zinc-700/50 transition-colors"
                title="Reject change"
              >
                <X size={11} className="inline -mt-0.5 mr-0.5" />
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      {/* Diff viewer */}
      {expanded && (
        <div className="h-[200px] min-h-[120px]">
          <DiffEditor
            original={before}
            modified={after}
            language={language}
            theme="glassmorphism-dark"
            options={{
              fontSize: 11,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              lineHeight: 16,
              readOnly: true,
              renderSideBySide: false,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              minimap: { enabled: false },
              lineNumbers: "on",
              glyphMargin: false,
              folding: false,
              padding: { top: 4, bottom: 4 },
              scrollbar: {
                vertical: "auto",
                horizontal: "auto",
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
            }}
          />
        </div>
      )}
    </div>
  );
}
