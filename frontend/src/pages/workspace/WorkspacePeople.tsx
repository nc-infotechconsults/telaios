import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../lib/api";
import type { Project, ProjectMember, User } from "../../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return (
    name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?"
  );
}

function dateStr(d: string): string {
  return new Date(d).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

const ROLE_GRADIENT: Record<string, string> = {
  admin: "linear-gradient(135deg, #bf5af2, #5e5ce6)",
  member: "linear-gradient(135deg, #0a84ff, #32ade6)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "active" | "invited" | "deactivated";

interface PendingInvite {
  id: string;
  name: string;
  email: string;
  invitedAt: string;
}

const STUB_INVITES: PendingInvite[] = [
  { id: "inv-1", name: "Alex Rivera", email: "alex.rivera@example.com", invitedAt: "2026-05-28T10:00:00Z" },
  { id: "inv-2", name: "Jordan Lee", email: "jordan.lee@example.com", invitedAt: "2026-05-30T14:30:00Z" },
  { id: "inv-3", name: "Sam Patel", email: "sam.patel@example.com", invitedAt: "2026-06-01T09:15:00Z" },
];

interface MenuState {
  userId: string;
  x: number;
  y: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface AvatarProps {
  name: string;
  role: string;
  size?: number;
}

function Avatar({ name, role, size = 34 }: AvatarProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: ROLE_GRADIENT[role] ?? ROLE_GRADIENT.member,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 600, color: "#fff", fontSize: size * 0.35,
    }}>
      {initials(name)}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkspacePeople() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("active");
  const [patching, setPatching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Drawer state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [drawerProjects, setDrawerProjects] = useState<{ project: Project; role: string }[]>([]);
  const [drawerProjectsLoading, setDrawerProjectsLoading] = useState(false);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allMemberships, setAllMemberships] = useState<Record<string, ProjectMember[]>>({});

  // Add User modal
  const [showAddUser, setShowAddUser] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState<User["system_role"]>("member");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Confirm delete modal
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Context menu
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Load users
  useEffect(() => {
    setLoading(true);
    api.listUsers()
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Pre-load projects + memberships for drawer
  useEffect(() => {
    api.getProjects({ limit: 200 })
      .then(async ({ items }) => {
        setAllProjects(items);
        const entries = await Promise.all(
          items.map(async (p) => {
            const members = await api.listProjectMembers(p.id).catch(() => [] as ProjectMember[]);
            return { id: p.id, members };
          })
        );
        const map: Record<string, ProjectMember[]> = {};
        entries.forEach(({ id, members }) => { map[id] = members; });
        setAllMemberships(map);
      })
      .catch(console.error);
  }, []);

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

  // Filtered & tabbed users
  const filtered = useMemo(() => {
    let list = users;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((u) =>
        (u.display_name + " " + u.email).toLowerCase().includes(q)
      );
    }
    if (tab === "active") return list.filter((u) => u.is_active);
    if (tab === "deactivated") return list.filter((u) => !u.is_active);
    return list; // invited tab uses stub data
  }, [users, search, tab]);

  const activeCount = users.filter((u) => u.is_active).length;

  // Patch user helper
  const patch = async (id: string, data: Partial<Pick<User, "display_name" | "system_role" | "is_active">>) => {
    setPatching(id);
    try {
      const updated = await api.patchUser(id, data);
      setUsers((prev) => prev.map((u) => u.id === id ? updated : u));
    } catch (err) {
      console.error(err);
    } finally {
      setPatching(null);
    }
  };

  // Delete user
  const handleDelete = async (id: string) => {
    setDeleting(id);
    setConfirmDeleteId(null);
    if (selectedUserId === id) setSelectedUserId(null);
    try {
      await api.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  // Open drawer
  function openDrawer(userId: string) {
    setSelectedUserId(userId);
    setDrawerProjects([]);
    setDrawerProjectsLoading(true);
    const userProjects = allProjects
      .filter((p) => allMemberships[p.id]?.some((m) => m.user_id === userId))
      .map((p) => {
        const membership = allMemberships[p.id]?.find((m) => m.user_id === userId);
        return { project: p, role: membership?.role ?? "viewer" };
      });
    setDrawerProjects(userProjects);
    setDrawerProjectsLoading(false);
  }

  // Add user
  async function handleAddUser() {
    if (!addEmail.trim() || !addPassword.trim() || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const { user: newUser } = await api.createUser({
        email: addEmail.trim(),
        password: addPassword,
        display_name: addDisplayName.trim(),
      });
      if (addRole !== "member") {
        const patched = await api.patchUser(newUser.id, { system_role: addRole });
        setUsers((prev) => [...prev, patched]);
      } else {
        setUsers((prev) => [...prev, newUser]);
      }
      closeAddUser();
    } catch (err) {
      console.error(err);
      setAddError("Failed to create user. Check all fields and try again.");
    } finally {
      setAdding(false);
    }
  }

  function closeAddUser() {
    setShowAddUser(false);
    setAddEmail("");
    setAddDisplayName("");
    setAddPassword("");
    setAddRole("member");
    setAddError(null);
  }

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "8px 12px",
    borderRadius: 8, border: "0.5px solid var(--hairline)",
    background: "var(--glass-weak)", color: "var(--fg)", fontSize: 13, outline: "none",
  };

  const tabs: { label: string; value: Tab; count?: number }[] = [
    { label: "Active", value: "active", count: users.filter((u) => u.is_active).length },
    { label: "Invited", value: "invited", count: STUB_INVITES.length },
    { label: "Deactivated", value: "deactivated", count: users.filter((u) => !u.is_active).length },
  ];

  return (
    <div className="main-scroll" style={{ position: "relative" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 className="h-page" style={{ margin: 0, flex: 1 }}>People</h1>
        <button
          className="pill-btn"
          data-primary="true"
          onClick={() => setShowAddUser(true)}
        >
          <Icon name="plus" size="sm" /> Add User
        </button>
      </div>
      <p className="sub-page" style={{ marginBottom: 20 }}>
        <b style={{ color: "var(--fg-2)" }}>{activeCount}</b> active member{activeCount !== 1 ? "s" : ""} in this workspace
      </p>

      {/* Search + Tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div className="card" style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
          <Icon name="search" size="sm" style={{ color: "var(--fg-3)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--fg)", fontSize: 13 }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--fg-3)", fontSize: 11, padding: "2px 6px", cursor: "pointer", background: "none", border: "none" }}><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map((t) => (
            <button
              key={t.value}
              className="pill-btn"
              onClick={() => setTab(t.value)}
              style={{
                background: tab === t.value ? "var(--accent-1)" : "var(--glass-weak)",
                color: tab === t.value ? "#fff" : "var(--fg-2)",
                borderColor: tab === t.value ? "transparent" : "var(--hairline)",
                transition: "all 0.15s",
              }}
            >
              {t.label}
              {t.count !== undefined && (
                <span style={{
                  marginLeft: 6, background: tab === t.value ? "rgba(255,255,255,0.2)" : "var(--glass)",
                  borderRadius: 20, padding: "1px 6px", fontSize: 11,
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div
        className="card"
        style={{
          padding: 0, overflow: "hidden",
          marginRight: selectedUserId ? 460 : 0,
          transition: "margin-right 0.25s",
        }}
      >
        {/* Table header */}
        {tab !== "invited" && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 140px 80px 100px 44px",
            padding: "10px 16px",
            borderBottom: "0.5px solid var(--hairline)",
            fontSize: 11.5, fontWeight: 600, color: "var(--fg-3)",
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            <span>User</span>
            <span>Role</span>
            <span style={{ textAlign: "center" }}>Status</span>
            <span>Joined</span>
            <span></span>
          </div>
        )}

        {/* Invited tab */}
        {tab === "invited" && (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 80px 80px",
              padding: "10px 16px",
              borderBottom: "0.5px solid var(--hairline)",
              fontSize: 11.5, fontWeight: 600, color: "var(--fg-3)",
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              <span>Invite</span>
              <span>Invited on</span>
              <span></span>
              <span></span>
            </div>
            {STUB_INVITES.filter((inv) =>
              !search || (inv.name + " " + inv.email).toLowerCase().includes(search.toLowerCase())
            ).map((inv, idx) => (
              <div
                key={inv.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 80px 80px",
                  padding: "12px 16px", alignItems: "center",
                  borderTop: idx > 0 ? "0.5px solid var(--hairline)" : undefined,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: "linear-gradient(135deg, #ff9f0a, #ff375f)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 600, color: "#fff", fontSize: 12,
                  }}>
                    {initials(inv.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.name}</div>
                    <div style={{ fontSize: 12, color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.email}</div>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: "var(--fg-3)" }}>{dateStr(inv.invitedAt)}</span>
                <button className="pill-btn" style={{ fontSize: 12 }} onClick={() => {}}>Resend</button>
                <button className="pill-btn danger" style={{ fontSize: 12 }} onClick={() => {}}>Revoke</button>
              </div>
            ))}
            {STUB_INVITES.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 13 }}>No pending invites.</div>
            )}
          </>
        )}

        {/* Active / Deactivated tabs */}
        {tab !== "invited" && (
          <>
            {loading && (
              <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)" }}>Loading…</div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "var(--fg-3)", fontSize: 13 }}>
                {search
                  ? `No users match "${search}"`
                  : tab === "deactivated"
                    ? "No deactivated users."
                    : "No active users found."
                }
              </div>
            )}
            {!loading && filtered.map((u, idx) => {
              const isMe = u.id === currentUser?.id;
              const isPatching = patching === u.id;
              const isDeleting = deleting === u.id;
              const isSelected = selectedUserId === u.id;

              return (
                <div
                  key={u.id}
                  onClick={() => openDrawer(u.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 140px 80px 100px 44px",
                    padding: "12px 16px", alignItems: "center",
                    borderTop: idx > 0 ? "0.5px solid var(--hairline)" : undefined,
                    background: isSelected ? "var(--hover)" : "transparent",
                    cursor: "pointer",
                    opacity: isPatching || isDeleting ? 0.5 : 1,
                    transition: "background 0.12s, opacity 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--hover)"; }}
                  onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  {/* Avatar + name + email */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Avatar name={u.display_name || u.email} role={u.system_role} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {u.display_name || u.email}
                        </span>
                        {isMe && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 20,
                            background: "rgba(10,132,255,0.15)", color: "#0a84ff", flexShrink: 0,
                          }}>
                            You
                          </span>
                        )}
                      </div>
                      {u.display_name && (
                        <div style={{ fontSize: 11.5, color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {u.email}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Role select */}
                  <select
                    value={u.system_role}
                    disabled={isPatching || isMe}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => void patch(u.id, { system_role: e.target.value as User["system_role"] })}
                    style={{
                      fontSize: 12, borderRadius: 6, border: "0.5px solid var(--hairline)",
                      background: "var(--glass-weak)", color: "var(--fg)", padding: "4px 8px",
                      cursor: isMe ? "not-allowed" : "pointer", opacity: isMe ? 0.5 : 1,
                    }}
                  >
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                  </select>

                  {/* Active toggle */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void patch(u.id, { is_active: !u.is_active }); }}
                      disabled={isPatching || isMe}
                      title={u.is_active ? "Deactivate" : "Activate"}
                      style={{
                        width: 36, height: 20, borderRadius: 10, border: "none",
                        cursor: isMe ? "not-allowed" : "pointer",
                        background: u.is_active ? "#30d158" : "var(--fg-4)",
                        position: "relative", transition: "background 0.2s", flexShrink: 0,
                        opacity: isMe ? 0.4 : 1,
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 2,
                        left: u.is_active ? "unset" : 2, right: u.is_active ? 2 : "unset",
                        width: 16, height: 16, borderRadius: "50%",
                        background: "#fff", transition: "all 0.2s",
                      }} />
                    </button>
                    <span style={{ fontSize: 10, color: u.is_active ? "#30d158" : "var(--fg-3)" }}>
                      {u.is_active ? "Active" : "Off"}
                    </span>
                  </div>

                  {/* Joined */}
                  <span style={{ fontSize: 12, color: "var(--fg-3)" }}>{dateStr(u.created_at)}</span>

                  {/* Actions menu */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu({ userId: u.id, x: e.clientX, y: e.clientY });
                    }}
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
          </>
        )}
      </div>

      {/* Context menu */}
      {menu && (() => {
        const menuUser = users.find((u) => u.id === menu.userId);
        const isMe = menu.userId === currentUser?.id;
        return (
          <div
            ref={menuRef}
            className="card"
            style={{
              position: "fixed", top: menu.y, left: menu.x, zIndex: 2000,
              minWidth: 180, padding: "4px 0", boxShadow: "var(--shadow-sm)",
            }}
          >
            {[
              {
                label: "View projects",
                disabled: false,
                onClick: () => { openDrawer(menu.userId); setMenu(null); },
              },
              {
                label: menuUser?.is_active ? "Deactivate" : "Activate",
                disabled: isMe,
                onClick: () => {
                  if (menuUser) void patch(menuUser.id, { is_active: !menuUser.is_active });
                  setMenu(null);
                },
              },
              {
                label: "Delete",
                disabled: isMe,
                danger: true,
                onClick: () => {
                  setConfirmDeleteId(menu.userId);
                  setMenu(null);
                },
              },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.disabled ? undefined : item.onClick}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "8px 16px", background: "none", border: "none",
                  fontSize: 13, cursor: item.disabled ? "not-allowed" : "pointer",
                  color: item.danger ? "#ff375f" : item.disabled ? "var(--fg-4)" : "var(--fg)",
                }}
                onMouseEnter={(e) => { if (!item.disabled) (e.currentTarget as HTMLButtonElement).style.background = "var(--hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              >
                {item.label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Slide-over drawer */}
      {selectedUserId && selectedUser && (
        <>
          <div
            onClick={() => setSelectedUserId(null)}
            style={{ position: "fixed", inset: 0, zIndex: 900 }}
          />
          <div
            className="glass"
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0,
              width: 440, zIndex: 1000,
              background: "var(--glass-strong)", backdropFilter: "blur(20px) saturate(1.6)",
              borderLeft: "0.5px solid var(--hairline)",
              display: "flex", flexDirection: "column",
              animation: "slideInRight 0.22s ease",
            }}
          >
            {/* Drawer header */}
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 20px 16px",
              borderBottom: "0.5px solid var(--hairline)",
            }}>
              <Avatar name={selectedUser.display_name || selectedUser.email} role={selectedUser.system_role} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedUser.display_name || selectedUser.email}
                  </span>
                  {selectedUser.id === currentUser?.id && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 20, background: "rgba(10,132,255,0.15)", color: "#0a84ff", flexShrink: 0 }}>You</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 2 }}>{selectedUser.email}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                    background: selectedUser.system_role === "admin" ? "rgba(191,90,242,0.15)" : "rgba(10,132,255,0.15)",
                    color: selectedUser.system_role === "admin" ? "#bf5af2" : "#0a84ff",
                    textTransform: "capitalize",
                  }}>
                    {selectedUser.system_role}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                    background: selectedUser.is_active ? "rgba(48,209,88,0.15)" : "rgba(120,120,128,0.15)",
                    color: selectedUser.is_active ? "#30d158" : "#8e8e93",
                  }}>
                    {selectedUser.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserId(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", fontSize: 18, padding: 4, borderRadius: 6, flexShrink: 0 }}
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>

            {/* Drawer body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              {/* Meta */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fg-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Details</div>
                {[
                  { label: "Email", value: selectedUser.email },
                  { label: "Joined", value: dateStr(selectedUser.created_at) },
                  { label: "Role", value: selectedUser.system_role },
                ].map((row) => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid var(--hairline)" }}>
                    <span style={{ fontSize: 12.5, color: "var(--fg-3)" }}>{row.label}</span>
                    <span style={{ fontSize: 12.5, color: "var(--fg)", fontWeight: 500, textTransform: "capitalize" }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Change role */}
              {selectedUser.id !== currentUser?.id && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fg-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Change Role</div>
                  <select
                    value={selectedUser.system_role}
                    disabled={patching === selectedUser.id}
                    onChange={(e) => void patch(selectedUser.id, { system_role: e.target.value as User["system_role"] })}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: 8,
                      border: "0.5px solid var(--hairline)", background: "var(--glass-weak)",
                      color: "var(--fg)", fontSize: 13, cursor: "pointer",
                    }}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                </div>
              )}

              {/* Projects this person belongs to */}
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fg-3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Projects
                </div>
                {drawerProjectsLoading ? (
                  <div style={{ fontSize: 12, color: "var(--fg-3)" }}>Loading…</div>
                ) : drawerProjects.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--fg-4)", fontStyle: "italic" }}>Not a member of any project.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {drawerProjects.map(({ project: p, role }) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 12px", borderRadius: 8,
                          background: "var(--glass-weak)", cursor: "pointer",
                        }}
                        onClick={() => { window.location.href = `/projects/${p.id}`; }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--hover)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--glass-weak)"; }}
                      >
                        <div style={{
                          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                          background: "var(--accent-1)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, color: "#fff", fontSize: 12,
                        }}>
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                        </div>
                        <span style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "capitalize", background: "var(--glass)", padding: "2px 8px", borderRadius: 20 }}>
                          {role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer footer */}
            {selectedUser.id !== currentUser?.id && (
              <div style={{ padding: "16px 20px", borderTop: "0.5px solid var(--hairline)", display: "flex", gap: 8 }}>
                <button
                  className="pill-btn"
                  style={{ flex: 1 }}
                  disabled={patching === selectedUser.id}
                  onClick={() => void patch(selectedUser.id, { is_active: !selectedUser.is_active })}
                >
                  {selectedUser.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  className="pill-btn danger"
                  disabled={deleting === selectedUser.id}
                  onClick={() => setConfirmDeleteId(selectedUser.id)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete confirm modal */}
      {confirmDeleteId && (() => {
        const targetUser = users.find((u) => u.id === confirmDeleteId);
        return (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setConfirmDeleteId(null)}
          >
            <div
              className="card"
              style={{ width: 380, padding: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, margin: "0 0 8px" }}>Delete User</h2>
              <p style={{ fontSize: 13, color: "var(--fg-2)", marginBottom: 20, lineHeight: 1.6 }}>
                Are you sure you want to permanently delete{" "}
                <strong>{targetUser?.display_name || targetUser?.email}</strong>?
                This action cannot be undone.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="pill-btn" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                <button
                  className="pill-btn danger"
                  onClick={() => void handleDelete(confirmDeleteId)}
                  disabled={deleting === confirmDeleteId}
                >
                  {deleting === confirmDeleteId ? "Deleting…" : "Delete User"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add User modal */}
      {showAddUser && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={closeAddUser}
        >
          <div
            className="card"
            style={{ width: 440, padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>Add User</h2>
            <p style={{ fontSize: 12.5, color: "var(--fg-3)", marginBottom: 20 }}>Invite a new member to this workspace</p>

            {addError && (
              <div style={{
                padding: "8px 12px", borderRadius: 8, marginBottom: 12,
                background: "rgba(255,55,95,0.12)", color: "#ff375f",
                fontSize: 12.5, border: "0.5px solid rgba(255,55,95,0.3)",
              }}>
                {addError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 4 }}>Email *</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="user@example.com"
                  autoFocus
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 4 }}>Display name</label>
                <input
                  value={addDisplayName}
                  onChange={(e) => setAddDisplayName(e.target.value)}
                  placeholder="Jane Smith"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 4 }}>Password *</label>
                <input
                  type="password"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="Temporary password"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--fg-2)", display: "block", marginBottom: 4 }}>Role</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as User["system_role"])}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button className="pill-btn" onClick={closeAddUser} disabled={adding}>Cancel</button>
              <button
                className="pill-btn"
                data-primary="true"
                style={{ opacity: (!addEmail.trim() || !addPassword.trim() || adding) ? 0.5 : 1 }}
                onClick={() => void handleAddUser()}
                disabled={!addEmail.trim() || !addPassword.trim() || adding}
              >
                {adding ? "Adding…" : "Add User"}
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
