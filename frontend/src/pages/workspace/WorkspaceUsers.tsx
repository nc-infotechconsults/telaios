import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../lib/api";
import type { User } from "../../types";

type PatchData = Partial<Pick<User, "display_name" | "system_role" | "is_active">>;

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?";
}

const ROLE_COLORS: Record<string, string> = {
  admin: "#bf5af2",
  member: "#0a84ff",
};

export default function WorkspaceUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [patching, setPatching] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.listUsers().then(setUsers).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    search
      ? users.filter((u) =>
          (u.display_name + " " + u.email).toLowerCase().includes(search.toLowerCase())
        )
      : users,
  [users, search]);

  const patch = async (id: string, data: PatchData) => {
    setPatching(id);
    try {
      const updated = await api.patchUser(id, data);
      setUsers((us) => us.map((u) => (u.id === id ? updated : u)));
    } finally {
      setPatching(null);
    }
  };

  return (
    <div className="main-scroll">
      <h1 className="h-page">Users</h1>
      <p className="sub-page">
        <b style={{ color: "var(--fg-2)" }}>{users.length}</b> member{users.length !== 1 ? "s" : ""} in this workspace
      </p>

      {/* Search */}
      <div className="card" style={{ padding: "8px 12px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="search" size="sm" style={{ color: "var(--fg-3)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users…"
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--fg)", fontSize: 13 }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ color: "var(--fg-3)", fontSize: 11, padding: "2px 6px", cursor: "pointer" }}><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 32, color: "var(--fg-3)" }}>Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 32, color: "var(--fg-3)", fontSize: 13 }}>
            {search ? `No users match "${search}"` : "No users found."}
          </div>
        )}
        {!loading && filtered.map((u, idx) => (
          <div
            key={u.id}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
              borderTop: idx > 0 ? "0.5px solid var(--hairline)" : undefined,
              opacity: patching === u.id ? 0.6 : 1, transition: "opacity 0.15s",
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: `linear-gradient(135deg, ${ROLE_COLORS[u.system_role] ?? "#0a84ff"}, #5e5ce6)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 600, color: "#fff", fontSize: 12, flexShrink: 0,
            }}>
              {initials(u.display_name || u.email)}
            </div>

            {/* Name + email */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.display_name || u.email}
              </div>
              {u.display_name && (
                <div style={{ fontSize: 12, color: "var(--fg-3)" }}>{u.email}</div>
              )}
            </div>

            {/* Role select */}
            <select
              value={u.system_role}
              disabled={patching === u.id || u.id === currentUser?.id}
              onChange={(e) => void patch(u.id, { system_role: e.target.value as User["system_role"] })}
              style={{
                fontSize: 12, borderRadius: 6, border: "0.5px solid var(--hairline)",
                background: "var(--glass-weak)", color: "var(--fg)", padding: "4px 8px", cursor: "pointer",
              }}
            >
              <option value="admin">admin</option>
              <option value="member">member</option>
            </select>

            {/* Active toggle */}
            <button
              type="button"
              onClick={() => void patch(u.id, { is_active: !u.is_active })}
              disabled={patching === u.id || u.id === currentUser?.id}
              title={u.is_active ? "Deactivate" : "Activate"}
              style={{
                width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                background: u.is_active ? "#30d158" : "var(--fg-4)",
                position: "relative", transition: "background 0.2s", flexShrink: 0,
              }}
            >
              <span style={{
                position: "absolute", top: 2,
                left: u.is_active ? "unset" : 2, right: u.is_active ? 2 : "unset",
                width: 16, height: 16, borderRadius: "50%",
                background: "#fff", transition: "all 0.2s",
              }} />
            </button>

            <span style={{ fontSize: 12, color: u.is_active ? "#30d158" : "var(--fg-3)", minWidth: 48 }}>
              {u.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
