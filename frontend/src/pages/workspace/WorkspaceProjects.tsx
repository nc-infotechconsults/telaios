import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import * as api from "../../lib/api";
import type { Project, ProjectMember, Repository } from "../../types";

const PROJECT_COLORS = [
  "#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#ff375f", "#5e5ce6",
  "#32ade6", "#ff6961", "#ffd60a", "#34c759",
];

type StatusFilter = "all" | Project["status"];

const STATUS_LABEL: Record<Project["status"], string> = {
  active: "Active",
  archived: "Archived",
  closed: "Closed",
};

const STATUS_COLOR: Record<Project["status"], { bg: string; fg: string }> = {
  active: { bg: "rgba(48,209,88,0.18)", fg: "#30d158" },
  archived: { bg: "rgba(255,159,10,0.18)", fg: "#ff9f0a" },
  closed: { bg: "rgba(120,120,128,0.18)", fg: "#8e8e93" },
};

function dateStr(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function projectColor(idx: number) {
  return PROJECT_COLORS[idx % PROJECT_COLORS.length];
}

interface ProjectRowData {
  project: Project;
  repos: Repository[];
  members: ProjectMember[];
  colorIdx: number;
}

interface MenuState {
  projectId: string;
  x: number;
  y: number;
}

export default function WorkspaceProjects() {
  const [rows, setRows] = useState<ProjectRowData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerMembers, setDrawerMembers] = useState<ProjectMember[]>([]);
  const [drawerMembersLoading, setDrawerMembersLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  const lastClick = useRef<{ id: string; time: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load projects + repos + members
  useEffect(() => {
    setLoading(true);
    api.getProjects({ q: debouncedSearch || undefined })
      .then(async ({ items, total: t }) => {
        setTotal(t);
        const rowData = await Promise.all(
          items.map(async (p, idx) => {
            const [repos, members] = await Promise.all([
              api.getRepositories(p.id).catch(() => [] as Repository[]),
              api.listProjectMembers(p.id).catch(() => [] as ProjectMember[]),
            ]);
            return { project: p, repos, members, colorIdx: idx };
          })
        );
        setRows(rowData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  // Close menu on outside click
  useEffect(() => {
    if (!menu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menu]);

  const filteredRows = statusFilter === "all"
    ? rows
    : rows.filter((r) => r.project.status === statusFilter);

  const selectedRow = rows.find((r) => r.project.id === selectedId) ?? null;

  function openDrawer(id: string) {
    setSelectedId(id);
    setDrawerMembers([]);
    setDrawerMembersLoading(true);
    api.listProjectMembers(id)
      .then(setDrawerMembers)
      .catch(console.error)
      .finally(() => setDrawerMembersLoading(false));
  }

  function handleRowClick(id: string) {
    const now = Date.now();
    if (lastClick.current?.id === id && now - lastClick.current.time < 400) {
      window.location.href = `/projects/${id}`;
    } else {
      lastClick.current = { id, time: now };
      openDrawer(id);
    }
  }

  function openContextMenu(e: React.MouseEvent, projectId: string) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ projectId, x: e.clientX, y: e.clientY });
  }

  async function handleArchive(id: string) {
    setArchiving(id);
    setMenu(null);
    try {
      const updated = await api.updateProject(id, { status: "archived" });
      setRows((prev) => prev.map((r) => r.project.id === id
        ? { ...r, project: updated }
        : r
      ));
      if (selectedId === id && selectedRow) {
        // refresh drawer
        openDrawer(id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setArchiving(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this project? This cannot be undone.")) return;
    setDeleting(id);
    setMenu(null);
    if (selectedId === id) setSelectedId(null);
    try {
      await api.deleteProject(id);
      setRows((prev) => prev.filter((r) => r.project.id !== id));
      setTotal((t) => t - 1);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  }

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const p = await api.createProject({ name: newName.trim(), description: newDesc.trim() });
      window.location.href = `/projects/${p.id}`;
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  function closeCreate() {
    setShowCreate(false);
    setNewName("");
    setNewDesc("");
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 8,
    border: "0.5px solid var(--hairline)", background: "var(--glass-weak)",
    color: "var(--fg)", fontSize: 13, outline: "none",
  };

  const statusChips: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "all" },
    { label: "Active", value: "active" },
    { label: "Archived", value: "archived" },
    { label: "Closed", value: "closed" },
  ];

  return (
    <div className="main-scroll" style={{ position: "relative" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 className="h-page" style={{ margin: 0, flex: 1 }}>Projects</h1>
        <button
          className="pill-btn"
          data-primary="true"
          onClick={() => setShowCreate(true)}
        >
          <Icon name="plus" size="sm" /> New Project
        </button>
      </div>
      <p className="sub-page" style={{ marginBottom: 20 }}>
        <b style={{ color: "var(--fg-2)" }}>{total}</b> project{total !== 1 ? "s" : ""} — plan and execute software tasks with AI agents
      </p>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div className="card" style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 180 }}>
          <Icon name="search" size="sm" style={{ color: "var(--fg-3)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--fg)", fontSize: 13 }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--fg-3)", fontSize: 11, padding: "2px 6px", cursor: "pointer", background: "none", border: "none" }}>✕</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {statusChips.map((chip) => (
            <button
              key={chip.value}
              className="pill-btn"
              onClick={() => setStatusFilter(chip.value)}
              style={{
                background: statusFilter === chip.value ? "var(--accent-1)" : "var(--glass-weak)",
                color: statusFilter === chip.value ? "#fff" : "var(--fg-2)",
                borderColor: statusFilter === chip.value ? "transparent" : "var(--hairline)",
                transition: "all 0.15s",
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginRight: selectedId ? 500 : 0, transition: "margin-right 0.25s" }}>
        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 110px 80px 80px 120px 44px",
          padding: "10px 16px",
          borderBottom: "0.5px solid var(--hairline)",
          fontSize: 11.5, fontWeight: 600, color: "var(--fg-3)",
          textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          <span>Name</span>
          <span>Status</span>
          <span style={{ textAlign: "center" }}>Repos</span>
          <span style={{ textAlign: "center" }}>Members</span>
          <span>Created</span>
          <span></span>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>Loading…</div>
        )}

        {!loading && filteredRows.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--fg-3)" }}>
            {debouncedSearch
              ? `No projects match "${debouncedSearch}"`
              : statusFilter !== "all"
                ? `No ${statusFilter} projects`
                : (
                  <div>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🚀</div>
                    <p style={{ fontWeight: 600, fontSize: 15, color: "var(--fg)", marginBottom: 4 }}>No projects yet</p>
                    <p style={{ fontSize: 13, marginBottom: 16 }}>Create your first project to get started.</p>
                    <button className="pill-btn" data-primary="true" onClick={() => setShowCreate(true)}>
                      Create First Project
                    </button>
                  </div>
                )
            }
          </div>
        )}

        {!loading && filteredRows.map((r, idx) => {
          const { project: p, repos, members } = r;
          const color = projectColor(r.colorIdx);
          const sc = STATUS_COLOR[p.status];
          const isSelected = selectedId === p.id;
          const isDeleting = deleting === p.id;
          const isArchiving = archiving === p.id;

          return (
            <div
              key={p.id}
              onClick={() => handleRowClick(p.id)}
              onDoubleClick={() => { window.location.href = `/projects/${p.id}`; }}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px 80px 80px 120px 44px",
                padding: "12px 16px",
                alignItems: "center",
                borderTop: idx > 0 ? "0.5px solid var(--hairline)" : undefined,
                background: isSelected ? "var(--hover)" : "transparent",
                cursor: "pointer",
                transition: "background 0.12s",
                opacity: isDeleting || isArchiving ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--hover)"; }}
              onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
            >
              {/* Name + dot */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, background: color, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, color: "#fff", fontSize: 12,
                }}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
              </div>

              {/* Status */}
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 9px", borderRadius: 20,
                background: sc.bg, color: sc.fg,
                fontSize: 11.5, fontWeight: 600,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc.fg, flexShrink: 0 }} />
                {STATUS_LABEL[p.status]}
              </span>

              {/* Repos */}
              <span style={{ textAlign: "center", fontSize: 13, color: "var(--fg-2)" }}>{repos.length}</span>

              {/* Members */}
              <span style={{ textAlign: "center", fontSize: 13, color: "var(--fg-2)" }}>{members.length}</span>

              {/* Created */}
              <span style={{ fontSize: 12, color: "var(--fg-3)" }}>{dateStr(p.created_at)}</span>

              {/* Actions */}
              <button
                onClick={(e) => openContextMenu(e, p.id)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--fg-3)", padding: "4px 8px", borderRadius: 6,
                  fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                }}
                title="More actions"
              >
                ⋯
              </button>
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {menu && (
        <div
          ref={menuRef}
          className="card"
          style={{
            position: "fixed", top: menu.y, left: menu.x, zIndex: 2000,
            minWidth: 160, padding: "4px 0", boxShadow: "var(--shadow-sm)",
          }}
        >
          {[
            {
              label: "Open project",
              onClick: () => { window.location.href = `/projects/${menu.projectId}`; },
            },
            {
              label: "Archive",
              onClick: () => void handleArchive(menu.projectId),
            },
            {
              label: "Delete",
              onClick: () => void handleDelete(menu.projectId),
              danger: true,
            },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setMenu(null); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 16px", background: "none", border: "none",
                fontSize: 13, cursor: "pointer",
                color: item.danger ? "#ff375f" : "var(--fg)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Slide-over drawer */}
      {selectedId && selectedRow && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelectedId(null)}
            style={{ position: "fixed", inset: 0, zIndex: 900 }}
          />
          <div
            className="glass"
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0,
              width: 480, zIndex: 1000,
              background: "var(--glass-strong)", backdropFilter: "blur(20px) saturate(1.6)",
              borderLeft: "0.5px solid var(--hairline)",
              display: "flex", flexDirection: "column",
              animation: "slideInRight 0.22s ease",
            }}
          >
            {/* Drawer header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 16px",
              borderBottom: "0.5px solid var(--hairline)",
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: projectColor(selectedRow.colorIdx),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, color: "#fff", fontSize: 20,
              }}>
                {selectedRow.project.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedRow.project.name}
                </div>
                {(() => {
                  const sc = STATUS_COLOR[selectedRow.project.status];
                  return (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 8px", borderRadius: 20,
                      background: sc.bg, color: sc.fg,
                      fontSize: 11, fontWeight: 600, marginTop: 3,
                    }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: sc.fg }} />
                      {STATUS_LABEL[selectedRow.project.status]}
                    </span>
                  );
                })()}
              </div>
              <button
                onClick={() => setSelectedId(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", fontSize: 18, padding: 4, borderRadius: 6 }}
              >
                ✕
              </button>
            </div>

            {/* Drawer body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              {/* Description */}
              {selectedRow.project.description ? (
                <p style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.6, marginBottom: 20 }}>
                  {selectedRow.project.description}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "var(--fg-4)", fontStyle: "italic", marginBottom: 20 }}>No description.</p>
              )}

              {/* Meta */}
              <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
                {[
                  { label: "Repos", value: selectedRow.repos.length },
                  { label: "Members", value: selectedRow.members.length },
                  { label: "Created", value: dateStr(selectedRow.project.created_at) },
                ].map((m) => (
                  <div key={m.label} className="card" style={{ padding: "10px 16px", flex: 1, minWidth: 80, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>{m.value}</div>
                    <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 2 }}>{m.label}</div>
                  </div>
                ))}
              </div>

              {/* Status control */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fg-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Change Status</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["active", "archived", "closed"] as Project["status"][]).map((s) => {
                    const sc = STATUS_COLOR[s];
                    const active = selectedRow.project.status === s;
                    return (
                      <button
                        key={s}
                        className="pill-btn"
                        onClick={() => void (async () => {
                          try {
                            const updated = await api.updateProject(selectedRow.project.id, { status: s });
                            setRows((prev) => prev.map((r) => r.project.id === updated.id ? { ...r, project: updated } : r));
                          } catch (e) { console.error(e); }
                        })()}
                        style={{
                          background: active ? sc.bg : "var(--glass-weak)",
                          color: active ? sc.fg : "var(--fg-2)",
                          borderColor: active ? sc.fg + "44" : "var(--hairline)",
                          fontWeight: active ? 700 : 400,
                        }}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Members section */}
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fg-3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Members
                </div>
                {drawerMembersLoading ? (
                  <div style={{ fontSize: 12, color: "var(--fg-3)" }}>Loading members…</div>
                ) : drawerMembers.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--fg-4)" }}>No members yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {drawerMembers.map((m) => (
                      <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                          background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 600, color: "#fff", fontSize: 11,
                        }}>
                          {(m.user.display_name || m.user.email).charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.user.display_name || m.user.email}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{m.user.email}</div>
                        </div>
                        <span style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "capitalize", background: "var(--glass-weak)", padding: "2px 8px", borderRadius: 20 }}>
                          {m.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer footer */}
            <div style={{ padding: "16px 20px", borderTop: "0.5px solid var(--hairline)", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="pill-btn"
                data-primary="true"
                style={{ flex: 1 }}
                onClick={() => { window.location.href = `/projects/${selectedRow.project.id}`; }}
              >
                <Icon name="arrow" size="sm" /> Open Project
              </button>
              <button
                className="pill-btn"
                onClick={() => void handleArchive(selectedRow.project.id)}
                disabled={archiving === selectedRow.project.id}
              >
                Archive
              </button>
              <button
                className="pill-btn danger"
                onClick={() => void handleDelete(selectedRow.project.id)}
                disabled={deleting === selectedRow.project.id}
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}

      {/* New Project modal */}
      {showCreate && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={closeCreate}
        >
          <div
            className="card"
            style={{ width: 420, padding: 24, boxShadow: "var(--shadow-sm)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, margin: "0 0 4px" }}>New Project</h2>
            <p style={{ fontSize: 12.5, color: "var(--fg-3)", marginBottom: 20 }}>Start a new AI-assisted planning session</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 4 }}>Project name *</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. E-commerce API refactor"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 4 }}>Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What are you building? Any relevant context…"
                  rows={3}
                  style={{ ...inputStyle, resize: "none" }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button className="pill-btn" onClick={closeCreate} disabled={creating}>Cancel</button>
              <button
                className="pill-btn"
                data-primary="true"
                style={{ opacity: (!newName.trim() || creating) ? 0.5 : 1 }}
                onClick={() => void handleCreate()}
                disabled={!newName.trim() || creating}
              >
                {creating ? "Creating…" : "Create & Start"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
