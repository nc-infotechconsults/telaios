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

const OPERATOR_ACTIVITY = [
  { id: "oa1", actor: "operator@telaios.io",  action: "Platform config updated",      detail: "Brand color and name changed",      time: "5m ago",   icon: "settings" as const, color: "#0a84ff" },
  { id: "oa2", actor: "operator@telaios.io",  action: "User quota adjusted",           detail: "Max users increased to 500",         time: "2h ago",   icon: "users"    as const, color: "#bf5af2" },
  { id: "oa3", actor: "system",               action: "Security policy applied",       detail: "MFA requirement enforced globally",  time: "6h ago",   icon: "check"    as const, color: "#30d158" },
  { id: "oa4", actor: "operator@telaios.io",  action: "Feature flag toggled",          detail: "Voice Sessions enabled",            time: "1d ago",   icon: "spark"    as const, color: "#ff9f0a" },
  { id: "oa5", actor: "system",               action: "Scheduled maintenance complete", detail: "Database vacuum and index rebuild",  time: "2d ago",   icon: "layers"   as const, color: "#5e5ce6" },
];

export default function OperatorOverview({ mode }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getProjects({ limit: 200 }).catch(() => ({ items: [] as Project[], total: 0 })),
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

  const activeUsers     = users.filter((u) => u.is_active).length;
  // "failed" is not in the typed union but may appear from real API data
  const failedProjects  = projects.filter((p) => String(p.status) === "failed");
  const incidentActive  = failedProjects.length > 0;

  const wsLabel     = mode === "saas" ? "Workspaces"       : "Departments";
  const planLabel   = mode === "saas" ? "Pro"              : "Licensed";
  const kpiLabel4   = mode === "saas" ? "Platform Status"  : "System Status";

  return (
    <div className="main-scroll">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <h1 className="h-page">
            {mode === "saas" ? "Platform Overview" : "Organization Overview"}
          </h1>
          <p className="sub-page">
            {mode === "saas"
              ? "SaaS platform health and tenant summary"
              : "On-premise deployment health and department summary"}
          </p>
        </div>
        <button className="pill-btn" onClick={load} style={{ marginTop: 4 }}>
          <Icon name="arrow" size="sm" /> Refresh
        </button>
      </div>

      {/* Incident strip */}
      <div
        style={{
          borderRadius: 8,
          padding: "9px 14px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12.5,
          fontWeight: 500,
          background: incidentActive ? "#ff9f0a18" : "#30d15818",
          border: `0.5px solid ${incidentActive ? "#ff9f0a44" : "#30d15844"}`,
          color: incidentActive ? "#ff9f0a" : "#30d158",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: incidentActive ? "#ff9f0a" : "#30d158",
            flexShrink: 0,
            boxShadow: incidentActive
              ? "0 0 6px #ff9f0a88"
              : "0 0 6px #30d15888",
          }}
        />
        {incidentActive
          ? `${failedProjects.length} project(s) in failed state — review required`
          : "All systems operational"}
      </div>

      {/* KPI stat cards */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[
          {
            l: mode === "saas" ? "Total Workspaces" : "Total Departments",
            v: loading ? "—" : "1",
            d: "single tenant",
            icon: "users" as const,
            color: "#0a84ff",
          },
          {
            l: "Total Users",
            v: loading ? "—" : users.length,
            d: `${activeUsers} active`,
            icon: "users" as const,
            color: "#bf5af2",
          },
          {
            l: "Total Projects",
            v: loading ? "—" : projects.length,
            d: `${projects.filter((p) => p.status === "active").length} active`,
            icon: "layers" as const,
            color: "#5e5ce6",
          },
          {
            l: kpiLabel4,
            v: "Healthy",
            d: "99.98% uptime",
            icon: "check" as const,
            color: "#30d158",
          },
        ].map((s, i) => (
          <div key={i} className="card stat">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: `${s.color}18`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={s.icon} size="sm" style={{ color: s.color }} />
              </div>
              <span className="stat-l">{s.l}</span>
            </div>
            <span
              className="stat-v"
              style={s.l === kpiLabel4 ? { color: "#30d158" } : {}}
            >
              {s.v}
            </span>
            <span className="stat-delta">{s.d}</span>
          </div>
        ))}
      </div>

      {/* Two-column */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Workspaces at a Glance */}
        <div className="card" style={{ padding: 0 }}>
          <div className="card-head" style={{ padding: "14px 16px 10px" }}>
            <Icon name="users" size="sm" style={{ color: "#ff9f0a" }} />
            <span className="card-title">{wsLabel} at a Glance</span>
            <span className="card-sub">1 {mode === "saas" ? "tenant" : "unit"}</span>
          </div>

          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 80px 80px 80px",
              padding: "0 16px 8px",
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
            <span style={{ textAlign: "right" }}>
              {mode === "saas" ? "Plan" : "License"}
            </span>
            <span style={{ textAlign: "right" }}>Status</span>
          </div>

          {/* Single workspace row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 80px 80px 80px",
              alignItems: "center",
              padding: "10px 16px",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--glass-weak)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #ff9f0a, #ff375f)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                T
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>TelaiOS</div>
                <div style={{ fontSize: 11, color: "var(--fg-3)" }}>
                  {mode === "saas" ? "Primary tenant" : "Main department"}
                </div>
              </div>
            </div>
            <span style={{ textAlign: "right", fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
              {loading ? "—" : users.length}
            </span>
            <span style={{ textAlign: "right", fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
              {loading ? "—" : projects.length}
            </span>
            <span
              style={{
                textAlign: "right",
                fontSize: 12,
                color: "#30d158",
                fontWeight: 500,
              }}
            >
              {planLabel}
            </span>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <span
                className="task-status"
                data-s="done"
                style={{ fontSize: 11 }}
              >
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Recent Operator Activity */}
        <div className="card">
          <div className="card-head">
            <Icon name="inbox" size="sm" style={{ color: "#ff9f0a" }} />
            <span className="card-title">Recent Operator Activity</span>
            <span className="card-sub">last 5 actions</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {OPERATOR_ACTIVITY.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "9px 0",
                  borderBottom: "0.5px solid var(--hairline)",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: `${item.color}18`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={item.icon} size="sm" style={{ color: item.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3, color: "var(--fg)" }}>
                    {item.action}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 1 }}>
                    {item.detail}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--fg-3)", marginTop: 2 }}>
                    {item.time} · {item.actor}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* User initials row */}
      {!loading && users.length > 0 && (
        <div className="card">
          <div className="card-head">
            <Icon name="users" size="sm" />
            <span className="card-title">Platform Members</span>
            <span className="card-sub">{users.length} total · {activeUsers} active</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4 }}>
            {users.slice(0, 20).map((u, i) => {
              const colors = ["#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#ff375f", "#5e5ce6"];
              const color  = colors[i % colors.length];
              return (
                <div
                  key={u.id}
                  title={`${u.display_name || u.email} (${u.system_role})`}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${color}, ${color}88)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#fff",
                    opacity: u.is_active ? 1 : 0.4,
                    cursor: "default",
                  }}
                >
                  {initials(u.display_name || u.email)}
                </div>
              );
            })}
            {users.length > 20 && (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--glass-weak)",
                  border: "0.5px solid var(--hairline)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10.5,
                  color: "var(--fg-3)",
                }}
              >
                +{users.length - 20}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
