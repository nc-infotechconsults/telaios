import { useEffect, useState } from "react";
import { getRepositories, listDocuments } from "../../lib/api";
import type { Repository, Document } from "../../types";
import type { ProjectView } from "../../components/ProjectLayout";

interface StatCard {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  delta?: string;
}

const SUGGESTION_CHIPS = [
  "What is the architecture of this project?",
  "Summarize recent code changes",
  "Find potential security issues",
  "Generate a feature roadmap",
];

const MOCK_ACTIVITY = [
  { id: "a1", icon: "📄", text: "3 documents indexed from /docs", time: "2m ago" },
  { id: "a2", icon: "⎔",  text: "Repository main-api synced (247 commits)", time: "15m ago" },
  { id: "a3", icon: "✦",  text: "Design session 'Mobile nav' created", time: "1h ago" },
  { id: "a4", icon: "⊛",  text: "Coder agent completed task refactor-auth", time: "3h ago" },
  { id: "a5", icon: "?",  text: "TEOS answered 12 questions", time: "1d ago" },
];

const MOCK_TEOS_TASKS = [
  { id: "t1", label: "Analyzing new PR #142 for code quality", progress: 65, color: "#0a84ff" },
  { id: "t2", label: "Indexing repository changes (247 commits)", progress: 88, color: "#30d158" },
  { id: "t3", label: "Generating API documentation", progress: 30, color: "#bf5af2" },
];

export default function ProjectDashboard({
  projectId,
  onNavigate,
}: {
  projectId: string;
  onNavigate: (view: ProjectView) => void;
}) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getRepositories(projectId),
      listDocuments(projectId),
    ])
      .then(([r, d]) => { setRepos(r); setDocs(d); })
      .finally(() => setLoading(false));
  }, [projectId]);

  const stats: StatCard[] = [
    { label: "Repos connected",    value: repos.length,  icon: "⎔", color: "#0a84ff",  delta: "+1 this week" },
    { label: "Documents indexed",  value: docs.length,   icon: "⎕", color: "#30d158",  delta: "+12 today" },
    { label: "Symbols extracted",  value: loading ? "…" : `${repos.length * 1200 + 350}`, icon: "⌖", color: "#bf5af2", delta: "live" },
    { label: "Questions answered", value: 47,            icon: "?", color: "#ff9f0a",  delta: "+8 today" },
  ];

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
        }}
        role="list"
        aria-label="Project statistics"
      >
        {stats.map((s) => (
          <div
            key={s.label}
            role="listitem"
            style={{
              background: "var(--glass)",
              backdropFilter: "blur(20px)",
              border: "0.5px solid var(--glass-edge)",
              borderRadius: 16,
              padding: "14px 16px",
              boxShadow: "var(--shadow-glass-panel)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <span style={{ fontSize: 20 }} aria-hidden="true">{s.icon}</span>
              {s.delta && (
                <span style={{ fontSize: 10, color: "#30d158", background: "rgba(48,209,88,0.12)", padding: "2px 6px", borderRadius: 9999 }}>
                  {s.delta}
                </span>
              )}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color, marginTop: 8, lineHeight: 1 }}>
              {loading ? <span style={{ opacity: 0.4 }}>–</span> : s.value}
            </div>
            <div style={{ fontSize: 12, color: "var(--label-secondary)", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Ask TEOS hero */}
      <div
        style={{
          background: "var(--glass)",
          backdropFilter: "blur(20px)",
          border: "0.5px solid var(--glass-edge)",
          borderRadius: 18,
          padding: "20px 22px",
          boxShadow: "var(--shadow-glass-panel)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #0a84ff, #bf5af2)",
              animation: "teosOrbPulse 2s ease-in-out infinite",
            }}
            aria-hidden="true"
          />
          <span style={{ fontWeight: 600, fontSize: 15, color: "var(--label-primary)" }}>
            Ask TEOS about this project
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => onNavigate("conversation")}
              style={{
                padding: "7px 14px",
                borderRadius: 9999,
                background: "var(--fill-tertiary)",
                border: "0.5px solid var(--glass-edge)",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--label-primary)",
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover-glass)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--fill-tertiary)"; }}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Two-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Connected repos card */}
        <div
          style={{
            background: "var(--glass)",
            backdropFilter: "blur(20px)",
            border: "0.5px solid var(--glass-edge)",
            borderRadius: 18,
            padding: "16px 18px",
            boxShadow: "var(--shadow-glass-panel)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--label-primary)" }}>
              Connected Repositories
            </h2>
            <button
              onClick={() => onNavigate("repositories")}
              style={{ background: "none", border: "none", fontSize: 12, color: "#0a84ff", cursor: "pointer" }}
            >
              View all
            </button>
          </div>
          {repos.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--label-tertiary)", fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⎔</div>
              No repositories connected yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {repos.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: "var(--fill-quaternary)",
                  }}
                >
                  <span style={{ fontSize: 14 }} aria-hidden="true">⎔</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--label-tertiary)" }}>{r.remote_url ?? r.bucket_name ?? "—"}</div>
                  </div>
                  <StatusDot status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TEOS tasks card */}
        <div
          style={{
            background: "var(--glass)",
            backdropFilter: "blur(20px)",
            border: "0.5px solid var(--glass-edge)",
            borderRadius: 18,
            padding: "16px 18px",
            boxShadow: "var(--shadow-glass-panel)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #0a84ff, #bf5af2)",
                animation: "teosOrbPulse 2s ease-in-out infinite",
              }}
              aria-hidden="true"
            />
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--label-primary)" }}>
              TEOS Working On
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {MOCK_TEOS_TASKS.map((t) => (
              <div key={t.id}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--label-secondary)" }}>{t.label}</span>
                  <span style={{ fontSize: 10, color: t.color, fontWeight: 600 }}>{t.progress}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 9999, background: "var(--fill-tertiary)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${t.progress}%`,
                      borderRadius: 9999,
                      background: t.color,
                      transition: "width 1s ease",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div
        style={{
          background: "var(--glass)",
          backdropFilter: "blur(20px)",
          border: "0.5px solid var(--glass-edge)",
          borderRadius: 18,
          padding: "16px 18px",
          boxShadow: "var(--shadow-glass-panel)",
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--label-primary)" }}>
          Recent Activity
        </h2>
        <div role="list" aria-label="Recent activity" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {MOCK_ACTIVITY.map((item) => (
            <div
              key={item.id}
              role="listitem"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 0",
                borderBottom: "0.5px solid var(--hairline)",
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true">{item.icon}</span>
              <span style={{ flex: 1, fontSize: 13, color: "var(--label-primary)" }}>{item.text}</span>
              <span style={{ fontSize: 11, color: "var(--label-quaternary)", flexShrink: 0 }}>{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ready: "#30d158",
    cloning: "#ff9f0a",
    error: "#ff375f",
    unconfigured: "var(--label-quaternary)",
  };
  return (
    <span
      aria-label={status}
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: colorMap[status] ?? "var(--label-quaternary)",
        flexShrink: 0,
      }}
    />
  );
}
