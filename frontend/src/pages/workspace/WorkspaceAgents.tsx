import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { getAgentProfiles, deleteAgentProfile } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { AgentProfile, AgentType } from "../../types";
import AgentProfileForm from "../../components/agents/AgentProfileForm";
import AgentProfileDetail from "../../components/agents/AgentProfileDetail";

const TYPE_LABEL: Record<AgentType, string> = {
  langgraph: "LangGraph",
  opencode: "OpenCode",
  "github-copilot": "GitHub Copilot",
};

const TYPE_COLOR: Record<AgentType, string> = {
  langgraph: "#0a84ff",
  opencode: "#bf5af2",
  "github-copilot": "#30d158",
};

export default function WorkspaceAgents() {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [viewing, setViewing] = useState<AgentProfile | null>(null);
  const [deleting, setDeleting] = useState<AgentProfile | null>(null);

  const load = () => {
    setLoading(true);
    getAgentProfiles().then(setProfiles).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() =>
    search
      ? profiles.filter((p) =>
          (p.name + " " + (p.description ?? "")).toLowerCase().includes(search.toLowerCase())
        )
      : profiles,
  [profiles, search]);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteAgentProfile(deleting.id);
      setProfiles((ps) => ps.filter((p) => p.id !== deleting.id));
      toast.success("Agent profile deleted");
    } catch {
      toast.error("Failed to delete agent profile");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="main-scroll">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 className="h-page" style={{ margin: 0, flex: 1 }}>Agent Profiles</h1>
        <button
          className="pill-btn"
          style={{ background: "var(--accent-1)", color: "#fff", borderColor: "transparent" }}
          onClick={() => setCreating(true)}
        >
          <Icon name="plus" size="sm" /> New Profile
        </button>
      </div>
      <p className="sub-page">
        Configure AI coding agents with LLM, tools, and skills
      </p>

      {/* Search */}
      <div className="card" style={{ padding: "8px 12px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="search" size="sm" style={{ color: "var(--fg-3)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agent profiles…"
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--fg)", fontSize: 13 }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ color: "var(--fg-3)", fontSize: 11, padding: "2px 6px", cursor: "pointer" }}>✕</button>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>Loading…</div>
      )}

      {!loading && profiles.length === 0 && !search && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--fg-3)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
          <p style={{ fontWeight: 600, fontSize: 15, color: "var(--fg)", marginBottom: 4 }}>No agent profiles yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>Create your first agent profile to get started.</p>
          <button
            className="pill-btn"
            style={{ background: "var(--accent-1)", color: "#fff", borderColor: "transparent" }}
            onClick={() => setCreating(true)}
          >
            Create First Profile
          </button>
        </div>
      )}

      {!loading && filtered.length === 0 && search && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>
          No profiles match "{search}"
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid-3">
          {filtered.map((p) => (
            <div key={p.id} className="card" style={{ padding: 16, cursor: "pointer" }}
              onClick={() => setViewing(p)}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: TYPE_COLOR[p.agent_type] ?? "#0a84ff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, color: "#fff", fontSize: 14, flexShrink: 0,
                }}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 2 }}>
                    {TYPE_LABEL[p.agent_type] ?? p.agent_type} · {p.llm_model || p.llm_provider}
                  </div>
                </div>
              </div>

              {p.description && (
                <p style={{
                  fontSize: 12.5, color: "var(--fg-2)", margin: "0 0 10px", lineHeight: 1.5,
                  overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                  WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                }}>
                  {p.description}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <button className="pill-btn" onClick={() => setEditing(p)} style={{ fontSize: 11 }}>Edit</button>
                <button
                  className="pill-btn"
                  onClick={() => setDeleting(p)}
                  style={{ fontSize: 11, borderColor: "#ff3b30", color: "#ff3b30" }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit form modal */}
      {(creating || editing) && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 40 }}
          onClick={() => { setCreating(false); setEditing(null); }}
        >
          <div style={{ width: "100%", maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
            <AgentProfileForm
              initialData={editing ?? undefined}
              onSaved={() => { setCreating(false); setEditing(null); load(); }}
              onCancel={() => { setCreating(false); setEditing(null); }}
            />
          </div>
        </div>
      )}

      {/* Detail view modal */}
      {viewing && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 40 }}
          onClick={() => setViewing(null)}
        >
          <div style={{ width: "100%", maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
            <AgentProfileDetail profile={viewing} />
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleting && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setDeleting(null)}
        >
          <div className="card" style={{ width: 380, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Delete agent profile?</h2>
            <p style={{ fontSize: 13, color: "var(--fg-3)", marginBottom: 20 }}>
              "{deleting.name}" will be permanently deleted. This cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="pill-btn" onClick={() => setDeleting(null)}>Cancel</button>
              <button
                className="pill-btn"
                style={{ background: "#ff3b30", color: "#fff", borderColor: "transparent" }}
                onClick={() => void confirmDelete()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
