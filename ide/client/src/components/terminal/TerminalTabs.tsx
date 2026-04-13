// ─── Terminal Tabs ────────────────────────────────────────────────────────────
//
// Horizontal tab bar for managing multiple terminal sessions.
// Supports: new tab, close tab, rename (double-click), switch active.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from "react";
import { useTerminalStore } from "@/stores/terminalStore";
import {
  Plus,
  X,
  Terminal as TerminalIcon,
} from "lucide-react";

interface Props {
  workspaceId: string;
}

export function TerminalTabs({ workspaceId }: Props) {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const createSession = useTerminalStore((s) => s.createSession);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);
  const renameSession = useTerminalStore((s) => s.renameSession);

  // ── Rename state ──────────────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }, [renamingId, renameValue, renameSession]);

  const handleDoubleClick = useCallback(
    (id: string, currentLabel: string) => {
      setRenamingId(id);
      setRenameValue(currentLabel);
    },
    [],
  );

  const handleNewTab = useCallback(() => {
    createSession(workspaceId);
  }, [createSession, workspaceId]);

  const handleClose = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      closeSession(id);
    },
    [closeSession],
  );

  return (
    <div className="flex items-center h-8 bg-white/[0.02] border-b border-white/[0.06] overflow-x-auto shrink-0">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        return (
          <div
            key={session.id}
            onClick={() => setActiveSession(session.id)}
            onDoubleClick={() => handleDoubleClick(session.id, session.label)}
            className={`
              flex items-center gap-1.5 px-3 h-full cursor-pointer
              border-r border-white/[0.04] select-none
              transition-colors min-w-0 max-w-[160px]
              ${
                isActive
                  ? "bg-white/[0.06] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
              }
            `}
            role="tab"
            aria-selected={isActive}
          >
            <TerminalIcon size={12} className="shrink-0" />

            {renamingId === session.id ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenamingId(null);
                }}
                className="flex-1 min-w-0 bg-transparent text-xs text-zinc-100 outline-none border-b border-violet-500/50"
              />
            ) : (
              <span className="text-xs truncate flex-1">
                {session.label}
              </span>
            )}

            <button
              type="button"
              onClick={(e) => handleClose(e, session.id)}
              className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/[0.08] transition-all text-zinc-500 hover:text-zinc-300"
              style={{ opacity: isActive ? 0.7 : undefined }}
              title="Close terminal"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}

      {/* New terminal button */}
      <button
        type="button"
        onClick={handleNewTab}
        className="flex items-center justify-center w-8 h-full text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors shrink-0"
        title="New Terminal"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
