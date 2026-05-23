import { useState, useRef, useEffect } from "react";
import { queryKnowledge } from "../../lib/api";

type SpecialistKey = "qa" | "explorer" | "reverse" | "planner" | "coder" | "designer" | "reviewer";

interface Specialist {
  name: string;
  color: string;
  icon: string;
}

const SPECIALISTS: Record<SpecialistKey, Specialist> = {
  qa:       { name: "Q&A",      color: "#0a84ff", icon: "?" },
  explorer: { name: "Explorer", color: "#64d2ff", icon: "⌖" },
  reverse:  { name: "Reverse",  color: "#bf5af2", icon: "◈" },
  planner:  { name: "Planner",  color: "#30d158", icon: "⎇" },
  coder:    { name: "Coder",    color: "#5e5ce6", icon: "</>" },
  designer: { name: "Designer", color: "#ff9f0a", icon: "✦" },
  reviewer: { name: "Reviewer", color: "#ff375f", icon: "⊘" },
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

interface Message {
  id: string;
  role: "user" | "assistant" | "handover";
  content: string;
  specialist?: SpecialistKey;
  timestamp: Date;
}

interface ArtifactCard {
  id: string;
  type: "plan" | "code" | "citation" | "design";
  title: string;
  content: string;
}

const MOCK_SESSIONS = [
  { id: "s1", label: "Project overview", active: true, time: "2m ago" },
  { id: "s2", label: "API design review", active: false, time: "1h ago" },
  { id: "s3", label: "Feature planning", active: false, time: "3h ago" },
  { id: "s4", label: "Auth refactor", active: false, time: "1d ago" },
];

function HandoverDivider({ specialist, reason }: { specialist: Specialist; reason: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexShrink: 0 }}>
      <div style={{ flex: 1, height: "0.5px", background: "var(--hairline)" }} />
      <span style={{ fontSize: 12, color: specialist.color, display: "flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
        <span>→</span>
        <span>{specialist.icon}</span>
        <b>{specialist.name}</b>
        <span>· {reason}</span>
      </span>
      <div style={{ flex: 1, height: "0.5px", background: "var(--hairline)" }} />
    </div>
  );
}

function ArtifactPanel({ artifact }: { artifact: ArtifactCard | null }) {
  if (!artifact) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", color: "var(--label-quaternary)", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 32 }}>⎕</span>
        <p style={{ fontSize: 13 }}>Artifacts will appear here</p>
      </div>
    );
  }
  const colorMap: Record<string, string> = { plan: "#30d158", code: "#5e5ce6", citation: "#0a84ff", design: "#ff9f0a" };
  return (
    <div style={{ padding: 20, height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: colorMap[artifact.type] }}>
          {artifact.type}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--label-primary)" }}>{artifact.title}</span>
      </div>
      <pre style={{ fontSize: 12, color: "var(--label-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>
        {artifact.content}
      </pre>
    </div>
  );
}

export default function ProjectConversation({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "w",
      role: "assistant",
      content: "Welcome to the full conversation view. I'm TEOS, ready to help you explore this project in depth. What would you like to work on?",
      specialist: "qa",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeSpecialist, setActiveSpecialist] = useState<SpecialistKey>("qa");
  const [activeArtifact, setActiveArtifact] = useState<ArtifactCard | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const detected = detectSpecialist(text);
    const changed = detected !== activeSpecialist;

    const next: Message[] = [...messages];
    if (changed) {
      next.push({ id: `ho-${Date.now()}`, role: "handover", content: "", specialist: detected, timestamp: new Date() });
    }
    next.push({ id: `u-${Date.now()}`, role: "user", content: text, specialist: detected, timestamp: new Date() });
    setMessages(next);
    setActiveSpecialist(detected);
    setInput("");
    setIsTyping(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const result = await queryKnowledge(projectId, text).catch(() => null);
      const answer = result?.answer ?? `I've processed your request using the ${SPECIALISTS[detected].name} specialist. Please ensure the knowledge base is configured for full responses.`;

      // Possibly generate an artifact
      if (text.toLowerCase().includes("plan") || text.toLowerCase().includes("roadmap")) {
        setActiveArtifact({ id: `art-${Date.now()}`, type: "plan", title: "Generated Plan", content: answer });
      }

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: answer, specialist: detected, timestamp: new Date() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: "An error occurred. Please check the backend connection.", specialist: detected, timestamp: new Date() },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const s = SPECIALISTS[activeSpecialist];

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Sessions list strip */}
      <div
        style={{
          width: 200,
          borderRight: "0.5px solid var(--hairline)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 12px 8px", borderBottom: "0.5px solid var(--hairline)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--label-tertiary)" }}>Sessions</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
          {MOCK_SESSIONS.map((s) => (
            <div
              key={s.id}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                cursor: "pointer",
                background: s.active ? "var(--hover-glass)" : "none",
                borderLeft: s.active ? "2px solid #0a84ff" : "2px solid transparent",
                marginBottom: 2,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: s.active ? 500 : 400, color: s.active ? "var(--label-primary)" : "var(--label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.label}
              </div>
              <div style={{ fontSize: 10, color: "var(--label-quaternary)", marginTop: 2 }}>{s.time}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: 10, borderTop: "0.5px solid var(--hairline)" }}>
          <button
            style={{
              width: "100%",
              padding: "7px",
              borderRadius: 10,
              background: "linear-gradient(135deg, rgba(10,132,255,0.15), rgba(191,90,242,0.15))",
              border: "0.5px solid rgba(10,132,255,0.3)",
              color: "#0a84ff",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + New Session
          </button>
        </div>
      </div>

      {/* Chat thread */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Active specialist banner */}
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "0.5px solid var(--hairline)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: "linear-gradient(135deg, #0a84ff, #bf5af2)", animation: "teosOrbPulse 2s ease-in-out infinite" }} aria-hidden="true" />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--label-secondary)" }}>
            TEOS ·
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>
            {s.icon} {s.name} active
          </span>
        </div>

        {/* Messages */}
        <div
          style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
        >
          {messages.map((msg) => {
            if (msg.role === "handover" && msg.specialist) {
              return (
                <HandoverDivider
                  key={msg.id}
                  specialist={SPECIALISTS[msg.specialist]}
                  reason={`Switching to ${SPECIALISTS[msg.specialist].name} for this request.`}
                />
              );
            }
            const isUser = msg.role === "user";
            const ms = msg.specialist ? SPECIALISTS[msg.specialist] : s;
            return (
              <div key={msg.id} style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
                {!isUser && (
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg, #0a84ff, #bf5af2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", marginBottom: 2 }} aria-hidden="true">T</div>
                )}
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "10px 14px",
                    borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    fontSize: 13,
                    lineHeight: 1.55,
                    ...(isUser
                      ? { background: "linear-gradient(135deg, #0a84ff, #5e5ce6)", color: "#fff" }
                      : { background: "var(--glass-strong)", border: "0.5px solid var(--glass-edge)", color: "var(--label-primary)" }),
                  }}
                >
                  {!isUser && msg.specialist && msg.specialist !== "qa" && (
                    <div style={{ fontSize: 10, color: ms.color, marginBottom: 4, fontWeight: 600 }}>{ms.icon} {ms.name}</div>
                  )}
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg.content}</p>
                  <span style={{ display: "block", fontSize: 10, opacity: 0.5, marginTop: 4, textAlign: isUser ? "right" : "left" }}>
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })}
          {isTyping && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg, #0a84ff, #bf5af2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }} aria-hidden="true">T</div>
              <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "var(--glass-strong)", border: "0.5px solid var(--glass-edge)" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, animation: `typingDot 1.2s ease-in-out ${i*0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "12px 16px", borderTop: "0.5px solid var(--hairline)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", background: "var(--fill-tertiary)", borderRadius: 16, padding: "10px 12px", border: "0.5px solid var(--glass-edge)" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message TEOS… (Enter to send, Shift+Enter for newline)"
              rows={1}
              aria-label="Message input"
              style={{ flex: 1, background: "none", border: "none", outline: "none", resize: "none", fontSize: 14, lineHeight: 1.5, color: "var(--label-primary)", fontFamily: "inherit", overflow: "hidden" }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || isTyping}
              aria-label="Send message"
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: input.trim() && !isTyping ? "linear-gradient(135deg, #0a84ff, #5e5ce6)" : "var(--fill-secondary)",
                border: "none",
                cursor: input.trim() && !isTyping ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: input.trim() && !isTyping ? "#fff" : "var(--label-tertiary)",
                flexShrink: 0,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Artifact canvas */}
      <div
        style={{
          width: 320,
          borderLeft: "0.5px solid var(--hairline)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "12px 16px 8px", borderBottom: "0.5px solid var(--hairline)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--label-tertiary)" }}>Artifact Canvas</div>
        </div>
        <ArtifactPanel artifact={activeArtifact} />
      </div>
    </div>
  );
}
