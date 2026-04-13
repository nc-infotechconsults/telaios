// ─── Terminal Session Store ───────────────────────────────────────────────────
//
// Manages multiple terminal sessions (tabs) within the terminal panel.
// Each session corresponds to an independent PTY/WebSocket connection.
// ──────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import type { TerminalSession } from "@/types";

// ─── State ────────────────────────────────────────────────────────────────────

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  nextIndex: number;

  /** Create a new terminal session. Returns its id. */
  createSession(workspaceId: string, label?: string): string;
  /** Close and remove a session by id. */
  closeSession(id: string): void;
  /** Activate a session by id. */
  setActiveSession(id: string): void;
  /** Rename a session. */
  renameSession(id: string, label: string): void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  nextIndex: 1,

  createSession(workspaceId: string, label?: string): string {
    const idx = get().nextIndex;
    const session: TerminalSession = {
      id: `term-${Date.now()}-${idx}`,
      workspaceId,
      label: label ?? `Terminal ${idx}`,
      cols: 220,
      rows: 50,
      createdAt: Date.now(),
    };
    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionId: session.id,
      nextIndex: s.nextIndex + 1,
    }));
    return session.id;
  },

  closeSession(id: string): void {
    set((s) => {
      const remaining = s.sessions.filter((ss) => ss.id !== id);
      let nextActive = s.activeSessionId;
      if (s.activeSessionId === id) {
        // Activate the previous session, or the next one, or null
        const closedIdx = s.sessions.findIndex((ss) => ss.id === id);
        if (remaining.length === 0) {
          nextActive = null;
        } else if (closedIdx >= remaining.length) {
          nextActive = remaining[remaining.length - 1].id;
        } else {
          nextActive = remaining[closedIdx].id;
        }
      }
      return { sessions: remaining, activeSessionId: nextActive };
    });
  },

  setActiveSession(id: string): void {
    set({ activeSessionId: id });
  },

  renameSession(id: string, label: string): void {
    set((s) => ({
      sessions: s.sessions.map((ss) =>
        ss.id === id ? { ...ss, label } : ss,
      ),
    }));
  },
}));
