// ─── Agent Session List ───────────────────────────────────────────────────────
//
// Two-row session navigator:
//   Row 1 — top-level sessions (no parentID) + [+ New] button
//   Row 2 — child sessions of the active parent (shown only when they exist)
//
// When viewing a child session the parent tab stays highlighted.
// Right-click on any tab to delete.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useCallback } from "react";
import { Plus, Trash2, Bot, GitBranch } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentSession } from "@/lib/api";
import { useAgentStore } from "./agentStore";

interface ContextMenuState {
  x: number;
  y: number;
  sessionId: string;
}

// ── Session label ──────────────────────────────────────────────────────────────

function sessionLabel(s: AgentSession, idx: number): string {
  return s.title?.trim() || `Session ${idx + 1}`;
}

// ── Single tab button ─────────────────────────────────────────────────────────

const SessionTab = React.memo(function SessionTab({
  session,
  label,
  isActive,
  isParentOfActive,
  onSwitch,
  onContextMenu,
}: {
  session: AgentSession;
  label: string;
  isActive: boolean;
  isParentOfActive: boolean;
  onSwitch: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}) {
  const highlighted = isActive || isParentOfActive;

  return (
    <button
      onClick={() => onSwitch(session.id)}
      onContextMenu={(e) => onContextMenu(e, session.id)}
      title={label}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0
        border-b-2 transition-colors max-w-[120px]
        ${
          isActive
            ? "border-violet-500 text-violet-300 bg-violet-500/5"
            : isParentOfActive
              ? "border-violet-500/40 text-zinc-400 bg-violet-500/[0.03]"
              : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
        }
      `}
    >
      {highlighted && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
            isActive ? "bg-violet-400" : "bg-violet-600"
          }`}
        />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export function AgentSessionList() {
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const onSwitch = useAgentStore((s) => s.switchSession);
  const onCreate = useAgentStore((s) => s.createSession);
  const onDelete = useAgentStore((s) => s.deleteSession);

  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  // ── Derived hierarchy ──────────────────────────────────────────────────────
  const topLevel = useMemo(
    () => sessions.filter((s) => !s.parentID),
    [sessions],
  );

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  // The "active parent" is:
  //  – the active session itself, if it has children
  //  – its parent, if the active session IS a child
  const activeParentId = useMemo<string | null>(() => {
    if (!activeSession) return null;
    if (activeSession.parentID) return activeSession.parentID;
    const hasChildren = sessions.some((s) => s.parentID === activeSession.id);
    return hasChildren ? activeSession.id : null;
  }, [activeSession, sessions]);

  const childSessions = useMemo(
    () => (activeParentId ? sessions.filter((s) => s.parentID === activeParentId) : []),
    [sessions, activeParentId],
  );

  // ── Context menu ───────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, sessionId: id });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setMenu(null);
    onDelete(id);
  }, [onDelete]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (sessions.length === 0) {
    return (
      <div className="flex items-center border-b border-white/[0.05] px-2 py-1.5 gap-1.5">
        <Bot size={12} className="text-zinc-600" />
        <span className="text-[11px] text-zinc-600 flex-1">No sessions</span>
        <button
          onClick={() => onCreate()}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-violet-400 hover:bg-violet-500/10 transition-colors"
          title="New session"
        >
          <Plus size={12} />
          New
        </button>
      </div>
    );
  }

  return (
    <>
      {/* ── Row 1: top-level sessions ─────────────────────────────────────── */}
      <div className="flex items-center border-b border-white/[0.05] overflow-x-auto scrollbar-none">
        {topLevel.map((session, idx) => {
          const isActive = session.id === activeSessionId;
          const isParentOfActive =
            activeSession?.parentID === session.id && !isActive;

          return (
            <SessionTab
              key={session.id}
              session={session}
              label={sessionLabel(session, idx)}
              isActive={isActive}
              isParentOfActive={isParentOfActive}
              onSwitch={onSwitch}
              onContextMenu={handleContextMenu}
            />
          );
        })}

        <button
          onClick={() => onCreate()}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-zinc-600 hover:text-violet-400 hover:bg-white/[0.02] transition-colors shrink-0 ml-auto"
          title="New session (Ctrl+Shift+A)"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* ── Row 2: sub-sessions (agent-spawned children) ─────────────────── */}
      <AnimatePresence initial={false}>
        {childSessions.length > 0 && (
          <motion.div
            key="child-row"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center border-b border-white/[0.04] overflow-x-auto scrollbar-none bg-white/[0.015] overflow-hidden"
          >
            {/* Sub-agent indicator */}
            <div className="flex items-center gap-1 px-2 shrink-0 text-zinc-700">
              <GitBranch size={9} />
              <span className="text-[9px]">sub</span>
            </div>

            {childSessions.map((session, idx) => {
              const isActive = session.id === activeSessionId;
              return (
                <SessionTab
                  key={session.id}
                  session={session}
                  label={sessionLabel(session, idx)}
                  isActive={isActive}
                  isParentOfActive={false}
                  onSwitch={onSwitch}
                  onContextMenu={handleContextMenu}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Context menu ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{ top: menu.y, left: menu.x }}
              className="fixed z-50 min-w-[140px] py-1 bg-zinc-900 border border-white/10 rounded-lg shadow-xl text-xs"
            >
              <button
                onClick={() => handleDelete(menu.sessionId)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={12} />
                Delete session
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
