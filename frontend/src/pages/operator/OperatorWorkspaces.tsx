import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import * as api from "../../lib/api";
import type { Project, User } from "../../types";

interface Props {
  mode: "saas" | "onprem";
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function dateStr(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ─── Stub notification ────────────────────────────────────────────────────────

function StubNotice({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div
      style={{
        background: "#ff9f0a18",
        border: "0.5px solid #ff9f0a55",
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 16,
        fontSize: 12.5,
        color: "#ff9f0a",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Icon name="bell" size="sm" style={{ color: "#ff9f0a", flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{msg}</span>
      <button
        onClick={onDismiss}
        style={{ color: "#ff9f0a88", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>
    </div>
  );
}

// ─── New Workspace Modal ──────────────────────────────────────────────────────

function NewWorkspaceModal({
  mode,
  onClose,
}: {
  mode: "saas" | "onprem";
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const label = mode === "saas" ? "Workspace" : "Department";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Stub: no-op
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card glass"
        style={{ width: 420, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
          New {label}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--fg-3)", marginBottom: 20 }}>
          Create a new {label.toLowerCase()} on the platform.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: 12, color: "var(--fg-2)", fontWeight: 600, display: "block", marginBottom: 4 }}>
            {label} name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g. Engineering ${label}`}
            style={{
              width: "100%",
              background: "var(--glass-weak)",
              border: "0.5px solid var(--hairline)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              color: "var(--fg)",
              outline: "none",
              boxSizing: "border-box",
              marginBottom: 20,
            }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="pill-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="pill-btn" data-primary="true" disabled={!name.trim()}>
              Create {label}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Workspace Drawer ─────────────────────────────────────────────────────────

function WorkspaceDrawer({
  mode,
  users,
  projects,
  onClose,
  onStub,
}: {
  mode: "saas" | "onprem";
  users: User[];
  projects: Project[];
  onClose: () => void;
  onStub: (msg: string) => void;
}) {
  const planLabel = mode === "saas" ? "Pro" : "Licensed";
  const createdAt = users[0]?.created_at ?? new Date().toISOString();

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 100,
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="glass"
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: 480,
          zIndex: 101,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          borderLeft: "0.5px solid var(--hairline)",
          boxShadow: "var(--shadow-lg)",
          overflowY: "auto",
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "20px 24px 16px",
            borderBottom: "0.5px solid var(--hairline)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "linear-gradient(135deg, #ff9f0a, #ff375f)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            T
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>TelaiOS</div>
            <div style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
              {mode === "saas" ? "Primary workspace" : "Main department"}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button
            className="tb-btn"
            onClick={onClose}
            style={{ width: 30, height: 30 }}
          >
            <Icon name="chev" size="sm" />
          </button>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 1,
            borderBottom: "0.5px solid var(--hairline)",
          }}
        >
          {[
            { l: "Members", v: users.length },
            { l: "Projects", v: projects.length },
            { l: mode === "saas" ? "Plan" : "License", v: planLabel },
          ].map((s, i) => (
            <div key={i} style={{ padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--fg)" }}>{s.v}</div>
              <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Meta */}
        <div style={{ padding: "16px 24px", borderBottom: "0.5px solid var(--hairline)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            Workspace Details
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              { l: "Status",    v: "Active",                        c: "#30d158" },
              { l: "Created",   v: dateStr(createdAt),              c: undefined },
              { l: "Region",    v: mode === "saas" ? "us-east-1" : "on-premise", c: undefined },
              { l: "ID",        v: "ws-telaios-0001",               c: undefined },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "var(--fg-3)" }}>{row.l}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: row.c ?? "var(--fg)" }}>{row.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Members list */}
        <div style={{ padding: "16px 24px", borderBottom: "0.5px solid var(--hairline)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            Members (first 5)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {users.slice(0, 5).map((u, i) => {
              const colors = ["#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#ff375f"];
              const color  = colors[i % colors.length];
              return (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: `linear-gradient(135deg, ${color}, ${color}88)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {initials(u.display_name || u.email)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.display_name || u.email}
                    </div>
                    {u.display_name && (
                      <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{u.email}</div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: u.system_role === "admin" ? "#bf5af2" : "#0a84ff",
                      background: u.system_role === "admin" ? "#bf5af218" : "#0a84ff18",
                      border: `0.5px solid ${u.system_role === "admin" ? "#bf5af244" : "#0a84ff44"}`,
                      borderRadius: 4,
                      padding: "2px 6px",
                    }}
                  >
                    {u.system_role}
                  </span>
                </div>
              );
            })}
            {users.length === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--fg-3)" }}>No members found.</div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: "16px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
            Operator Actions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              className="pill-btn"
              data-primary="true"
              style={{ width: "100%", justifyContent: "center", padding: "8px 0" }}
              onClick={() =>
                onStub("In production, this would impersonate the workspace admin and open a support session.")
              }
            >
              <Icon name="users" size="sm" /> Sign in as support
            </button>
            <button
              className="pill-btn"
              style={{ width: "100%", justifyContent: "center", padding: "8px 0" }}
              onClick={() => onStub("Action stubbed — seat adjustment not implemented in this demo.")}
            >
              <Icon name="settings" size="sm" />{" "}
              {mode === "saas" ? "Adjust seats" : "Adjust license"}
            </button>
            <button
              className="pill-btn danger"
              style={{ width: "100%", justifyContent: "center", padding: "8px 0" }}
              onClick={() => {
                if (window.confirm("Suspend TelaiOS workspace? (Stub — no action will be taken)")) {
                  onStub("Action stubbed — workspace suspension not implemented in this demo.");
                }
              }}
            >
              <Icon name="bell" size="sm" /> Suspend{" "}
              {mode === "saas" ? "workspace" : "department"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OperatorWorkspaces({ mode }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers]       = useState<User[]>([]);
  const [loading, setLoading]   = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen]   = useState(false);
  const [notice, setNotice]         = useState<string | null>(null);

  const wsLabel = mode === "saas" ? "Workspaces" : "Departments";

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getProjects({ limit: 100 }).catch(() => ({ items: [] as Project[], total: 0 })),
      api.listUsers().catch(() => [] as User[]),
    ])
      .then(([{ items }, us]) => {
        setProjects(items);
        setUsers(us);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const showStub = (msg: string) => {
    setDrawerOpen(false);
    setNotice(msg);
  };

  return (
    <div className="main-scroll">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 className="h-page">{wsLabel}</h1>
          <p className="sub-page">
            {mode === "saas"
              ? "All tenants and their platform usage"
              : "All organizational departments"}
          </p>
        </div>
        <button
          className="pill-btn"
          data-primary="true"
          style={{ marginTop: 4 }}
          onClick={() => setModalOpen(true)}
        >
          <Icon name="plus" size="sm" /> New {mode === "saas" ? "Workspace" : "Department"}
        </button>
      </div>

      {/* Stub notice */}
      {notice && (
        <StubNotice msg={notice} onDismiss={() => setNotice(null)} />
      )}

      {/* Table card */}
      <div className="card" style={{ padding: 0 }}>
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 80px 80px 90px 80px",
            padding: "0 16px 10px",
            paddingTop: 14,
            borderBottom: "0.5px solid var(--hairline)",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--fg-3)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <span>Name</span>
          <span style={{ textAlign: "right" }}>Members</span>
          <span style={{ textAlign: "right" }}>Projects</span>
          <span style={{ textAlign: "right" }}>{mode === "saas" ? "Plan" : "License"}</span>
          <span style={{ textAlign: "right" }}>Status</span>
          <span style={{ textAlign: "right" }}>Actions</span>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 32, color: "var(--fg-3)" }}>Loading…</div>
        )}

        {!loading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 80px 80px 90px 80px",
              alignItems: "center",
              padding: "12px 16px",
              cursor: "pointer",
              transition: "background 0.1s",
            }}
            onClick={() => setDrawerOpen(true)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--glass-weak)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: "linear-gradient(135deg, #ff9f0a, #ff375f)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                T
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>TelaiOS</div>
                <div style={{ fontSize: 11, color: "var(--fg-3)" }}>
                  {mode === "saas" ? "telaios.io" : "on-premise"}
                </div>
              </div>
            </div>
            <span style={{ textAlign: "right", fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
              {users.length}
            </span>
            <span style={{ textAlign: "right", fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
              {projects.length}
            </span>
            <span style={{ textAlign: "right", fontSize: 12.5, color: "#30d158", fontWeight: 500 }}>
              {mode === "saas" ? "Pro" : "Licensed"}
            </span>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <span className="task-status" data-s="done" style={{ fontSize: 11 }}>Active</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="pill-btn"
                style={{ fontSize: 11 }}
                onClick={(e) => { e.stopPropagation(); setDrawerOpen(true); }}
              >
                Details
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <WorkspaceDrawer
          mode={mode}
          users={users}
          projects={projects}
          onClose={() => setDrawerOpen(false)}
          onStub={showStub}
        />
      )}

      {/* New workspace modal */}
      {modalOpen && (
        <NewWorkspaceModal mode={mode} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}
