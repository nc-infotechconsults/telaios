import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import {
  cloneLibraryAgent, deleteLibraryAgent, deleteLibraryMCP, deleteLibrarySkill,
  listLibraryAgents, listLibraryMCPs, listLibrarySkills,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import type { AgentRole, LibraryAgent, LibraryMCP, LibrarySkill } from "../../types";
import LibraryAgentForm from "../../components/library/LibraryAgentForm";
import LibraryMCPForm from "../../components/library/LibraryMCPForm";
import LibrarySkillForm from "../../components/library/LibrarySkillForm";

type Tab = "agents" | "mcps" | "skills";

const ROLE_COLOR: Record<AgentRole, string> = {
  planner: "#0a84ff", coder: "#30d158", reviewer: "#ff9f0a",
  tester: "#bf5af2", infra: "#ff3b30", knowledge: "#5e5ce6",
  custom: "#64d2ff", "document-copilot": "#ff9f0a", designer: "#ff6b6b",
};

function ModalWrap({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 40 }}
      onClick={onClose}
    >
      <div style={{ width: "100%", maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function DeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onCancel}
    >
      <div className="card" style={{ width: 380, padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Delete?</h2>
        <p style={{ fontSize: 13, color: "var(--fg-3)", marginBottom: 20 }}>
          "{name}" will be permanently deleted. This cannot be undone.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="pill-btn" onClick={onCancel}>Cancel</button>
          <button
            className="pill-btn"
            style={{ background: "#ff3b30", color: "#fff", borderColor: "transparent" }}
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceLibrary() {
  const [tab, setTab] = useState<Tab>("agents");
  const [agents, setAgents] = useState<LibraryAgent[]>([]);
  const [mcps, setMcps] = useState<LibraryMCP[]>([]);
  const [skills, setSkills] = useState<LibrarySkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showAgentForm, setShowAgentForm] = useState<LibraryAgent | true | null>(null);
  const [showMcpForm, setShowMcpForm] = useState<LibraryMCP | true | null>(null);
  const [showSkillForm, setShowSkillForm] = useState<LibrarySkill | true | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; id: string; type: Tab } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([listLibraryAgents(), listLibraryMCPs(), listLibrarySkills()])
      .then(([a, m, s]) => { setAgents(a); setMcps(m); setSkills(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filteredAgents = useMemo(() =>
    search ? agents.filter((a) => (a.name + " " + (a.description ?? "")).toLowerCase().includes(search.toLowerCase())) : agents,
  [agents, search]);
  const filteredMcps = useMemo(() =>
    search ? mcps.filter((m) => (m.name + " " + (m.description ?? "")).toLowerCase().includes(search.toLowerCase())) : mcps,
  [mcps, search]);
  const filteredSkills = useMemo(() =>
    search ? skills.filter((s) => (s.name + " " + (s.description ?? "")).toLowerCase().includes(search.toLowerCase())) : skills,
  [skills, search]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "agents") { await deleteLibraryAgent(deleteTarget.id); setAgents((a) => a.filter((x) => x.id !== deleteTarget.id)); }
      if (deleteTarget.type === "mcps")   { await deleteLibraryMCP(deleteTarget.id);   setMcps((m)  => m.filter((x) => x.id !== deleteTarget.id)); }
      if (deleteTarget.type === "skills") { await deleteLibrarySkill(deleteTarget.id); setSkills((s) => s.filter((x) => x.id !== deleteTarget.id)); }
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  const cloneAgent = async (id: string) => {
    try {
      const cloned = await cloneLibraryAgent(id);
      setAgents((a) => [...a, cloned]);
      toast.success("Cloned");
    } catch {
      toast.error("Failed to clone");
    }
  };

  const counts = { agents: agents.length, mcps: mcps.length, skills: skills.length };

  return (
    <div className="main-scroll">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 className="h-page" style={{ margin: 0, flex: 1 }}>Library</h1>
        <button
          className="pill-btn"
          style={{ background: "var(--accent-1)", color: "#fff", borderColor: "transparent" }}
          onClick={() => {
            if (tab === "agents") setShowAgentForm(true);
            if (tab === "mcps")   setShowMcpForm(true);
            if (tab === "skills") setShowSkillForm(true);
          }}
        >
          <Icon name="plus" size="sm" /> New {tab === "agents" ? "Agent" : tab === "mcps" ? "MCP" : "Skill"}
        </button>
      </div>
      <p className="sub-page">Reusable agents, MCP servers, and skills across all projects</p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "0.5px solid var(--hairline)", paddingBottom: 0 }}>
        {(["agents", "mcps", "skills"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 14px", fontSize: 13, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--fg)" : "var(--fg-3)",
              background: "none", border: "none", cursor: "pointer",
              borderBottom: tab === t ? "2px solid var(--accent-1)" : "2px solid transparent",
              marginBottom: -1, transition: "color 0.15s",
            }}
          >
            {t === "agents" ? "Agents" : t === "mcps" ? "MCP Servers" : "Skills"}
            {" "}
            <span style={{ fontSize: 11, color: "var(--fg-3)" }}>({counts[t]})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="card" style={{ padding: "8px 12px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="search" size="sm" style={{ color: "var(--fg-3)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${tab}…`}
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--fg)", fontSize: 13 }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ color: "var(--fg-3)", fontSize: 11, padding: "2px 6px", cursor: "pointer" }}>✕</button>
        )}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>Loading…</div>}

      {/* Agents tab */}
      {!loading && tab === "agents" && (
        filteredAgents.length === 0
          ? <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>No agents found.</div>
          : <div className="grid-3">
              {filteredAgents.map((a) => (
                <div key={a.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: ROLE_COLOR[a.role as AgentRole] ?? "#0a84ff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, color: "#fff", fontSize: 14,
                    }}>
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 2 }}>
                        {a.role} · {a.usage_count} use{a.usage_count !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  {a.description && (
                    <p style={{ fontSize: 12.5, color: "var(--fg-2)", margin: "0 0 10px", lineHeight: 1.5,
                      overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                      WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                      {a.description}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="pill-btn" style={{ fontSize: 11 }} onClick={() => setShowAgentForm(a)}>Edit</button>
                    <button className="pill-btn" style={{ fontSize: 11 }} onClick={() => void cloneAgent(a.id)}>Clone</button>
                    <button className="pill-btn" style={{ fontSize: 11, borderColor: "#ff3b30", color: "#ff3b30" }}
                      onClick={() => setDeleteTarget({ id: a.id, name: a.name, type: "agents" })}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
      )}

      {/* MCPs tab */}
      {!loading && tab === "mcps" && (
        filteredMcps.length === 0
          ? <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>No MCP servers found.</div>
          : <div className="grid-3">
              {filteredMcps.map((m) => (
                <div key={m.id} className="card" style={{ padding: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginBottom: 8 }}>
                    {m.command} · {m.usage_count} use{m.usage_count !== 1 ? "s" : ""}
                  </div>
                  {m.description && (
                    <p style={{ fontSize: 12.5, color: "var(--fg-2)", margin: "0 0 10px", lineHeight: 1.5,
                      overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                      WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                      {m.description}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="pill-btn" style={{ fontSize: 11 }} onClick={() => setShowMcpForm(m)}>Edit</button>
                    <button className="pill-btn" style={{ fontSize: 11, borderColor: "#ff3b30", color: "#ff3b30" }}
                      onClick={() => setDeleteTarget({ id: m.id, name: m.name, type: "mcps" })}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
      )}

      {/* Skills tab */}
      {!loading && tab === "skills" && (
        filteredSkills.length === 0
          ? <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>No skills found.</div>
          : <div className="grid-3">
              {filteredSkills.map((s) => (
                <div key={s.id} className="card" style={{ padding: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginBottom: 8 }}>
                    {s.usage_count} use{s.usage_count !== 1 ? "s" : ""}
                  </div>
                  {s.description && (
                    <p style={{ fontSize: 12.5, color: "var(--fg-2)", margin: "0 0 10px", lineHeight: 1.5,
                      overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                      WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                      {s.description}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="pill-btn" style={{ fontSize: 11 }} onClick={() => setShowSkillForm(s)}>Edit</button>
                    <button className="pill-btn" style={{ fontSize: 11, borderColor: "#ff3b30", color: "#ff3b30" }}
                      onClick={() => setDeleteTarget({ id: s.id, name: s.name, type: "skills" })}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
      )}

      {/* Modals */}
      {showAgentForm && (
        <ModalWrap onClose={() => setShowAgentForm(null)}>
          <LibraryAgentForm
            initialData={showAgentForm !== true ? showAgentForm : undefined}
            onSaved={(a) => { setAgents((prev) => showAgentForm !== true ? prev.map((x) => x.id === a.id ? a : x) : [...prev, a]); setShowAgentForm(null); }}
            onCancel={() => setShowAgentForm(null)}
          />
        </ModalWrap>
      )}
      {showMcpForm && (
        <ModalWrap onClose={() => setShowMcpForm(null)}>
          <LibraryMCPForm
            initialData={showMcpForm !== true ? showMcpForm : undefined}
            onSaved={(m) => { setMcps((prev) => showMcpForm !== true ? prev.map((x) => x.id === m.id ? m : x) : [...prev, m]); setShowMcpForm(null); }}
            onCancel={() => setShowMcpForm(null)}
          />
        </ModalWrap>
      )}
      {showSkillForm && (
        <ModalWrap onClose={() => setShowSkillForm(null)}>
          <LibrarySkillForm
            initialData={showSkillForm !== true ? showSkillForm : undefined}
            onSaved={(s) => { setSkills((prev) => showSkillForm !== true ? prev.map((x) => x.id === s.id ? s : x) : [...prev, s]); setShowSkillForm(null); }}
            onCancel={() => setShowSkillForm(null)}
          />
        </ModalWrap>
      )}
      {deleteTarget && (
        <DeleteConfirm name={deleteTarget.name} onConfirm={() => void confirmDelete()} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
