import { useState, useRef, useEffect, useCallback } from "react";
import { getConversationHistory, sendConversationMessage } from "../../lib/api";
import type { ConversationMessage } from "../../types";

type SpecialistKey = "qa" | "explorer" | "reverse" | "planner" | "coder" | "designer" | "reviewer";

interface Specialist {
  name: string;
  color: string;
  icon: string;
  tagline: string;
}

const SPECIALISTS: Record<SpecialistKey, Specialist> = {
  qa:       { name: "Q&A",      color: "#0a84ff", icon: "?",   tagline: "Grounded answers from indexed sources" },
  explorer: { name: "Explorer", color: "#64d2ff", icon: "⌖",  tagline: "Find code, files, and patterns" },
  reverse:  { name: "Reverse",  color: "#bf5af2", icon: "◈",  tagline: "Trace and map system flows" },
  planner:  { name: "Planner",  color: "#30d158", icon: "⎇",  tagline: "Cross-repo implementation plans" },
  coder:    { name: "Coder",    color: "#5e5ce6", icon: "</>", tagline: "Implement, refactor, and fix" },
  designer: { name: "Designer", color: "#ff9f0a", icon: "✦",  tagline: "Design UIs from your brand kit" },
  reviewer: { name: "Reviewer", color: "#ff375f", icon: "⊘",  tagline: "Review PRs and audit code" },
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamBufferRef = useRef("");

  // Load history on mount
  useEffect(() => {
    getConversationHistory(projectId, { limit: 100 })
      .then(({ messages: msgs }) => {
        setMessages(msgs.map((m) => ({
          id: m.id,
          sender_type: m.sender_type as "user" | "agent",
          specialist: m.specialist as SpecialistKey | null,
          content: m.content,
          created_at: m.created_at,
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // SSE connection
  useEffect(() => {
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

  const specialist = activeSpecialist ? SPECIALISTS[activeSpecialist] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 0 }}>
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
          Project Conversation
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
            <span>{specialist.icon}</span>
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
        ) : messages.length === 0 && !streamingContent ? (
          <div style={{ color: "var(--label-tertiary)", textAlign: "center", marginTop: 40 }}>
            Start the conversation with your AI team.
          </div>
        ) : null}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {streamingContent && activeSpecialist && (
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
            {s.icon} {s.name}
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
        {isUser ? "U" : (spec?.icon ?? "AI")}
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
