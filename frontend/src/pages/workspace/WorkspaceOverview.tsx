import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import * as api from "../../lib/api";
import type { Project, User } from "../../types";

function dateStr(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "??";
}

const STATUS_CONFIG: Record<Project["status"], { label: string; s: string; color: string }> = {
  active:   { label: "Active",    s: "running", color: "#30d158"  },
  archived: { label: "Archived",  s: "queued",  color: "#ff9f0a"  },
  closed:   { label: "Closed",    s: "done",    color: "var(--fg-3)"  },
};

const ATTENTION_ITEMS = [
  { id: "a1", icon: "git"  as const, color: "#ff9f0a", title: "Project Atlas has no repositories", detail: "Connect a repo to enable code analysis and agent runs." },
  { id: "a2", icon: "users" as const, color: "#ff3b30", title: "2 users have been inactive for 30+ days", detail: "Consider deactivating unused accounts to keep the workspace clean." },
  { id: "a3", icon: "book" as const, color: "#bf5af2", title: "Knowledge index may be stale", detail: "Last ingestion was 8 days ago. Re-index to keep search results accurate." },
  { id: "a4", icon: "bell" as const, color: "#ff9f0a", title: "No agent profiles configured", detail: "Add at least one agent profile to start executing tasks." },
];

const RECENT_ACTIVITY = [
  { id: "r1", actor: "Nico Cardone",  avatar: "NC", color: "#0a84ff",  action: "Created project",   target: "Atlas",               time: "2m ago"  },
  { id: "r2", actor: "System",        avatar: "SY", color: "#30d158",  action: "Knowledge indexed",  target: "github.com/acme/core", time: "14m ago" },
  { id: "r3", actor: "Jane Doe",      avatar: "JD", color: "#bf5af2",  action: "Invited user",       target: "sam@acme.com",        time: "1h ago"  },
  { id: "r4", actor: "Sam Torres",    avatar: "ST", color: "#ff9f0a",  action: "Completed task",     target: "API refactor plan",   time: "3h ago"  },
  { id: "r5", actor: "System",        avatar: "SY", color: "#30d158",  action: "Agent run finished", target: "Gemini executor",     time: "5h ago"  },
];

const AVATAR_COLORS = ["#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#ff375f", "#5e5ce6"];

export default function WorkspaceOverview() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers]       = useState<User[]>([]);
  const [loading, setLoading]   = useState(true);

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

  const activeUsers  = users.filter((u) => u.is_active).length;
  const recentProjs  = [...projects]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const STUB_KB_SOURCES = 4;
  const STUB_AGENT_RUNS = 127;

  return (
    <div className="main-scroll">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <h1 className="h-page">Overview</h1>
          <p className="sub-page">Workspace health at a glance</p>
        </div>
        <button className="pill-btn" onClick={load} style={{ marginTop: 4 }}>
          <Icon name="refresh" size="sm" /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[
          { l: "Total Projects",     v: loading ? "—" : projects.length,   d: "workspace total",    icon: "layers"   as const },
          { l: "Active Users",       v: loading ? "—" : activeUsers,        d: "currently enabled",  icon: "users"    as const },
          { l: "Knowledge Sources",  v: loading ? "—" : STUB_KB_SOURCES,    d: "repos + docs",       icon: "book"     as const },
          { l: "Agent Runs",         v: loading ? "—" : STUB_AGENT_RUNS,    d: "all time",           icon: "zap"      as const },
        ].map((s, i) => (
          <div key={i} className="card stat">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name={s.icon} size="sm" style={{ color: "var(--fg-3)" }} />
              <span className="stat-l">{s.l}</span>
            </div>
            <span className="stat-v">{s.v}</span>
            <span className="stat-delta">{s.d}</span>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Projects at a Glance */}
        <div className="card" style={{ padding: 0 }}>
          <div className="card-head" style={{ padding: "14px 16px 10px" }}>
            <Icon name="layers" size="sm" />
            <span className="card-title">Projects at a Glance</span>
            <span className="card-sub">{recentProjs.length} recent</span>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: 32, color: "var(--fg-3)" }}>Loading…</div>
          )}

          {!loading && recentProjs.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: "var(--fg-3)", fontSize: 13 }}>
              No projects yet.
            </div>
          )}

          {!loading && recentProjs.length > 0 && (
            <div>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 80px 70px",
                padding: "0 16px 8px",
                borderBottom: "0.5px solid var(--hairline)",
                fontSize: 11, fontWeight: 600, color: "var(--fg-3)",
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                <span>Name</span>
                <span>Status</span>
                <span style={{ textAlign: "right" }}>Tasks</span>
                <span style={{ textAlign: "right" }}>Created</span>
              </div>

              {recentProjs.map((p, idx) => {
                const cfg   = STATUS_CONFIG[p.status];
                const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                return (
                  <div
                    key={p.id}
                    style={{
                      display: "grid", gridTemplateColumns: "1fr 90px 80px 70px",
                      alignItems: "center", padding: "9px 16px",
                      borderBottom: "0.5px solid var(--hairline)",
                      cursor: "pointer", transition: "background 0.1s",
                    }}
                    onClick={() => { window.location.href = `/projects/${p.id}`; }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--glass-weak)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6, background: color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
                      }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                    </div>
                    <span className="task-status" data-s={cfg.s}>{cfg.label}</span>
                    <span style={{ textAlign: "right", fontSize: 12.5, color: "var(--fg-2)", fontVariantNumeric: "tabular-nums" }}>—</span>
                    <span style={{ textAlign: "right", fontSize: 11.5, color: "var(--fg-3)" }}>{dateStr(p.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Needs Attention */}
        <div className="card">
          <div className="card-head">
            <Icon name="bell" size="sm" style={{ color: "#ff9f0a" }} />
            <span className="card-title">Needs Attention</span>
            <span className="card-sub">{ATTENTION_ITEMS.length} items</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {ATTENTION_ITEMS.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex", gap: 10, padding: "10px 0",
                  borderBottom: "0.5px solid var(--hairline)",
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: `${item.color}18`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name={item.icon} size="sm" style={{ color: item.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--fg)", lineHeight: 1.4, marginBottom: 2 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-3)", lineHeight: 1.4 }}>
                    {item.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-head">
          <Icon name="layers" size="sm" />
          <span className="card-title">Recent Activity</span>
          <span className="card-sub">last 5 actions</span>
        </div>
        <div>
          {RECENT_ACTIVITY.map((item) => (
            <div key={item.id} className="act-row">
              <div
                className="act-avatar"
                style={{
                  background: item.color,
                  color: "#fff", fontWeight: 700, fontSize: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 30, height: 30, borderRadius: "50%",
                }}
              >
                {initials(item.actor)}
              </div>
              <div className="act-body">
                <b>{item.actor}</b>{" "}
                {item.action}{" "}
                <span style={{ color: "var(--fg)", fontWeight: 500 }}>{item.target}</span>
                <div className="act-time">{item.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
