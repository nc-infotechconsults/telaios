import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { getConversationHistory, sendConversationMessage } from "../../lib/api";
import type { ConversationMessage } from "../../types";

const SESSION_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours between messages = new session

interface Session {
  id: string;
  title: string;
  time: string;
  specs: SpecialistKey[];
  startIndex: number;
  endIndex: number;
}

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

type SpecialistKey = "qa" | "explorer" | "reverse" | "planner" | "coder" | "designer" | "reviewer";

interface Specialist {
  name: string;
  color: string;
  icon: string;
  tagline: string;
}

const SPECIALISTS: Record<SpecialistKey, Specialist> = {
  qa:       { name: "Q&A",      color: "#0a84ff", icon: "fa-circle-question",  tagline: "Grounded answers from indexed sources" },
  explorer: { name: "Explorer", color: "#64d2ff", icon: "fa-magnifying-glass", tagline: "Find code, files, and patterns" },
  reverse:  { name: "Reverse",  color: "#bf5af2", icon: "fa-diagram-project",  tagline: "Trace and map system flows" },
  planner:  { name: "Planner",  color: "#30d158", icon: "fa-sitemap",          tagline: "Cross-repo implementation plans" },
  coder:    { name: "Coder",    color: "#5e5ce6", icon: "fa-code",             tagline: "Implement, refactor, and fix" },
  designer: { name: "Designer", color: "#ff9f0a", icon: "fa-pen-ruler",        tagline: "Design UIs from your brand kit" },
  reviewer: { name: "Reviewer", color: "#ff375f", icon: "fa-code-pull-request", tagline: "Review PRs and audit code" },
};

interface UIMessage {
  id: string;
  sender_type: "user" | "agent";
  specialist: SpecialistKey | null;
  content: string;
  created_at: string;
  streaming?: boolean;
}

export default function ProjectConversation({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [activeSpecialist, setActiveSpecialist] = useState<SpecialistKey | null>(null);
  const [forcedSpecialist, setForcedSpecialist] = useState<SpecialistKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamBufferRef = useRef("");

  // Group messages into sessions by time gap
  const sessions = useMemo<Session[]>(() => {
    if (messages.length === 0) return [];
    const result: Session[] = [];
    let sessionStart = 0;
    for (let i = 1; i <= messages.length; i++) {
      const isLast = i === messages.length;
      const bigGap = !isLast && (
        new Date(messages[i].created_at).getTime() - new Date(messages[i - 1].created_at).getTime() > SESSION_GAP_MS
      );
      if (bigGap || isLast) {
        const slice = messages.slice(sessionStart, isLast ? i : i);
        const firstMsg = slice.find((m) => m.sender_type === "user");
        const specs = [...new Set(slice.filter((m) => m.specialist).map((m) => m.specialist as SpecialistKey))];
        const ts = new Date(slice[0].created_at);
        const now = Date.now();
        const diffMs = now - ts.getTime();
        const timeLabel = diffMs < 60_000 ? "just now"
          : diffMs < 3_600_000 ? `${Math.round(diffMs / 60_000)}m ago`
          : diffMs < 86_400_000 ? `${Math.round(diffMs / 3_600_000)}h ago`
          : ts.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        result.push({
          id: `session-${sessionStart}`,
          title: firstMsg?.content.slice(0, 50) ?? "Conversation",
          time: timeLabel,
          specs,
          startIndex: sessionStart,
          endIndex: isLast ? i : i,
        });
        sessionStart = i;
      }
    }
    return result;
  }, [messages]);

  // Load history on mount
  useEffect(() => {
    if (DEMO) { setLoading(false); return; }
    getConversationHistory(projectId, { limit: 200 })
      .then(({ messages: msgs }) => {
        const mapped = msgs.map((m) => ({
          id: m.id,
          sender_type: m.sender_type as "user" | "agent",
          specialist: m.specialist as SpecialistKey | null,
          content: m.content,
          created_at: m.created_at,
        }));
        setMessages(mapped);
        // Auto-select the most recent session (last one)
        setActiveSessionId(null); // will be set to latest after sessions derive
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // SSE connection
  useEffect(() => {
    if (DEMO) return;
    const token = localStorage.getItem("swe_auth_token") ?? "";
    const url = `/api/projects/${projectId}/conversation/stream`;
    const es = new EventSource(url + (token ? `?token=${token}` : ""));
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>;
        handleSSEEvent(data);
      } catch { /* ignore malformed events */ }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleSSEEvent = useCallback((data: Record<string, unknown>) => {
    switch (data.type) {
      case "message": {
        const msg = data.message as ConversationMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, {
            id: msg.id,
            sender_type: msg.sender_type as "user" | "agent",
            specialist: msg.specialist as SpecialistKey | null,
            content: msg.content,
            created_at: msg.created_at,
          }];
        });
        if (msg.sender_type === "agent") {
          setStreamingContent("");
          streamBufferRef.current = "";
          setSending(false);
        }
        break;
      }
      case "agent_start":
        setActiveSpecialist((data.specialist as SpecialistKey) ?? null);
        streamBufferRef.current = "";
        setStreamingContent("");
        break;
      case "token":
        streamBufferRef.current += (data.token as string) ?? "";
        setStreamingContent(streamBufferRef.current);
        break;
      case "agent_end":
        setActiveSpecialist(null);
        break;
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    try {
      await sendConversationMessage(projectId, text, forcedSpecialist ?? undefined);
    } catch {
      setSending(false);
    }
  };

  // Visible messages: the active session slice, or all if "new"
  const activeSession = activeSessionId === "new" ? null : (sessions.find((s) => s.id === activeSessionId) ?? sessions[sessions.length - 1] ?? null);
  const visibleMessages = activeSession ? messages.slice(activeSession.startIndex, activeSession.endIndex) : [];

  const specialist = activeSpecialist ? SPECIALISTS[activeSpecialist] : null;

  const isNewSession = activeSessionId === "new" || (sessions.length === 0 && !loading);

  return (
    <div style={{ display: "flex", height: "100%", padding: 0 }}>
      {/* Sessions panel */}
      <div style={{
        width: 220,
        flexShrink: 0,
        borderRight: "0.5px solid var(--hairline)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}>
        <div style={{ padding: "12px 14px 8px", borderBottom: "0.5px solid var(--hairline)", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Sessions
          </div>
          <button
            onClick={() => setActiveSessionId("new")}
            style={{
              width: "100%",
              padding: "6px 10px",
              borderRadius: 8,
              border: "0.5px solid var(--hairline)",
              background: isNewSession ? "var(--fill-secondary)" : "none",
              color: isNewSession ? "var(--label-primary)" : "var(--label-secondary)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>+</span> New session
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
          {loading ? (
            <div style={{ color: "var(--label-quaternary)", fontSize: 12, textAlign: "center", marginTop: 16 }}>Loading…</div>
          ) : sessions.length === 0 ? (
            <div style={{ color: "var(--label-quaternary)", fontSize: 12, textAlign: "center", marginTop: 16, padding: "0 8px" }}>No sessions yet</div>
          ) : (
            [...sessions].reverse().map((s) => {
              const isActive = activeSession?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSessionId(s.id)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "none",
                    background: isActive ? "var(--fill-secondary)" : "none",
                    cursor: "pointer",
                    textAlign: "left",
                    marginBottom: 2,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--label-primary)", lineHeight: 1.4, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, color: "var(--label-quaternary)" }}>{s.time}</span>
                    {s.specs.slice(0, 3).map((sp) => {
                      const spec = SPECIALISTS[sp];
                      return spec ? (
                        <span key={sp} style={{ fontSize: 10, color: spec.color, background: `${spec.color}18`, padding: "1px 5px", borderRadius: 10 }}>
                          {spec.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main conversation area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
        {/* Header */}
        <div style={{
          padding: "12px 20px",
          borderBottom: "0.5px solid var(--hairline)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--label-primary)" }}>
            {isNewSession ? "New session" : (activeSession?.title?.slice(0, 60) ?? "Conversation")}
          </div>
          {specialist && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 20,
              background: `${specialist.color}20`,
              border: `1px solid ${specialist.color}40`,
              fontSize: 12,
              color: specialist.color,
            }}>
              <i className={`fa-solid ${specialist.icon}`} aria-hidden="true" />
              <span>{specialist.name} is thinking…</span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? (
            <div style={{ color: "var(--label-tertiary)", textAlign: "center", marginTop: 40 }}>
              Loading conversation…
            </div>
          ) : isNewSession ? (
            <div style={{ color: "var(--label-tertiary)", textAlign: "center", marginTop: 40 }}>
              Start the conversation with your AI team.
            </div>
          ) : visibleMessages.length === 0 ? (
            <div style={{ color: "var(--label-tertiary)", textAlign: "center", marginTop: 40 }}>
              No messages in this session.
            </div>
          ) : null}

          {visibleMessages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {isNewSession && streamingContent && activeSpecialist && (
            <MessageBubble
              msg={{
                id: "_streaming",
                sender_type: "agent",
                specialist: activeSpecialist,
                content: streamingContent,
                created_at: new Date().toISOString(),
                streaming: true,
              }}
            />
          )}
          <div ref={messagesEndRef} />
        </div>

      {/* Specialist chips */}
      <div style={{
        padding: "8px 20px 0",
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        flexShrink: 0,
      }}>
        {(Object.entries(SPECIALISTS) as [SpecialistKey, Specialist][]).map(([key, s]) => (
          <button
            key={key}
            onClick={() => setForcedSpecialist(forcedSpecialist === key ? null : key)}
            style={{
              padding: "3px 10px",
              borderRadius: 20,
              border: `1px solid ${forcedSpecialist === key ? s.color : "var(--hairline)"}`,
              background: forcedSpecialist === key ? `${s.color}20` : "none",
              color: forcedSpecialist === key ? s.color : "var(--label-tertiary)",
              fontSize: 11,
              cursor: "pointer",
              transition: "all 120ms",
            }}
          >
            <i className={`fa-solid ${s.icon}`} aria-hidden="true" /> {s.name}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: "12px 20px 16px", flexShrink: 0 }}>
        <div style={{
          display: "flex",
          gap: 10,
          padding: "8px 14px",
          borderRadius: 14,
          border: "0.5px solid var(--hairline)",
          background: "var(--fill-tertiary)",
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              forcedSpecialist
                ? `Talking to ${SPECIALISTS[forcedSpecialist].name}…`
                : "Ask TEOS anything about this project…"
            }
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--label-primary)",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{
              padding: "4px 14px",
              borderRadius: 10,
              background: input.trim() && !sending ? "#0a84ff" : "var(--fill-secondary)",
              border: "none",
              color: input.trim() && !sending ? "#fff" : "var(--label-quaternary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: input.trim() && !sending ? "pointer" : "default",
              transition: "all 120ms",
            }}
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: UIMessage }) {
  const isUser = msg.sender_type === "user";
  const spec = msg.specialist ? SPECIALISTS[msg.specialist as SpecialistKey] : null;

  return (
    <div style={{
      display: "flex",
      flexDirection: isUser ? "row-reverse" : "row",
      gap: 10,
      alignItems: "flex-start",
    }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: isUser
          ? "linear-gradient(135deg, #0a84ff, #5e5ce6)"
          : spec ? `${spec.color}30` : "var(--fill-secondary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        color: isUser ? "#fff" : spec?.color ?? "var(--label-secondary)",
        fontWeight: 600,
        flexShrink: 0,
        border: spec ? `1.5px solid ${spec.color}50` : "none",
      }}>
        {isUser ? "U" : spec ? <i className={`fa-solid ${spec.icon}`} aria-hidden="true" style={{ fontSize: 10 }} /> : "AI"}
      </div>

      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 4 }}>
        {!isUser && spec && (
          <div style={{ fontSize: 11, color: spec.color, fontWeight: 500, paddingLeft: 2 }}>
            {spec.name}
          </div>
        )}
        <div style={{
          padding: "10px 14px",
          borderRadius: isUser ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
          background: isUser ? "#0a84ff" : "var(--glass-strong)",
          border: isUser ? "none" : "0.5px solid var(--hairline)",
          color: isUser ? "#fff" : "var(--label-primary)",
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {msg.content}
          {msg.streaming && (
            <span style={{
              display: "inline-block",
              width: 8,
              height: 14,
              background: spec?.color ?? "#0a84ff",
              marginLeft: 2,
              borderRadius: 2,
              animation: "blink 1s infinite",
            }} />
          )}
        </div>
      </div>
    </div>
  );
}
