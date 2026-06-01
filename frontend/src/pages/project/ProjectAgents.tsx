import { useEffect, useState } from "react";
import { listProjectAgents, listProjectSkills, listProjectMcps, deleteProjectSkill, deleteProjectMcp, updateProjectAgent } from "../../lib/api";
import type { ProjectAgent, ProjectSkill, ProjectMcp } from "../../types";

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
    color: "var(--color-blue)",
    knowledgeSources: ["repositories", "documents"],
    status: "idle",
  },
  {
    id: "reverse",
    name: "Reverse Engineer",
    role: "reverse",
    description: "Traces code flows, generates sequence diagrams, and maps component relationships.",
    icon: "◈",
    color: "var(--color-purple)",
    knowledgeSources: ["repositories"],
    status: "idle",
  },
  {
    id: "planner",
    name: "Feature Architect",
    role: "planner",
    description: "Plans features, creates implementation roadmaps, and identifies dependencies.",
    icon: "⎇",
    color: "var(--color-green)",
    knowledgeSources: ["repositories", "documents"],
    status: "idle",
  },
  {
    id: "designer",
    name: "UI Designer",
    role: "designer",
    description: "Generates UI mockups, suggests design improvements, and creates component specs.",
    icon: "✦",
    color: "var(--color-orange)",
    knowledgeSources: ["designs"],
    status: "idle",
  },
  {
    id: "sync",
    name: "Doc Sync",
    role: "knowledge",
    description: "Keeps documentation in sync with code changes and detects documentation drift.",
    icon: "↻",
    color: "var(--color-indigo)",
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
  const [resourceTab, setResourceTab] = useState<"agents" | "resources">("agents");
  const [resourceSubTab, setResourceSubTab] = useState<"skills" | "mcps">("skills");
  const [projectSkills, setProjectSkills] = useState<ProjectSkill[]>([]);
  const [projectMcps, setProjectMcps] = useState<ProjectMcp[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  // Agent edit modal state
  const [editingAgent, setEditingAgent] = useState<ProjectAgent | null>(null);
  const [editForm, setEditForm] = useState({ system_prompt: "", system_prompt_mode: "append", llm_provider: "", llm_model: "", llm_api_key: "", llm_temperature: "", llm_max_tokens: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listProjectAgents(projectId)
      .then(setProjectAgents)
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (resourceTab !== "resources") return;
    setResourcesLoading(true);
    Promise.all([
      listProjectSkills(projectId),
      listProjectMcps(projectId),
    ]).then(([skills, mcps]) => {
      setProjectSkills(skills);
      setProjectMcps(mcps);
    }).catch(() => {}).finally(() => setResourcesLoading(false));
  }, [projectId, resourceTab]);

  const handleRun = async (agentId: string) => {
    setRunningId(agentId);
    await new Promise((r) => setTimeout(r, 2000)); // Simulated run
    setRunningId(null);
  };

  const openEdit = (agent: ProjectAgent) => {
    setEditingAgent(agent);
    setEditForm({
      system_prompt: agent.system_prompt ?? "",
      system_prompt_mode: agent.system_prompt_mode ?? "append",
      llm_provider: agent.llm_provider ?? "",
      llm_model: agent.llm_model ?? "",
      // llm_api_key is write-only; never returned by the API
      llm_api_key: "",
      llm_temperature: agent.llm_temperature != null ? String(agent.llm_temperature) : "",
      llm_max_tokens: agent.llm_max_tokens != null ? String(agent.llm_max_tokens) : "",
    });
  };

  const handleSave = async () => {
    if (!editingAgent) return;
    setSaving(true);
    try {
      // llm_api_key is accepted by PATCH but not part of the response type;
      // use a cast to pass it through without TypeScript errors.
      const patchBody = {
        system_prompt: editForm.system_prompt || undefined,
        system_prompt_mode: editForm.system_prompt_mode as "append" | "override",
        llm_provider: editForm.llm_provider || undefined,
        llm_model: editForm.llm_model || undefined,
        llm_temperature: editForm.llm_temperature ? parseFloat(editForm.llm_temperature) : undefined,
        llm_max_tokens: editForm.llm_max_tokens ? parseInt(editForm.llm_max_tokens) : undefined,
        ...(editForm.llm_api_key ? { llm_api_key: editForm.llm_api_key } : {}),
      } as Parameters<typeof updateProjectAgent>[2];
      const updated = await updateProjectAgent(projectId, editingAgent.id, patchBody);
      setProjectAgents((prev) => prev.map((a) => a.id === updated.id ? updated : a));
      setEditingAgent(null);
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--label-primary)" }}>Agents</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--label-secondary)" }}>
          AI specialists that work on your project's knowledge base
        </p>
      </div>

      {/* Top-level tab switcher */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {(["agents", "resources"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setResourceTab(tab)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: resourceTab === tab ? "var(--glass-strong)" : "none",
              color: resourceTab === tab ? "var(--label-primary)" : "var(--label-tertiary)",
              fontWeight: resourceTab === tab ? 500 : 400,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {tab === "agents" ? "Agents" : "Project Resources"}
          </button>
        ))}
      </div>

      {resourceTab === "resources" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(["skills", "mcps"] as const).map((sub) => (
              <button
                key={sub}
                onClick={() => setResourceSubTab(sub)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: `1px solid ${resourceSubTab === sub ? "var(--color-blue)" : "var(--hairline)"}`,
                  background: resourceSubTab === sub ? "color-mix(in srgb, var(--color-blue) 12%, transparent)" : "none",
                  color: resourceSubTab === sub ? "var(--color-blue)" : "var(--label-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {sub === "skills" ? "Skills" : "MCP Servers"}
              </button>
            ))}
          </div>

          {resourcesLoading ? (
            <div style={{ color: "var(--label-tertiary)", textAlign: "center", padding: 32 }}>Loading…</div>
          ) : resourceSubTab === "skills" ? (
            <ResourceList
              items={projectSkills}
              type="skill"
              onDelete={async (id) => {
                await deleteProjectSkill(projectId, id);
                setProjectSkills((prev) => prev.filter((s) => s.id !== id));
              }}
            />
          ) : (
            <ResourceList
              items={projectMcps}
              type="mcp"
              onDelete={async (id) => {
                await deleteProjectMcp(projectId, id);
                setProjectMcps((prev) => prev.filter((m) => m.id !== id));
              }}
            />
          )}
        </div>
      )}

      {resourceTab === "agents" && (
      <>
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
                      background: `color-mix(in srgb, ${agent.color} 9%, transparent)`,
                      border: `0.5px solid color-mix(in srgb, ${agent.color} 18%, transparent)`,
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
                      background: isRunning ? "var(--color-green)" : "var(--label-quaternary)",
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
                        ? `color-mix(in srgb, ${agent.color} 12%, transparent)`
                        : `linear-gradient(135deg, ${agent.color}, color-mix(in srgb, ${agent.color} 73%, transparent))`,
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
                <button
                  onClick={() => openEdit(agent)}
                  style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                    background: "color-mix(in srgb, var(--color-blue) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--color-blue) 25%, transparent)", color: "var(--color-blue)",
                    fontWeight: 500,
                  }}
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}

      {/* Agent edit modal */}
      {editingAgent && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--bg-secondary, #1c1c1e)", borderRadius: 16, padding: 24, width: 520, maxWidth: "90vw", border: "0.5px solid var(--hairline)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--label-primary)" }}>Edit Agent: {editingAgent.name}</div>

            <div>
              <label style={{ fontSize: 12, color: "var(--label-secondary)", display: "block", marginBottom: 4 }}>System Prompt</label>
              <textarea
                value={editForm.system_prompt}
                onChange={(e) => setEditForm((f) => ({ ...f, system_prompt: e.target.value }))}
                rows={4}
                placeholder="Custom system prompt (leave empty to use default)"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "var(--fill-tertiary)", color: "var(--label-primary)", fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: "var(--label-secondary)", display: "block", marginBottom: 4 }}>Prompt Mode</label>
                <select value={editForm.system_prompt_mode} onChange={(e) => setEditForm((f) => ({ ...f, system_prompt_mode: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "var(--fill-tertiary)", color: "var(--label-primary)", fontSize: 13 }}>
                  <option value="append">Append to default</option>
                  <option value="override">Override default</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: "var(--label-secondary)", display: "block", marginBottom: 4 }}>Provider</label>
                <input value={editForm.llm_provider} onChange={(e) => setEditForm((f) => ({ ...f, llm_provider: e.target.value }))}
                  placeholder="e.g. anthropic, openai"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "var(--fill-tertiary)", color: "var(--label-primary)", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: 12, color: "var(--label-secondary)", display: "block", marginBottom: 4 }}>Model</label>
                <input value={editForm.llm_model} onChange={(e) => setEditForm((f) => ({ ...f, llm_model: e.target.value }))}
                  placeholder="e.g. claude-sonnet-4-6"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "var(--fill-tertiary)", color: "var(--label-primary)", fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: "var(--label-secondary)", display: "block", marginBottom: 4 }}>Temperature</label>
                <input type="number" min="0" max="2" step="0.1" value={editForm.llm_temperature}
                  onChange={(e) => setEditForm((f) => ({ ...f, llm_temperature: e.target.value }))}
                  placeholder="0.7"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "var(--fill-tertiary)", color: "var(--label-primary)", fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: "var(--label-secondary)", display: "block", marginBottom: 4 }}>Max Tokens</label>
                <input type="number" value={editForm.llm_max_tokens}
                  onChange={(e) => setEditForm((f) => ({ ...f, llm_max_tokens: e.target.value }))}
                  placeholder="4096"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "var(--fill-tertiary)", color: "var(--label-primary)", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "var(--label-secondary)", display: "block", marginBottom: 4 }}>API Key (override)</label>
              <input type="password" value={editForm.llm_api_key} onChange={(e) => setEditForm((f) => ({ ...f, llm_api_key: e.target.value }))}
                placeholder="Leave empty to use project default"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "var(--fill-tertiary)", color: "var(--label-primary)", fontSize: 13, boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button onClick={() => setEditingAgent(null)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "none", color: "var(--label-secondary)", cursor: "pointer", fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--color-blue)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResourceList({
  items,
  type,
  onDelete,
}: {
  items: Array<{ id: string; name: string; slug: string; description: string | null }>;
  type: "skill" | "mcp";
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.length === 0 && (
        <div style={{ color: "var(--label-tertiary)", fontSize: 13, padding: "16px 0" }}>
          No project {type === "skill" ? "skills" : "MCP servers"} yet.
        </div>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--fill-tertiary)",
            border: "0.5px solid var(--hairline)",
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: type === "skill" ? "color-mix(in srgb, var(--color-indigo) 12%, transparent)" : "color-mix(in srgb, var(--color-green) 12%, transparent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, flexShrink: 0,
          }}>
            {type === "skill" ? "⚡" : "🔌"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--label-primary)" }}>
              {item.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--label-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.description ?? item.slug}
            </div>
          </div>
          <button
            onClick={() => onDelete(item.id)}
            style={{
              padding: "4px 10px", borderRadius: 6,
              background: "color-mix(in srgb, var(--color-red) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-red) 18%, transparent)",
              color: "var(--color-red)", fontSize: 12, cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
