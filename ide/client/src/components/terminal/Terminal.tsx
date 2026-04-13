// ─── Terminal ─────────────────────────────────────────────────────────────────
//
// Renders xterm.js instances for terminal sessions.  Supports multiple sessions
// by keeping each xterm alive in a hidden div and toggling visibility when the
// active session changes.  Each session opens its own WebSocket to the server.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { consumePendingCommand } from "@/stores/runConfigStore";
import "@xterm/xterm/css/xterm.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  workspaceId: string;
  /** Currently active session id.  When `null` nothing is displayed. */
  activeSessionId: string | null;
  /** All session ids that should have a live xterm instance. */
  sessionIds: string[];
}

interface SessionEntry {
  term: XTerm;
  fit: FitAddon;
  ws: WebSocket;
  container: HTMLDivElement;
  ro: ResizeObserver;
}

// ─── Shared xterm theme ───────────────────────────────────────────────────────

const XTERM_THEME = {
  background: "#0d0d0f",
  foreground: "#e4e4e7",
  cursor: "#a1a1aa",
  black: "#18181b",
  brightBlack: "#3f3f46",
  white: "#e4e4e7",
  brightWhite: "#f4f4f5",
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function Terminal({ workspaceId, activeSessionId, sessionIds }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Map of session id → live xterm + ws + dom + observers
  const sessionsRef = useRef<Map<string, SessionEntry>>(new Map());

  // ── Create a session entry ────────────────────────────────────────────────

  const createSessionEntry = useCallback(
    (sessionId: string): SessionEntry | null => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return null;

      // Container div for this session's xterm
      const container = document.createElement("div");
      container.className = "absolute inset-0 p-1 overflow-hidden";
      container.style.display = "none"; // hidden until activated
      wrapper.appendChild(container);

      const term = new XTerm({
        theme: XTERM_THEME,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
      });

      const fit = new FitAddon();
      const links = new WebLinksAddon();
      term.loadAddon(fit);
      term.loadAddon(links);
      term.open(container);
      fit.fit();

      // WebSocket
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const { cols, rows } = term;
      const ws = new WebSocket(
        `${protocol}://${location.host}/ws/${workspaceId}/terminal?cols=${cols}&rows=${rows}`,
      );
      ws.binaryType = "arraybuffer";

      // When the WebSocket opens, check for a pending run-config command
      ws.onopen = () => {
        const pendingCmd = consumePendingCommand(sessionId);
        if (pendingCmd) {
          // Small delay to let the shell prompt appear first
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "terminal:data", payload: { data: pendingCmd } }));
            }
          }, 300);
        }
      };

      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(e.data));
        } else {
          term.write(e.data as string);
        }
      };

      ws.onerror = () => {
        term.write(
          "\r\n\x1b[31mTerminal connection error. Is the container running?\x1b[0m\r\n",
        );
      };

      ws.onclose = (ev) => {
        if (ev.code !== 1000) {
          term.write("\r\n\x1b[33mTerminal disconnected.\x1b[0m\r\n");
        }
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "terminal:data", payload: { data } }));
        }
      });

      // Resize observer
      const ro = new ResizeObserver(() => {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          const { cols: c, rows: r } = term;
          ws.send(
            JSON.stringify({
              type: "terminal:resize",
              payload: { cols: c, rows: r },
            }),
          );
        }
      });
      ro.observe(container);

      return { term, fit, ws, container, ro };
    },
    [workspaceId],
  );

  // ── Destroy a session entry ───────────────────────────────────────────────

  const destroySessionEntry = useCallback((entry: SessionEntry) => {
    entry.ro.disconnect();
    entry.ws.close();
    entry.term.dispose();
    entry.container.remove();
  }, []);

  // ── Sync session entries with sessionIds ──────────────────────────────────

  useEffect(() => {
    const map = sessionsRef.current;
    const activeSet = new Set(sessionIds);

    // Create entries for new sessions
    for (const id of sessionIds) {
      if (!map.has(id)) {
        const entry = createSessionEntry(id);
        if (entry) map.set(id, entry);
      }
    }

    // Destroy entries for removed sessions
    for (const [id, entry] of map) {
      if (!activeSet.has(id)) {
        destroySessionEntry(entry);
        map.delete(id);
      }
    }
  }, [sessionIds, createSessionEntry, destroySessionEntry]);

  // ── Toggle visibility based on activeSessionId ────────────────────────────

  useEffect(() => {
    const map = sessionsRef.current;
    for (const [id, entry] of map) {
      if (id === activeSessionId) {
        entry.container.style.display = "";
        // Re-fit after making visible so xterm recalculates dimensions
        requestAnimationFrame(() => entry.fit.fit());
      } else {
        entry.container.style.display = "none";
      }
    }
  }, [activeSessionId]);

  // ── Cleanup all on unmount ────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      const map = sessionsRef.current;
      for (const entry of map.values()) {
        destroySessionEntry(entry);
      }
      map.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0f]">
      <div ref={wrapperRef} className="flex-1 relative overflow-hidden" />
    </div>
  );
}
