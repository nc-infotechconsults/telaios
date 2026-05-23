import { useState, useRef, useEffect } from "react";
import * as api from "../lib/api";

/* ─── Specialist definitions ──────────────────────────────────────────── */
type SpecialistKey = "qa" | "explorer" | "reverse" | "planner" | "coder" | "designer" | "reviewer";

interface Specialist {
  name: string;
  color: string;
  icon: string;
  tagline: string;
}

const SPECIALISTS: Record<SpecialistKey, Specialist> = {
  qa:       { name: "Q&A",        color: "#0a84ff", icon: "?",  tagline: "Ask anything about your project" },
  explorer: { name: "Explorer",   color: "#64d2ff", icon: "⌖",  tagline: "Find code, files, and patterns" },
  reverse:  { name: "Reverse",    color: "#bf5af2", icon: "◈",  tagline: "Trace and map code flows" },
  planner:  { name: "Planner",    color: "#30d158", icon: "⎇",  tagline: "Plan features and roadmaps" },
  coder:    { name: "Coder",      color: "#5e5ce6", icon: "</>", tagline: "Implement, refactor, and fix" },
  designer: { name: "Designer",   color: "#ff9f0a", icon: "✦",  tagline: "Design UI and mock layouts" },
  reviewer: { name: "Reviewer",   color: "#ff375f", icon: "⊘",  tagline: "Review PRs and audit code" },
};

function detectSpecialist(text: string): SpecialistKey {
  const t = text.toLowerCase();
  if (/design|mock|wireframe|figma|ui|ux|interface|layout/.test(t)) return "designer";
  if (/plan|roadmap|rollout|migration|architect|feature|spec/.test(t)) return "planner";
  if (/review|critique|risks|feedback|pr|diff|audit/.test(t)) return "reviewer";
  if (/refactor|implement|write code|fix the bug|stub|patch/.test(t)) return "coder";
  if (/reverse.engineer|sequence diagram|how does|trace|map the flow/.test(t)) return "reverse";
  if (/find|locate|where|search|grep|navigate/.test(t)) return "explorer";
  return "qa";
}

/* ─── Message types ───────────────────────────────────────────────────── */
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "handover";
  content: string;
  specialist?: SpecialistKey;
  timestamp: Date;
}

interface Session {
  id: string;
  label: string;
  active: boolean;
}

/* ─── Typing indicator ────────────────────────────────────────────────── */
function TypingIndicator({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "8px 12px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            animation: `typingDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Handover divider ────────────────────────────────────────────────── */
function HandoverDivider({ specialist, reason }: { specialist: Specialist; reason?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <div style={{ flex: 1, height: "0.5px", background: "var(--hairline)" }} />
      <span style={{ fontSize: 11, color: specialist.color, display: "flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
        <span>→</span>
        <span>{specialist.icon}</span>
        <b>{specialist.name}</b>
        {reason && <span>· {reason}</span>}
      </span>
      <div style={{ flex: 1, height: "0.5px", background: "var(--hairline)" }} />
    </div>
  );
}

/* ─── Orb ─────────────────────────────────────────────────────────────── */
function TeosOrb({ active = false }: { active?: boolean }) {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #0a84ff, #bf5af2)",
        animation: active ? "teosOrbPulse 2s ease-in-out infinite" : undefined,
        flexShrink: 0,
      }}
    />
  );
}

/* ─── Main component ──────────────────────────────────────────────────── */
interface AiSidebarProps {
  projectId: string;
  projectName: string;
  visible: boolean;
}

export default function AiSidebar({ projectId, projectName, visible }: AiSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hi! I'm TEOS, your AI assistant for **${projectName}**. I can help you explore code, plan features, review changes, and more. What would you like to do?`,
      specialist: "qa",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeSpecialist, setActiveSpecialist] = useState<SpecialistKey>("qa");
  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);
  const [sessions] = useState<Session[]>([
    { id: "s1", label: "Project overview", active: true },
    { id: "s2", label: "API design review", active: false },
    { id: "s3", label: "Feature planning", active: false },
  ]);

  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

    const detected = detectSpecialist(text);
    const prevSpecialist = activeSpecialist;
    const specialistChanged = detected !== prevSpecialist;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      specialist: detected,
      timestamp: new Date(),
    };

    const newMessages: ChatMessage[] = [...messages];

    if (specialistChanged) {
      newMessages.push({
        id: `ho-${Date.now()}`,
        role: "handover",
        content: "",
        specialist: detected,
        timestamp: new Date(),
      });
    }

    newMessages.push(userMsg);
    setMessages(newMessages);
    setActiveSpecialist(detected);
    setInput("");
    setIsTyping(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      // Try the knowledge query endpoint
      const result = await api.queryKnowledge(projectId, text).catch(() => null);
      const responseText = result?.answer
        ?? `I've analyzed your request with the ${SPECIALISTS[detected].name} specialist. To get a full answer, please ensure the knowledge base is configured for this project.`;

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: responseText,
          specialist: detected,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "I encountered an error processing your request. Please check that the backend is running and the knowledge base is configured.",
          specialist: detected,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const specialist = SPECIALISTS[activeSpecialist];

  if (!visible) return null;

  return (
    <div
      className="glass-panel-strong"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: "0.5px solid var(--hairline)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <TeosOrb active={isTyping} />
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--label-primary)" }}>TEOS</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: 9999,
              background: specialist.color + "20",
              color: specialist.color,
              border: `0.5px solid ${specialist.color}40`,
            }}
          >
            {specialist.icon} {specialist.name}
          </span>
          <button
            onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--label-secondary)",
              fontSize: 13,
              padding: "2px 6px",
              borderRadius: 6,
            }}
            aria-label="Toggle sessions drawer"
            title="Sessions"
          >
            ☰
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--label-secondary)", margin: 0 }}>
          {specialist.tagline}
        </p>

        {/* Specialist trail */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "var(--label-tertiary)" }}>Routed via</span>
          {Object.entries(SPECIALISTS).slice(0, 3).map(([key, s]) => (
            <span
              key={key}
              style={{
                fontSize: 10,
                color: key === activeSpecialist ? s.color : "var(--label-quaternary)",
                fontWeight: key === activeSpecialist ? 600 : 400,
              }}
            >
              → {s.name}
            </span>
          ))}
        </div>
      </div>

      {/* Sessions drawer overlay */}
      {showSessionsDrawer && (
        <div
          style={{
            position: "absolute",
            top: 80,
            left: 0,
            right: 0,
            background: "var(--glass-strong)",
            backdropFilter: "blur(20px)",
            borderBottom: "0.5px solid var(--hairline)",
            zIndex: 10,
            padding: "8px 0",
          }}
        >
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setShowSessionsDrawer(false)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 16px",
                background: s.active ? "var(--hover-glass)" : "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: s.active ? "var(--label-primary)" : "var(--label-secondary)",
                fontWeight: s.active ? 500 : 400,
              }}
            >
              {s.active && <span style={{ color: "#0a84ff", marginRight: 6 }}>●</span>}
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Message thread */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
        role="log"
        aria-label="TEOS conversation"
        aria-live="polite"
      >
        {messages.map((msg) => {
          if (msg.role === "handover" && msg.specialist) {
            return (
              <HandoverDivider
                key={msg.id}
                specialist={SPECIALISTS[msg.specialist]}
                reason={`Switching to ${SPECIALISTS[msg.specialist].name} for this topic.`}
              />
            );
          }

          const isUser = msg.role === "user";
          const msgSpecialist = msg.specialist ? SPECIALISTS[msg.specialist] : specialist;

          return (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: isUser ? "row-reverse" : "row",
                gap: 8,
                alignItems: "flex-end",
              }}
            >
              {!isUser && (
                <div style={{ flexShrink: 0, marginBottom: 2 }}>
                  <TeosOrb />
                </div>
              )}
              <div
                style={{
                  maxWidth: "82%",
                  padding: "9px 12px",
                  borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  ...(isUser
                    ? {
                        background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
                        color: "#fff",
                        boxShadow: "0 2px 8px rgba(10,132,255,0.3)",
                      }
                    : {
                        background: "var(--glass-strong)",
                        border: "0.5px solid var(--glass-edge)",
                        color: "var(--label-primary)",
                        boxShadow: "var(--shadow-glass-panel)",
                      }),
                }}
              >
                {!isUser && msg.specialist && msg.specialist !== "qa" && (
                  <div style={{ fontSize: 10, color: msgSpecialist.color, marginBottom: 4, fontWeight: 500 }}>
                    {msgSpecialist.icon} {msgSpecialist.name}
                  </div>
                )}
                <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4, textAlign: isUser ? "right" : "left" }}>
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <TeosOrb active />
            <div
              style={{
                background: "var(--glass-strong)",
                border: "0.5px solid var(--glass-edge)",
                borderRadius: "16px 16px 16px 4px",
                boxShadow: "var(--shadow-glass-panel)",
              }}
            >
              <TypingIndicator color={specialist.color} />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: "10px 12px",
          borderTop: "0.5px solid var(--hairline)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            background: "var(--fill-tertiary)",
            borderRadius: 14,
            padding: "8px 10px",
            border: "0.5px solid var(--glass-edge)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask TEOS…"
            rows={1}
            aria-label="Message TEOS"
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: 13,
              lineHeight: 1.45,
              color: "var(--label-primary)",
              fontFamily: "inherit",
              overflow: "hidden",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isTyping}
            aria-label="Send message"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: input.trim() && !isTyping
                ? "linear-gradient(135deg, #0a84ff, #5e5ce6)"
                : "var(--fill-secondary)",
              border: "none",
              cursor: input.trim() && !isTyping ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: input.trim() && !isTyping ? "#fff" : "var(--label-tertiary)",
              flexShrink: 0,
              transition: "background 150ms",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        <p style={{ fontSize: 10, color: "var(--label-quaternary)", marginTop: 5, textAlign: "center" }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
