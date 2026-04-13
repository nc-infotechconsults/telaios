// ─── Agent Store ───────────────────────────────────────────────────────────────
//
// Zustand store for the AI Agent plugin.
// Manages sessions, messages, SSE streaming, and per-session metrics.
//
// SSE subscription lifecycle:
//   connect() → health check → load sessions → switchSession(first)
//   switchSession(id) → close old EventSource → open new → load messages
//   sendPrompt() → POST /prompt (202) → SSE events arrive → messages update
//   abort() → POST /abort → isStreaming = false
// ──────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { api } from "@/lib/api";
import type { AgentSession, AgentMessage as RawApiMessage } from "@/lib/api";

// ── Public types ──────────────────────────────────────────────────────────────

export type AgentConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface AgentPart {
  id: string;
  type: "text" | "tool-call" | "tool-result" | "thinking" | "error";
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  /** UI toggle — collapsed by default for tool cards */
  isCollapsed?: boolean;
  /** Duration in ms (populated after tool result arrives) */
  duration?: number;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  parts: AgentPart[];
  timestamp: number;
  tokens?: { input: number; output: number; reasoning: number };
  cost?: number;
}

export interface AgentContext {
  filePath?: string;
  language?: string;
  selectedText?: string;
  instruction?: "explain" | "refactor" | "generate-tests";
}

export interface AgentMetrics {
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number;
  /** Elapsed seconds since the active session was opened */
  sessionDuration: number;
  messagesCount: number;
  toolCallsCount: number;
  filesEdited: string[];
}

const DEFAULT_METRICS: AgentMetrics = {
  tokensIn: 0,
  tokensOut: 0,
  estimatedCost: 0,
  sessionDuration: 0,
  messagesCount: 0,
  toolCallsCount: 0,
  filesEdited: [],
};

// ── Private module-level refs (not serializable → not in Zustand) ─────────────

let _eventSource: EventSource | null = null;
let _sessionStartTime: number = Date.now();

const _partBuffer = new Map<string, import("./agentStore").AgentPart>();
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function _flushPartBuffer() {
  _flushTimer = null;
  if (_partBuffer.size === 0) return;

  const grouped = new Map<string, import("./agentStore").AgentPart[]>();
  for (const [key, part] of _partBuffer.entries()) {
    const msgId = key.split(":")[0];
    let arr = grouped.get(msgId);
    if (!arr) {
      arr = [];
      grouped.set(msgId, arr);
    }
    arr.push(part);
  }
  _partBuffer.clear();

  useAgentStore.setState((s) => {
    let messages = [...s.messages];
    for (const [msgId, parts] of grouped.entries()) {
      const msgIdx = messages.findIndex((m) => m.id === msgId);
      if (msgIdx < 0) {
        messages.push({
          id: msgId,
          role: "assistant",
          parts,
          timestamp: Date.now(),
        });
      } else {
        const msg = messages[msgIdx];
        let nextParts = [...msg.parts];
        for (const part of parts) {
          const pIdx = nextParts.findIndex((p) => p.id === part.id);
          if (pIdx >= 0) nextParts[pIdx] = part;
          else nextParts.push(part);
        }
        messages[msgIdx] = { ...msg, parts: nextParts };
      }
    }
    return { messages, isStreaming: true };
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapPart(raw: RawApiMessage["parts"][number]): AgentPart {
  const { id, type } = raw;

  if (type === "text") {
    return { id, type: "text", content: (raw.text as string) ?? "" };
  }
  if (type === "tool-use" || type === "tool_use") {
    return {
      id,
      type: "tool-call",
      content: (raw.name as string) ?? "unknown",
      toolName: (raw.name as string) ?? "unknown",
      toolArgs: raw.input,
      isCollapsed: true,
    };
  }
  if (type === "tool-result" || type === "tool_result") {
    const rawContent = raw.content;
    const content =
      typeof rawContent === "string"
        ? rawContent
        : JSON.stringify(rawContent ?? "");
    return { id, type: "tool-result", content, isCollapsed: true };
  }
  if (type === "thinking") {
    return { id, type: "thinking", content: (raw.thinking as string) ?? "" };
  }
  // Fallback
  return { id, type: "text", content: JSON.stringify(raw) };
}

function mapApiMessage(raw: RawApiMessage): AgentMessage {
  return {
    id: raw.info.id,
    role: raw.info.role,
    parts: raw.parts.map(mapPart),
    timestamp: raw.info.time.created,
    tokens: raw.info.tokens
      ? {
          input: raw.info.tokens.input,
          output: raw.info.tokens.output,
          reasoning: raw.info.tokens.reasoning,
        }
      : undefined,
    cost: raw.info.cost,
  };
}

function computeMetrics(
  messages: AgentMessage[],
  sessionDuration: number,
): AgentMetrics {
  let tokensIn = 0;
  let tokensOut = 0;
  let estimatedCost = 0;
  let toolCallsCount = 0;
  const filesEdited = new Set<string>();

  for (const msg of messages) {
    if (msg.tokens) {
      tokensIn += msg.tokens.input;
      tokensOut += msg.tokens.output;
    }
    if (msg.cost) estimatedCost += msg.cost;
    for (const part of msg.parts) {
      if (part.type === "tool-call") {
        toolCallsCount++;
        // Track file edits
        const name = part.toolName ?? "";
        if (name === "write_file" || name === "edit_file" || name === "create_file") {
          const args = part.toolArgs as { path?: string } | undefined;
          if (args?.path) filesEdited.add(args.path);
        }
      }
    }
  }

  return {
    tokensIn,
    tokensOut,
    estimatedCost,
    sessionDuration,
    messagesCount: messages.length,
    toolCallsCount,
    filesEdited: Array.from(filesEdited),
  };
}

function startDurationTick() {
  useAgentStore.setState({ streamingStartTime: Date.now() });
}
function stopDurationTick() {
  useAgentStore.setState({ streamingStartTime: null });
}

function closeEventSource() {
  if (_eventSource) {
    _eventSource.close();
    _eventSource = null;
  }
}

function subscribeToSession(sessionId: string) {
  closeEventSource();
  _sessionStartTime = Date.now();
  startDurationTick();

  const es = api.agent.eventSource(sessionId);
  _eventSource = es;

  // ── message.updated — a complete message was updated ────────────────────────
  es.addEventListener("message.updated", (ev: MessageEvent) => {
    try {
      const event = JSON.parse(ev.data as string) as {
        payload?: { properties?: { info?: RawApiMessage["info"]; parts?: RawApiMessage["parts"] } };
      };
      const props = event.payload?.properties;
      if (props?.info && Array.isArray(props.parts)) {
        const mapped = mapApiMessage({ info: props.info, parts: props.parts });
        useAgentStore.getState()._updateMessage(mapped);
      }
    } catch {
      // Ignore malformed events
    }
  });

  // ── message.part.updated — streaming chunk ──────────────────────────────────
  es.addEventListener("message.part.updated", (ev: MessageEvent) => {
    try {
      const event = JSON.parse(ev.data as string) as {
        payload?: {
          properties?: {
            part?: RawApiMessage["parts"][number] & { messageID?: string };
          };
        };
      };
      const part = event.payload?.properties?.part;
      if (!part) return;
      const msgId = (part.messageID as string | undefined) ?? "";
      if (!msgId) return;
      const mapped = mapPart(part);
      useAgentStore.getState()._addOrUpdatePart(msgId, mapped);
    } catch {
      // Ignore malformed events
    }
  });

  // ── session.created — a new session appeared (e.g. spawned subagent) ─────────
  es.addEventListener("session.created", () => {
    api.agent
      .listSessions()
      .then((sessions) => useAgentStore.setState({ sessions }))
      .catch(() => {});
  });

  // ── session.updated — an existing session changed (title, status, etc.) ──────
  es.addEventListener("session.updated", () => {
    api.agent
      .listSessions()
      .then((sessions) => useAgentStore.setState({ sessions }))
      .catch(() => {});
  });

  // ── session.idle — agent finished responding ─────────────────────────────────
  es.addEventListener("session.idle", () => {
    useAgentStore.setState({ isStreaming: false });
    // Refresh messages to get the final accurate state with token counts
    api.agent
      .getMessages(sessionId)
      .then((rawMsgs) => {
        const msgs = rawMsgs.map(mapApiMessage);
        const elapsed = Math.floor((Date.now() - _sessionStartTime) / 1000);
        useAgentStore.setState({
          messages: msgs,
          metrics: computeMetrics(msgs, elapsed),
        });
      })
      .catch(() => {});
  });

  // ── error — stream-level error ───────────────────────────────────────────────
  es.addEventListener("error", (ev: MessageEvent) => {
    if (ev.data) {
      console.error("[agent] SSE error event:", ev.data);
    }
  });

  // ── onerror — connection-level error ─────────────────────────────────────────
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      useAgentStore.setState({ connectionStatus: "error" });
      stopDurationTick();
    }
  };
}

// ── Store interface ───────────────────────────────────────────────────────────

interface AgentState {
  connectionStatus: AgentConnectionStatus;
  sessions: AgentSession[];
  activeSessionId: string | null;
  messages: AgentMessage[];
  isStreaming: boolean;
  streamingStartTime: number | null;
  metrics: AgentMetrics;

  // ── Public actions ──────────────────────────────────────────────────────────
  connect(): Promise<void>;
  createSession(title?: string): Promise<void>;
  switchSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  sendPrompt(text: string, context?: AgentContext): Promise<void>;
  abort(): void;

  // ── Internal helpers (underscore prefix) ────────────────────────────────────
  _updateMessage(msg: AgentMessage): void;
  _addOrUpdatePart(messageId: string, part: AgentPart): void;
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useAgentStore = create<AgentState>()(
  devtools(
    (set, get) => ({
      connectionStatus: "disconnected",
      sessions: [],
      activeSessionId: null,
      messages: [],
      isStreaming: false,
      metrics: DEFAULT_METRICS,

      // ── connect ─────────────────────────────────────────────────────────────
      async connect() {
        set({ connectionStatus: "connecting" });
        try {
          const health = await api.agent.health();
          if (health.status !== "connected") {
            set({ connectionStatus: "disconnected" });
            return;
          }
          const sessions = await api.agent.listSessions();
          set({ connectionStatus: "connected", sessions });
          // Auto-switch to the most recently active session
          if (sessions.length > 0) {
            const newest = sessions.reduce((a, b) =>
              b.time.updated > a.time.updated ? b : a,
            );
            await get().switchSession(newest.id);
          }
        } catch {
          set({ connectionStatus: "error" });
        }
      },

      // ── createSession ────────────────────────────────────────────────────────
      async createSession(title) {
        try {
          const session = await api.agent.createSession(title);
          set((s) => ({ sessions: [...s.sessions, session] }));
          await get().switchSession(session.id);
        } catch (err) {
          console.error("[agent] createSession failed:", err);
        }
      },

      // ── switchSession ────────────────────────────────────────────────────────
      async switchSession(id) {
        set({
          activeSessionId: id,
          messages: [],
          isStreaming: false,
          metrics: DEFAULT_METRICS,
        });
        try {
          const rawMsgs = await api.agent.getMessages(id);
          const msgs = rawMsgs.map(mapApiMessage);
          const elapsed = Math.floor((Date.now() - _sessionStartTime) / 1000);
          set({ messages: msgs, metrics: computeMetrics(msgs, elapsed) });
        } catch {
          // Messages load failure is non-fatal — SSE stream still opens
        }
        subscribeToSession(id);
      },

      // ── deleteSession ────────────────────────────────────────────────────────
      async deleteSession(id) {
        try {
          await api.agent.deleteSession(id);
          const { sessions, activeSessionId } = get();
          const remaining = sessions.filter((s) => s.id !== id);
          set({ sessions: remaining });
          if (activeSessionId === id) {
            if (remaining.length > 0) {
              await get().switchSession(remaining[remaining.length - 1].id);
            } else {
              closeEventSource();
              stopDurationTick();
              set({
                activeSessionId: null,
                messages: [],
                isStreaming: false,
                metrics: DEFAULT_METRICS,
              });
            }
          }
        } catch (err) {
          console.error("[agent] deleteSession failed:", err);
        }
      },

      // ── sendPrompt ───────────────────────────────────────────────────────────
      async sendPrompt(text, context) {
        const { activeSessionId } = get();
        if (!activeSessionId) return;

        let promptText = text;
        if (context?.selectedText) {
          const lang = context.language ?? "";
          const header = context.instruction
            ? `[${context.instruction}] `
            : "";
          const filePath = context.filePath ? `\`${context.filePath}\`\n` : "";
          promptText =
            `${header}${filePath}\`\`\`${lang}\n${context.selectedText}\n\`\`\`\n\n${text}`.trim();
        }

        set({ isStreaming: true });
        try {
          await api.agent.prompt(activeSessionId, [
            { type: "text", text: promptText },
          ]);
        } catch (err) {
          console.error("[agent] sendPrompt failed:", err);
          set({ isStreaming: false });
        }
      },

      // ── abort ────────────────────────────────────────────────────────────────
      abort() {
        const { activeSessionId } = get();
        if (!activeSessionId) return;
        set({ isStreaming: false });
        api.agent.abort(activeSessionId).catch(() => {});
      },

      // ── _updateMessage ───────────────────────────────────────────────────────
      _updateMessage(msg) {
        set((s) => {
          const idx = s.messages.findIndex((m) => m.id === msg.id);
          const next =
            idx >= 0
              ? s.messages.map((m, i) => (i === idx ? msg : m))
              : [...s.messages, msg];
          return { messages: next };
        });
      },

      // ── _addOrUpdatePart ─────────────────────────────────────────────────────
      _addOrUpdatePart(messageId, part) {
        _partBuffer.set(`${messageId}:${part.id}`, part);
        if (!_flushTimer) _flushTimer = setTimeout(_flushPartBuffer, 80);
      },
    }),
    { name: "AgentStore" },
  ),
);
