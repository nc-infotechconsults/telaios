import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { createProject, getProjects, getRepositories } from "../../lib/api";
import type { Project, Repository } from "../../types";

const PROJECT_COLORS = ["#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#ff375f", "#5e5ce6"];

const STATUS_LABEL: Record<Project["status"], string> = {
  planning: "Planning",
  executing: "Executing",
  done: "Done",
};

function dateStr(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function WorkspaceProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [reposByProject, setReposByProject] = useState<Record<string, Repository[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    getProjects({ q: debouncedSearch || undefined })
      .then(({ items, total: t }) => {
        setProjects(items);
        setTotal(t);
        return Promise.all(
          items.map((p) =>
            getRepositories(p.id)
              .then((repos) => ({ pid: p.id, repos }))
              .catch(() => ({ pid: p.id, repos: [] as Repository[] }))
          )
        );
      })
      .then((results) => {
        const byProject: Record<string, Repository[]> = {};
        results.forEach(({ pid, repos }) => { byProject[pid] = repos; });
        setReposByProject(byProject);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const p = await createProject({ name: name.trim(), description: description.trim() });
      window.location.href = `/projects/${p.id}`;
    } finally {
      setCreating(false);
    }
  };

  const closeCreate = () => { setShowCreate(false); setName(""); setDescription(""); };

  return (
    <div className="main-scroll">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 className="h-page" style={{ margin: 0, flex: 1 }}>Projects</h1>
        <button
          className="pill-btn"
          style={{ background: "var(--accent-1)", color: "#fff", borderColor: "transparent" }}
          onClick={() => setShowCreate(true)}
        >
          <Icon name="plus" size="sm" /> New Project
        </button>
      </div>
      <p className="sub-page">
        <b style={{ color: "var(--fg-2)" }}>{total}</b> project{total !== 1 ? "s" : ""} — plan and execute software tasks with AI agents
      </p>

      {/* Search */}
      <div className="card" style={{ padding: "8px 12px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="search" size="sm" style={{ color: "var(--fg-3)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--fg)", fontSize: 13 }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ color: "var(--fg-3)", fontSize: 11, padding: "2px 6px", cursor: "pointer" }}><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>Loading…</div>
      )}

      {!loading && total === 0 && !debouncedSearch && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--fg-3)" }}>
          <i className="fa-solid fa-rocket" aria-hidden="true" style={{ fontSize: 36, marginBottom: 12, display: "block" }} />
          <p style={{ fontWeight: 600, fontSize: 15, color: "var(--fg)", marginBottom: 4 }}>No projects yet</p>
          <p style={{ fontSize: 13, marginBottom: 16 }}>Create your first project to get started.</p>
          <button
            className="pill-btn"
            style={{ background: "var(--accent-1)", color: "#fff", borderColor: "transparent" }}
            onClick={() => setShowCreate(true)}
          >
            Create First Project
          </button>
        </div>
      )}

      {!loading && total === 0 && debouncedSearch && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>
          No projects match "{debouncedSearch}"
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="grid-3">
          {projects.map((p, idx) => {
            const repos = reposByProject[p.id] ?? [];
            const color = PROJECT_COLORS[idx % PROJECT_COLORS.length];
            return (
              <div
                key={p.id}
                className="card"
                style={{ cursor: "pointer", padding: 16 }}
                onClick={() => { window.location.href = `/projects/${p.id}`; }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: color,
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
                      {STATUS_LABEL[p.status]} · {dateStr(p.created_at)}
                    </div>
                  </div>
                </div>
                {p.description && (
                  <p style={{
                    fontSize: 12.5, color: "var(--fg-2)", margin: "0 0 8px", lineHeight: 1.5,
                    overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                    WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                  }}>
                    {p.description}
                  </p>
                )}
                <div style={{ fontSize: 12, color: "var(--fg-3)" }}>
                  {repos.length} repo{repos.length !== 1 ? "s" : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={closeCreate}
        >
          <div
            className="card"
            style={{ width: 420, padding: 24, boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>New Project</h2>
            <p style={{ fontSize: 12.5, color: "var(--fg-3)", marginBottom: 20 }}>Start a new AI-assisted planning session</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 4 }}>Project name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. E-commerce API refactor"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8,
                    border: "0.5px solid var(--hairline)", background: "var(--glass-weak)",
                    color: "var(--fg)", fontSize: 13, outline: "none",
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 4 }}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What are you building? Any relevant context…"
                  rows={3}
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8,
                    border: "0.5px solid var(--hairline)", background: "var(--glass-weak)",
                    color: "var(--fg)", fontSize: 13, outline: "none", resize: "none",
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button className="pill-btn" onClick={closeCreate} disabled={creating}>Cancel</button>
              <button
                className="pill-btn"
                style={{
                  background: "var(--accent-1)", color: "#fff", borderColor: "transparent",
                  opacity: (!name.trim() || creating) ? 0.5 : 1,
                }}
                onClick={() => void handleCreate()}
                disabled={!name.trim() || creating}
              >
                {creating ? "Creating…" : "Create & Start"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
