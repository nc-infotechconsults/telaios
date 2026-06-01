import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { getOrgAnalytics } from "../../lib/api";
import type { OrgProjectSummary } from "../../types";

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "No activity";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "Just now";
}

function HealthBar({ done, failed, total }: { done: number; failed: number; total: number }) {
  if (total === 0) {
    return <div style={{ height: 6, borderRadius: 3, background: "var(--glass-weak)", width: "100%" }} />;
  }
  const donePct = (done / total) * 100;
  const failedPct = (failed / total) * 100;
  return (
    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", width: "100%", gap: 1 }}>
      {donePct > 0 && <div style={{ width: `${donePct}%`, background: "#30d158", borderRadius: "3px 0 0 3px" }} />}
      {failedPct > 0 && <div style={{ width: `${failedPct}%`, background: "#ff3b30" }} />}
      <div style={{ flex: 1, background: "var(--glass-weak)", borderRadius: "0 3px 3px 0" }} />
    </div>
  );
}

export default function WorkspaceAnalytics() {
  const [summaries, setSummaries] = useState<OrgProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getOrgAnalytics()
      .then(setSummaries)
      .catch(() => setSummaries([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalDone = summaries.reduce((s, p) => s + p.done_tasks, 0);
  const totalFailed = summaries.reduce((s, p) => s + p.failed_tasks, 0);
  const totalInProgress = summaries.reduce((s, p) => s + (p.in_progress_tasks ?? 0), 0);

  return (
    <div className="main-scroll">
      <h1 className="h-page">Analytics</h1>
      <p className="sub-page">Org-wide task health and project status</p>

      <div className="grid-4" style={{ marginBottom: 14 }}>
        {[
          { l: "Projects",   v: loading ? "—" : summaries.length,  d: "total"           },
          { l: "Tasks done", v: loading ? "—" : totalDone,          d: "all time"        },
          { l: "In progress",v: loading ? "—" : totalInProgress,    d: "right now"       },
          { l: "Failed",     v: loading ? "—" : totalFailed,        d: "needs attention" },
        ].map((s, i) => (
          <div key={i} className="card stat">
            <span className="stat-l">{s.l}</span>
            <span className="stat-v">{s.v}</span>
            <span className="stat-delta">{s.d}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <Icon name="layers" size="sm" />
          <span className="card-title">Project health</span>
          <span className="card-sub">{summaries.length} projects</span>
          <button className="pill-btn" style={{ marginLeft: 8 }} onClick={load}>Refresh</button>
        </div>
        {loading && (
          <div style={{ textAlign: "center", padding: 32, color: "var(--fg-3)" }}>Loading…</div>
        )}
        {!loading && summaries.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--fg-3)", padding: "12px 14px" }}>No data yet.</div>
        )}
        {!loading && summaries.map((p) => {
          const successPct = p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : null;
          return (
            <div
              key={p.project_id}
              style={{
                display: "flex", flexDirection: "column", gap: 6, padding: "12px 0",
                borderTop: "0.5px solid var(--hairline)", cursor: "pointer",
              }}
              onClick={() => { window.location.href = `/projects/${p.project_id}`; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.project_name}
                </span>
                {successPct !== null && (
                  <span style={{ fontSize: 12, color: "#30d158", fontWeight: 600 }}>{successPct}%</span>
                )}
                <span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{formatRelativeTime(p.last_activity)}</span>
              </div>
              <HealthBar done={p.done_tasks} failed={p.failed_tasks} total={p.total_tasks} />
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--fg-3)" }}>
                <span>{p.total_tasks} tasks</span>
                <span style={{ color: "#30d158" }}>{p.done_tasks} done</span>
                {p.failed_tasks > 0 && <span style={{ color: "#ff3b30" }}>{p.failed_tasks} failed</span>}
                {(p.in_progress_tasks ?? 0) > 0 && (
                  <span style={{ color: "#ff9f0a" }}>{p.in_progress_tasks} running</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
