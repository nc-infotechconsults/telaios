import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import * as api from "../../lib/api";
import type { Document, Project, ProjectMember, Repository, User } from "../../types";

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateStr(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function relativeTime(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dateStr(d);
}

function projectColor(idx: number) {
  return PROJECT_COLORS[idx % PROJECT_COLORS.length];
}

function ownerFromMembers(members: ProjectMember[]): string {
  const owner = members.find((m) => m.role === "owner");
  if (!owner) return "—";
  return owner.user.display_name || owner.user.email;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectCardData {
  project: Project;
  repos: Repository[];
  members: ProjectMember[];
  documents: Document[];
  messageCount: number;
  colorIdx: number;
}

interface MenuState {
  projectId: string;
  x: number;
  y: number;
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({ icon, value, label }: { icon: string; value: number | string; label: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 8,
      background: "var(--glass-weak)",
      border: "0.5px solid var(--hairline)",
    }}>
      <span style={{ fontSize: 11 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>{value}</span>
      <span style={{ fontSize: 10.5, color: "var(--fg-3)" }}>{label}</span>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({
  data,
  onMenuOpen,
  onClick,
}: {
  data: ProjectCardData;
  onMenuOpen: (e: React.MouseEvent, id: string) => void;
  onClick: (id: string) => void;
}) {
  const { project: p, repos, members, documents, messageCount, colorIdx } = data;
  const color = projectColor(colorIdx);
  const sc = STATUS_COLOR[p.status];
  const owner = ownerFromMembers(members);
  const lastActivity = p.updated_at || p.created_at;
  const ownerInitial = owner !== "—" ? owner.charAt(0).toUpperCase() : "?";

  return (
    <div
      className="card project-card"
      onClick={() => onClick(p.id)}
      style={{
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
    >
      {/* Colored accent bar */}
      <div style={{ height: 3, background: color, flexShrink: 0 }} />

      <div style={{ padding: "16px 16px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Header: avatar, name, status, menu */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: color, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, color: "#fff", fontSize: 15,
          }}>
            {p.name.charAt(0).toUpperCase()}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 600, fontSize: 14,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              marginBottom: 4, color: "var(--fg)",
            }}>
              {p.name}
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 20,
              background: sc.bg, color: sc.fg,
              fontSize: 10.5, fontWeight: 600,
            }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: sc.fg }} />
              {STATUS_LABEL[p.status]}
            </span>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onMenuOpen(e, p.id); }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--fg-3)", padding: "2px 6px", borderRadius: 6,
              fontSize: 16, lineHeight: 1, flexShrink: 0,
            }}
            title="More actions"
          >
            ⋯
          </button>
        </div>

        {/* Owner */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, color: "#fff", fontSize: 9,
          }}>
            {ownerInitial}
          </div>
          <span style={{
            fontSize: 12, color: "var(--fg-2)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {owner}
          </span>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          <StatPill icon="⎇" value={repos.length} label="repos" />
          <StatPill icon="📄" value={documents.length} label="docs" />
          <StatPill icon="👥" value={members.length} label="members" />
          <StatPill icon="💬" value={messageCount} label="msgs" />
        </div>

        {/* Dates */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          paddingTop: 8, borderTop: "0.5px solid var(--hairline)",
          marginTop: "auto",
        }}>
          <div style={{ fontSize: 11, color: "var(--fg-4)" }}>
            <span style={{ color: "var(--fg-3)" }}>Activity</span>
            {" "}{relativeTime(lastActivity)}
          </div>
          <div style={{ fontSize: 11, color: "var(--fg-4)" }}>
            <span style={{ color: "var(--fg-3)" }}>Created</span>
            {" "}{dateStr(p.created_at)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Owner Selector ───────────────────────────────────────────────────────────

function OwnerSelector({
  users,
  value,
  onChange,
  inputStyle,
}: {
  users: User[];
  value: string;
  onChange: (id: string) => void;
  inputStyle: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selectedUser = users.find((u) => u.id === value);

  const filtered = q
    ? users.filter((u) =>
        (u.display_name || u.email).toLowerCase().includes(q.toLowerCase()) ||
        u.email.toLowerCase().includes(q.toLowerCase())
      )
    : users;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          ...inputStyle,
          textAlign: "left", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        }}
      >
        {selectedUser ? (
          <>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, color: "#fff", fontSize: 9,
            }}>
              {(selectedUser.display_name || selectedUser.email).charAt(0).toUpperCase()}
            </div>
            <span style={{ flex: 1, fontSize: 13, color: "var(--fg)" }}>
              {selectedUser.display_name || selectedUser.email}
            </span>
          </>
        ) : (
          <span style={{ color: "var(--fg-3)", fontSize: 13 }}>Select owner…</span>
        )}
        <span style={{ color: "var(--fg-3)", fontSize: 10, marginLeft: "auto" }}>▾</span>
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            zIndex: 200, maxHeight: 220, overflow: "hidden",
            display: "flex", flexDirection: "column",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search users…"
              autoFocus
              style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }}
            />
          </div>
          <div style={{ overflowY: "auto", padding: "4px 0 8px" }}>
            {filtered.length === 0 && (
              <div style={{ padding: "8px 16px", fontSize: 12, color: "var(--fg-3)" }}>No users found</div>
            )}
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { onChange(u.id); setOpen(false); setQ(""); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "7px 14px",
                  background: u.id === value ? "var(--hover)" : "none",
                  border: "none", cursor: "pointer", textAlign: "left",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--hover)"; }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    u.id === value ? "var(--hover)" : "none";
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, color: "#fff", fontSize: 9,
                }}>
                  {(u.display_name || u.email).charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {u.display_name || u.email}
                  </div>
                  {u.display_name && (
                    <div style={{ fontSize: 11, color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.email}
                    </div>
                  )}
                </div>
                {u.id === value && <span style={{ fontSize: 11, color: "#30d158" }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Project Form Modal ───────────────────────────────────────────────────────

interface ProjectFormProps {
  mode: "create" | "edit";
  initialName?: string;
  initialDesc?: string;
  initialOwnerId?: string;
  users: User[];
  saving: boolean;
  onSave: (name: string, desc: string, ownerId: string) => void;
  onClose: () => void;
}

function ProjectFormModal({
  mode,
  initialName = "",
  initialDesc = "",
  initialOwnerId = "",
  users,
  saving,
  onSave,
  onClose,
}: ProjectFormProps) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);
  const [ownerId, setOwnerId] = useState(initialOwnerId);

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box" as const, padding: "8px 12px", borderRadius: 8,
    border: "0.5px solid var(--hairline)", background: "var(--glass-weak)",
    color: "var(--fg)", fontSize: 13, outline: "none",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 440, padding: 24, boxShadow: "var(--shadow-sm)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>
          {mode === "create" ? "New Project" : "Edit Project"}
        </h2>
        <p style={{ fontSize: 12.5, color: "var(--fg-3)", marginBottom: 20 }}>
          {mode === "create" ? "Start a new AI-assisted planning session" : "Update project details"}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 4 }}>
              Project name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. E-commerce API refactor"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && name.trim() && !saving && onSave(name.trim(), desc.trim(), ownerId)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 4 }}>
              Description
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What are you building? Any relevant context…"
              rows={3}
              style={{ ...inputStyle, resize: "none" }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 4 }}>
              Owner
            </label>
            <OwnerSelector
              users={users}
              value={ownerId}
              onChange={setOwnerId}
              inputStyle={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
          <button className="pill-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="pill-btn"
            data-primary="true"
            style={{ opacity: (!name.trim() || saving) ? 0.5 : 1 }}
            onClick={() => onSave(name.trim(), desc.trim(), ownerId)}
            disabled={!name.trim() || saving}
          >
            {saving
              ? (mode === "create" ? "Creating…" : "Saving…")
              : (mode === "create" ? "Create & Start" : "Save Changes")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkspaceProjects() {
  const [cards, setCards] = useState<ProjectCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [users, setUsers] = useState<User[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    api.listUsers().catch(() => [] as User[]).then(setUsers);
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getProjects({ q: debouncedSearch || undefined })
      .then(async ({ items, total: t }) => {
        setTotal(t);
        const cardData = await Promise.all(
          items.map(async (p, idx) => {
            const [repos, members, documents, convHistory] = await Promise.all([
              api.getRepositories(p.id).catch(() => [] as Repository[]),
              api.listProjectMembers(p.id).catch(() => [] as ProjectMember[]),
              api.listDocuments(p.id).catch(() => [] as Document[]),
              api.getConversationHistory(p.id, { limit: 1 }).catch(() => ({ messages: [], total: 0 })),
            ]);
            return { project: p, repos, members, documents, messageCount: convHistory.total, colorIdx: idx };
          })
        );
        setCards(cardData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

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

  const filteredCards = statusFilter === "all"
    ? cards
    : cards.filter((c) => c.project.status === statusFilter);

  const editingCard = editingId ? cards.find((c) => c.project.id === editingId) ?? null : null;

  function openContextMenu(e: React.MouseEvent, projectId: string) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ projectId, x: rect.right - 160, y: rect.bottom + 4 });
  }

  async function handleArchive(id: string) {
    setArchiving(id);
    setMenu(null);
    try {
      const updated = await api.updateProject(id, { status: "archived" });
      setCards((prev) => prev.map((c) => c.project.id === id ? { ...c, project: updated } : c));
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
    try {
      await api.deleteProject(id);
      setCards((prev) => prev.filter((c) => c.project.id !== id));
      setTotal((t) => t - 1);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  }

  async function handleCreate(name: string, desc: string, ownerId: string) {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const p = await api.createProject({ name: name.trim(), description: desc.trim() });
      if (ownerId) {
        await api.addProjectMember(p.id, { user_id: ownerId, role: "owner" }).catch(console.error);
      }
      window.location.href = `/projects/${p.id}`;
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  async function handleEdit(name: string, desc: string, ownerId: string) {
    if (!editingId || !name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await api.updateProject(editingId, { name: name.trim(), description: desc.trim() });
      if (ownerId) {
        const card = cards.find((c) => c.project.id === editingId);
        const currentOwner = card?.members.find((m) => m.role === "owner");
        if (!currentOwner || currentOwner.user_id !== ownerId) {
          await api.addProjectMember(editingId, { user_id: ownerId, role: "owner" }).catch(console.error);
          const members = await api.listProjectMembers(editingId).catch(() => card?.members ?? []);
          setCards((prev) => prev.map((c) => c.project.id === editingId ? { ...c, project: updated, members } : c));
        } else {
          setCards((prev) => prev.map((c) => c.project.id === editingId ? { ...c, project: updated } : c));
        }
      } else {
        setCards((prev) => prev.map((c) => c.project.id === editingId ? { ...c, project: updated } : c));
      }
      setEditingId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

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
        <button className="pill-btn" data-primary="true" onClick={() => setShowCreate(true)}>
          <Icon name="plus" size="sm" /> New Project
        </button>
      </div>
      <p className="sub-page" style={{ marginBottom: 20 }}>
        <b style={{ color: "var(--fg-2)" }}>{total}</b> project{total !== 1 ? "s" : ""} — plan and execute software tasks with AI agents
      </p>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
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

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--fg-3)" }}>Loading…</div>
      )}

      {/* Empty state */}
      {!loading && filteredCards.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--fg-3)" }}>
          {debouncedSearch
            ? `No projects match "${debouncedSearch}"`
            : statusFilter !== "all"
              ? `No ${statusFilter} projects`
              : (
                <div>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
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

      {/* Card grid */}
      {!loading && filteredCards.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}>
          {filteredCards.map((c) => (
            <div
              key={c.project.id}
              style={{
                opacity: (deleting === c.project.id || archiving === c.project.id) ? 0.4 : 1,
                transition: "opacity 0.15s",
              }}
            >
              <ProjectCard
                data={c}
                onMenuOpen={openContextMenu}
                onClick={(id) => { window.location.href = `/projects/${id}`; }}
              />
            </div>
          ))}
        </div>
      )}

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
            { label: "Open project", icon: "↗", danger: false, onClick: () => { window.location.href = `/projects/${menu.projectId}`; setMenu(null); } },
            { label: "Edit", icon: "✎", danger: false, onClick: () => { setEditingId(menu.projectId); setMenu(null); } },
            { label: "Archive", icon: "⬓", danger: false, onClick: () => void handleArchive(menu.projectId) },
            { label: "Delete", icon: "✕", danger: true, onClick: () => void handleDelete(menu.projectId) },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", textAlign: "left",
                padding: "8px 14px", background: "none", border: "none",
                fontSize: 13, cursor: "pointer",
                color: item.danger ? "#ff375f" : "var(--fg)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >
              <span style={{ fontSize: 13, width: 16, flexShrink: 0, opacity: 0.6 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <ProjectFormModal
          mode="create"
          users={users}
          saving={creating}
          onSave={(name, desc, ownerId) => void handleCreate(name, desc, ownerId)}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit modal */}
      {editingId && editingCard && (
        <ProjectFormModal
          mode="edit"
          initialName={editingCard.project.name}
          initialDesc={editingCard.project.description}
          initialOwnerId={editingCard.members.find((m) => m.role === "owner")?.user_id ?? ""}
          users={users}
          saving={saving}
          onSave={(name, desc, ownerId) => void handleEdit(name, desc, ownerId)}
          onClose={() => setEditingId(null)}
        />
      )}

      <style>{`
        .project-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        }
      `}</style>
    </div>
  );
}
