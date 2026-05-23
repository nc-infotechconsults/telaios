import { useEffect, useState } from "react";
import { listProjectAgents } from "../../lib/api";
import type { ProjectAgent } from "../../types";

interface BuiltinAgent {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: string;
  color: string;
  knowledgeSources: string[];
  status: "idle" | "running" | "error";
}

const BUILTIN_AGENTS: BuiltinAgent[] = [
  {
    id: "qa",
    name: "Q&A Assistant",
    role: "qa",
    description: "Answers questions about your codebase, architecture, and documentation using project knowledge.",
    icon: "?",
    color: "#0a84ff",
    knowledgeSources: ["repositories", "documents"],
    status: "idle",
  },
  {
    id: "reverse",
    name: "Reverse Engineer",
    role: "reverse",
    description: "Traces code flows, generates sequence diagrams, and maps component relationships.",
    icon: "◈",
    color: "#bf5af2",
    knowledgeSources: ["repositories"],
    status: "idle",
  },
  {
    id: "planner",
    name: "Feature Architect",
    role: "planner",
    description: "Plans features, creates implementation roadmaps, and identifies dependencies.",
    icon: "⎇",
    color: "#30d158",
    knowledgeSources: ["repositories", "documents"],
    status: "idle",
  },
  {
    id: "designer",
    name: "UI Designer",
    role: "designer",
    description: "Generates UI mockups, suggests design improvements, and creates component specs.",
    icon: "✦",
    color: "#ff9f0a",
    knowledgeSources: ["designs"],
    status: "idle",
  },
  {
    id: "sync",
    name: "Doc Sync",
    role: "knowledge",
    description: "Keeps documentation in sync with code changes and detects documentation drift.",
    icon: "↻",
    color: "#5e5ce6",
    knowledgeSources: ["repositories", "documents"],
    status: "idle",
  },
];

const MOCK_ACTIVITY = [
  "Answered 12 questions today",
  "Last run: 2 hours ago",
  "Processed 47 files",
];

export default function ProjectAgents({ projectId }: { projectId: string }) {
  const [projectAgents, setProjectAgents] = useState<ProjectAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => {
    listProjectAgents(projectId)
      .then(setProjectAgents)
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleRun = async (agentId: string) => {
    setRunningId(agentId);
    await new Promise((r) => setTimeout(r, 2000)); // Simulated run
    setRunningId(null);
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--label-primary)" }}>Agents</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--label-secondary)" }}>
          AI specialists that work on your project's knowledge base
        </p>
      </div>

      {/* Built-in agents */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--label-tertiary)", marginBottom: 10 }}>
          TEOS Specialists
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }} role="list" aria-label="Built-in agents">
          {BUILTIN_AGENTS.map((agent, idx) => {
            const isRunning = runningId === agent.id;
            return (
              <div
                key={agent.id}
                role="listitem"
                style={{
                  background: "var(--glass)",
                  backdropFilter: "blur(20px)",
                  border: "0.5px solid var(--glass-edge)",
                  borderRadius: 18,
                  padding: 18,
                  boxShadow: "var(--shadow-glass-panel)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: `${agent.color}18`,
                      border: `0.5px solid ${agent.color}30`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      color: agent.color,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {agent.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--label-primary)" }}>{agent.name}</div>
                    <div style={{ fontSize: 11, color: agent.color, marginTop: 2, fontWeight: 500 }}>{agent.role}</div>
                  </div>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: isRunning ? "#30d158" : "var(--label-quaternary)",
                      animation: isRunning ? "teosOrbPulse 1s ease-in-out infinite" : undefined,
                      flexShrink: 0,
                      marginTop: 4,
                    }}
                    aria-label={isRunning ? "Running" : "Idle"}
                  />
                </div>

                {/* Description */}
                <p style={{ margin: 0, fontSize: 12, color: "var(--label-secondary)", lineHeight: 1.5 }}>
                  {agent.description}
                </p>

                {/* Knowledge sources */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {agent.knowledgeSources.map((src) => (
                    <span
                      key={src}
                      style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, background: "var(--fill-tertiary)", color: "var(--label-tertiary)", border: "0.5px solid var(--hairline)" }}
                    >
                      {src}
                    </span>
                  ))}
                </div>

                {/* Activity log */}
                <div style={{ fontSize: 11, color: "var(--label-quaternary)" }}>
                  {MOCK_ACTIVITY[idx % MOCK_ACTIVITY.length]}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                  <button
                    onClick={() => handleRun(agent.id)}
                    disabled={isRunning}
                    aria-label={`Run ${agent.name}`}
                    style={{
                      flex: 1,
                      padding: "7px 0",
                      borderRadius: 10,
                      background: isRunning
                        ? `${agent.color}20`
                        : `linear-gradient(135deg, ${agent.color}, ${agent.color}bb)`,
                      border: "none",
                      color: isRunning ? agent.color : "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: isRunning ? "default" : "pointer",
                    }}
                  >
                    {isRunning ? "Running…" : "Run"}
                  </button>
                  <button
                    aria-label={`Configure ${agent.name}`}
                    style={{ padding: "7px 14px", borderRadius: 10, background: "var(--fill-tertiary)", border: "0.5px solid var(--hairline)", color: "var(--label-secondary)", fontSize: 12, cursor: "pointer" }}
                  >
                    Configure
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Project-assigned agents */}
      {!loading && projectAgents.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--label-tertiary)", marginBottom: 10 }}>
            Project Agents ({projectAgents.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {projectAgents.map((agent) => (
              <div
                key={agent.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 18px",
                  background: "var(--glass)",
                  backdropFilter: "blur(20px)",
                  border: "0.5px solid var(--glass-edge)",
                  borderRadius: 14,
                  boxShadow: "var(--shadow-glass-panel)",
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--fill-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }} aria-hidden="true">⊛</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--label-primary)" }}>{agent.name}</div>
                  <div style={{ fontSize: 11, color: "var(--label-tertiary)" }}>{agent.role}</div>
                </div>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 9999, background: "var(--fill-tertiary)", color: "var(--label-tertiary)" }}>custom</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
