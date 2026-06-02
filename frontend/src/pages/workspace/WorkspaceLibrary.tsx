import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { AppModal } from "../../components/AppModal";
import {
  deleteLibraryMCP, deleteLibrarySkill,
  listLibraryMCPs, listLibrarySkills,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import type { LibraryMCP, LibrarySkill } from "../../types";
import LibraryMCPForm from "../../components/library/LibraryMCPForm";
import LibrarySkillForm from "../../components/library/LibrarySkillForm";

type Tab = "mcps" | "skills";

export default function WorkspaceLibrary() {
  const [tab, setTab] = useState<Tab>("mcps");
  const [mcps, setMcps] = useState<LibraryMCP[]>([]);
  const [skills, setSkills] = useState<LibrarySkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showMcpForm, setShowMcpForm] = useState<LibraryMCP | true | null>(null);
  const [showSkillForm, setShowSkillForm] = useState<LibrarySkill | true | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; id: string; type: Tab } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([listLibraryMCPs(), listLibrarySkills()])
      .then(([m, s]) => { setMcps(m); setSkills(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filteredMcps = useMemo(() =>
    search ? mcps.filter((m) => (m.name + " " + (m.description ?? "")).toLowerCase().includes(search.toLowerCase())) : mcps,
  [mcps, search]);
  const filteredSkills = useMemo(() =>
    search ? skills.filter((s) => (s.name + " " + (s.description ?? "")).toLowerCase().includes(search.toLowerCase())) : skills,
  [skills, search]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "mcps")   { await deleteLibraryMCP(deleteTarget.id);   setMcps((m)  => m.filter((x) => x.id !== deleteTarget.id)); }
      if (deleteTarget.type === "skills") { await deleteLibrarySkill(deleteTarget.id); setSkills((s) => s.filter((x) => x.id !== deleteTarget.id)); }
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  const counts = { mcps: mcps.length, skills: skills.length };

  return (
    <div className="main-scroll">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 className="h-page" style={{ margin: 0, flex: 1 }}>Library</h1>
        <button
          className="pill-btn"
          style={{ background: "var(--accent-1)", color: "#fff", borderColor: "transparent" }}
          onClick={() => {
            if (tab === "mcps")   setShowMcpForm(true);
            if (tab === "skills") setShowSkillForm(true);
          }}
        >
          <Icon name="plus" size="sm" /> New {tab === "mcps" ? "MCP" : "Skill"}
        </button>
      </div>
      <p className="sub-page">Reusable MCP servers and skills across all projects</p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "0.5px solid var(--hairline)", paddingBottom: 0 }}>
        {(["mcps", "skills"] as Tab[]).map((t) => (
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
            {t === "mcps" ? "MCP Servers" : "Skills"}
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
          <button onClick={() => setSearch("")} style={{ color: "var(--fg-3)", fontSize: 11, padding: "2px 6px", cursor: "pointer" }}><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        )}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>Loading…</div>}

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
      <AppModal
        isOpen={!!showMcpForm}
        onClose={() => setShowMcpForm(null)}
        title={showMcpForm === true ? "New MCP Server" : "Edit MCP Server"}
        width={700}
      >
        {showMcpForm && (
          <LibraryMCPForm
            initialData={showMcpForm !== true ? showMcpForm : undefined}
            onSaved={(m) => { setMcps((prev) => showMcpForm !== true ? prev.map((x) => x.id === m.id ? m : x) : [...prev, m]); setShowMcpForm(null); }}
            onCancel={() => setShowMcpForm(null)}
          />
        )}
      </AppModal>

      <AppModal
        isOpen={!!showSkillForm}
        onClose={() => setShowSkillForm(null)}
        title={showSkillForm === true ? "New Skill" : "Edit Skill"}
        width={700}
      >
        {showSkillForm && (
          <LibrarySkillForm
            initialData={showSkillForm !== true ? showSkillForm : undefined}
            onSaved={(s) => { setSkills((prev) => showSkillForm !== true ? prev.map((x) => x.id === s.id ? s : x) : [...prev, s]); setShowSkillForm(null); }}
            onCancel={() => setShowSkillForm(null)}
          />
        )}
      </AppModal>

      <AppModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete?"
        width={380}
      >
        {deleteTarget && (
          <>
            <p style={{ fontSize: 13, color: "var(--fg-3)", marginBottom: 20 }}>
              "{deleteTarget.name}" will be permanently deleted. This cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="pill-btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className="pill-btn"
                style={{ background: "#ff3b30", color: "#fff", borderColor: "transparent" }}
                onClick={() => void confirmDelete()}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </AppModal>
    </div>
  );
}
