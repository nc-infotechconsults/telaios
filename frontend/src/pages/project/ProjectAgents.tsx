import { useState, useEffect } from "react";
import { Icon } from "../../components/Icon";
import { listProjectAgents, removeProjectAgent, getProjectAnalytics } from "../../lib/api";
import type { ProjectAgent, ProjectAnalytics } from "../../types";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

// ─── Mock data (DEMO mode only) ───────────────────────────────────────────────

interface AgentActivity {
  t: string;
  s: string;
  time?: string;
}

interface AgentDesign {
  title: string;
  sub: string;
  swatch: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  sources: string[];
  status: string;
  iconBg: string;
  icon: string;
  activity: AgentActivity[];
  designs?: AgentDesign[];
}

const MOCK_AGENTS: Agent[] = [
  {
    id: "qa",
    name: "Q&A Assistant",
    role: "Answers questions over all connected code and documents",
    sources: ["5 repos", "10 documents", "318 wiki pages"],
    status: "running",
    iconBg: "linear-gradient(135deg,#0a84ff,#64d2ff)",
    icon: "chat",
    activity: [
      { t: "Elena asked: How does the edge tier handle expired refresh tokens?", s: "done",   time: "8m ago" },
      { t: "Cross-referenced atlas-edge/src/auth.rs and RFC-014 §4.2",          s: "done",   time: "8m ago" },
      { t: "Answered with 2 code citations and a sequence summary",              s: "done",   time: "7m ago" },
    ],
  },
  {
    id: "reverse",
    name: "Reverse Engineer",
    role: "Maps unfamiliar code into architecture diagrams and prose",
    sources: ["Symbol graph", "Call graphs", "Git history"],
    status: "running",
    iconBg: "linear-gradient(135deg,#bf5af2,#ff375f)",
    icon: "layers",
    activity: [
      { t: "Generated sequence diagram for the payments-intent lifecycle",      s: "done",   time: "2d ago" },
      { t: "Identified 4 cross-service hot paths under load",                   s: "done",   time: "2d ago" },
      { t: "Drafting walkthrough doc for new-hire onboarding",                  s: "active", time: "now"   },
    ],
  },
  {
    id: "architect",
    name: "Feature Architect",
    role: "Turns a feature request into a cross-repo implementation plan",
    sources: ["All repos", "Architecture docs", "Past PRs"],
    status: "running",
    iconBg: "linear-gradient(135deg,#30d158,#0a84ff)",
    icon: "workflow",
    activity: [
      { t: "Request: Add SSO via Okta to Atlas",                                  s: "done",   time: "1h ago"  },
      { t: "Found 7 auth-touching modules across atlas-api, atlas-web",          s: "done",   time: "1h ago"  },
      { t: "Drafted 5-step rollout plan with migration risks",                   s: "done",   time: "55m ago" },
      { t: "Open review request for @lina, @sam",                               s: "active", time: "now"    },
    ],
  },
  {
    id: "designer",
    name: "UI Designer",
    role: "Designs interfaces matching your component library and brand",
    sources: ["Figma — brand kit", "atlas-web/src/components", "UI Guidelines.pdf"],
    status: "running",
    iconBg: "linear-gradient(135deg,#ff9f0a,#ff375f)",
    icon: "spark",
    activity: [
      { t: "Request: Redesign the billing dashboard",                            s: "done",   time: "32m ago" },
      { t: "Pulled 18 components from atlas-web, brand tokens from Figma",      s: "done",   time: "30m ago" },
      { t: "Drafted 3 variations: density-first, narrative, ops-control",       s: "active", time: "now"    },
    ],
    designs: [
      { title: "Density-first", sub: "Tabular, info-dense",   swatch: "#0a84ff" },
      { title: "Narrative",     sub: "Scrollytelling layout",  swatch: "#bf5af2" },
      { title: "Ops control",   sub: "Single-screen, KPIs up top", swatch: "#30d158" },
    ],
  },
  {
    id: "doc-sync",
    name: "Doc Sync",
    role: "Keeps documentation aligned with code changes automatically",
    sources: ["All repos", "All documents"],
    status: "queued",
    iconBg: "linear-gradient(135deg,#5e5ce6,#0a84ff)",
    icon: "book",
    activity: [
      { t: "Last run: synced 3 doc pages with atlas-api commits · 6h ago",   s: "done",    time: "6h ago" },
      { t: "Next scheduled run in 18 hours",                                  s: "pending"                },
    ],
  },
];

// ─── Role → icon / gradient mapping ──────────────────────────────────────────

const ROLE_ICON: Record<string, string> = {
  planner:         "workflow",
  coder:           "git",
  reviewer:        "eye",
  tester:          "layers",
  infra:           "settings",
  knowledge:       "book",
  "document-copilot": "file",
  designer:        "spark",
  custom:          "chat",
  qa:              "chat",
};

const ROLE_BG: Record<string, string> = {
  planner:         "linear-gradient(135deg,#30d158,#0a84ff)",
  coder:           "linear-gradient(135deg,#0a84ff,#64d2ff)",
  reviewer:        "linear-gradient(135deg,#ff9f0a,#ff375f)",
  tester:          "linear-gradient(135deg,#bf5af2,#ff375f)",
  infra:           "linear-gradient(135deg,#5e5ce6,#0a84ff)",
  knowledge:       "linear-gradient(135deg,#5e5ce6,#0a84ff)",
  "document-copilot": "linear-gradient(135deg,#64d2ff,#0a84ff)",
  designer:        "linear-gradient(135deg,#ff9f0a,#ff375f)",
  custom:          "linear-gradient(135deg,#bf5af2,#5e5ce6)",
  qa:              "linear-gradient(135deg,#0a84ff,#64d2ff)",
};

function projectAgentToAgent(pa: ProjectAgent): Agent {
  const role = pa.role ?? "custom";
  return {
    id: pa.id,
    name: pa.name,
    role: pa.system_prompt ?? role,
    sources: [],
    status: "running",
    iconBg: ROLE_BG[role] ?? ROLE_BG.custom,
    icon: ROLE_ICON[role] ?? "chat",
    activity: [],
  };
}

// ─── Source icon helper ───────────────────────────────────────────────────────

function srcIcon(s: string): string {
  const lower = s.toLowerCase();
  if (lower.includes("doc") || lower.includes("wiki") || lower.includes("guide")) return "book";
  if (lower.includes("graph") || lower.includes("history") || lower.includes("call")) return "layers";
  return "git";
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectAgents({ projectId }: { projectId: string }) {
  const [agents, setAgents]       = useState<Agent[]>(DEMO ? MOCK_AGENTS : []);
  const [loading, setLoading]     = useState(!DEMO);
  const [filter, setFilter]       = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, string>>({});
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);

  useEffect(() => {
    if (DEMO) return;
    setLoading(true);
    void Promise.all([
      listProjectAgents(projectId)
        .then((list) => setAgents(list.map(projectAgentToAgent))),
      getProjectAnalytics(projectId).then(setAnalytics),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [projectId]);

  const handleRemove = async (agentId: string) => {
    if (DEMO) return;
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
    try {
      await removeProjectAgent(projectId, agentId);
    } catch {
      // if removal fails, re-fetch to restore state
      listProjectAgents(projectId)
        .then((list) => setAgents(list.map(projectAgentToAgent)))
        .catch(() => {});
    }
  };

  const counts = {
    all:     agents.length,
    running: agents.filter((a) => a.status === "running").length,
    queued:  agents.filter((a) => a.status === "queued").length,
    paused:  agents.filter((a) => a.status === "paused").length,
  };

  const filtered = agents.filter((a) =>
    filter === "all"    ? true :
    filter === "running"? a.status === "running" :
    filter === "queued" ? a.status === "queued" :
    filter === "paused" ? a.status === "paused" : true
  );

  const togglePause = (id: string) => {
    setAgents((all) => all.map((a) =>
      a.id === id ? { ...a, status: a.status === "paused" ? "running" : "paused" } : a
    ));
  };

  return (
    <div className="main-scroll">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <h1 className="h-page">Agents</h1>
          <p className="sub-page" style={{ margin: 0 }}>
            Specialized assistants that reason over your indexed knowledge. Each cites the repos and documents
            it used to reach an answer.
          </p>
        </div>
        <button className="pill-btn"><Icon name="upload" size="sm" /> Browse marketplace</button>
        <button className="pill-btn" data-primary="true">
          <Icon name="plus" size="sm" /> Build new agent
        </button>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 14 }}>
        {[
          { l: "Active agents",    v: counts.running,                                        d: `of ${agents.length} configured`   },
          { l: "Tasks completed",  v: analytics?.task_status_counts.done        ?? "—",      d: "all time"                         },
          { l: "Tasks in progress",v: analytics?.task_status_counts.in_progress  ?? "—",     d: "running now"                      },
          { l: "Tasks failed",     v: analytics?.task_status_counts.failed       ?? "—",     d: "all time"                         },
        ].map((s, i) => (
          <div key={i} className="card stat">
            <span className="stat-l">{s.l}</span>
            <span className="stat-v">{s.v}</span>
            <span className="stat-delta">{s.d}</span>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { id: "all",     l: "All"     },
          { id: "running", l: "Running" },
          { id: "queued",  l: "Queued"  },
          { id: "paused",  l: "Paused"  },
        ].map((f) => (
          <button key={f.id} className="pill-btn"
            data-primary={filter === f.id ? "true" : undefined}
            onClick={() => setFilter(f.id)}>
            {f.l}
            {(counts as Record<string, number>)[f.id] != null && (counts as Record<string, number>)[f.id] > 0 && (
              <span className="tab-count">{(counts as Record<string, number>)[f.id]}</span>
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="pill-btn"><Icon name="sliders" size="sm" /> Sort: Recent</button>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--fg-3)", fontSize: 13 }}>
          Loading agents…
        </div>
      )}

      {/* Agent cards */}
      {!loading && (
        <div className="stack">
          {filtered.map((a) => {
            const expanded = expandedId === a.id;
            const tab = activeTab[a.id] || "activity";
            return (
              <div key={a.id} className="card agent-card-v2"
                data-expanded={expanded ? "true" : undefined}
                data-status={a.status}>
                <div className="agent-head"
                  onClick={(e) => {
                    if ((e.target as Element).closest("button")) return;
                    setExpandedId(expanded ? null : a.id);
                  }}
                  style={{ cursor: "default" }}>
                  <div className="task-icon agent-ico-lg" style={{ background: a.iconBg }}>
                    <Icon name={a.icon} />
                    {a.status === "running" && <span className="ico-pulse" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className="agent-name">{a.name}</span>
                      <span className="task-status" data-s={a.status}>{a.status}</span>
                    </div>
                    <div className="agent-prompt">{a.role}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {a.sources.map((s, i) => (
                        <span key={i} className="src-chip">
                          <Icon name={srcIcon(s)} size="sm" />
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="agent-actions">
                    <button className="pill-btn" data-primary="true"
                      disabled={a.status === "paused"}
                      onClick={(e) => e.stopPropagation()}>
                      <Icon name="play2" size="sm" /> Run
                    </button>
                    <button className="pill-btn"
                      onClick={(e) => { e.stopPropagation(); togglePause(a.id); }}
                      title={a.status === "paused" ? "Resume" : "Pause"}>
                      <Icon name={a.status === "paused" ? "play2" : "pause"} size="sm" />
                    </button>
                    <button className="pill-btn"
                      onClick={(e) => { e.stopPropagation(); setExpandedId(expanded ? null : a.id); }}>
                      <Icon name="chevd" size="sm"
                        style={{ transform: expanded ? "rotate(180deg)" : "", transition: "transform .15s" }} />
                    </button>
                    {!DEMO && (
                      <button className="pill-btn"
                        title="Remove agent"
                        onClick={(e) => { e.stopPropagation(); void handleRemove(a.id); }}>
                        <Icon name="trash" size="sm" />
                      </button>
                    )}
                  </div>
                </div>

                {!expanded && (
                  <div className="agent-steps">
                    {a.activity.slice(0, 3).map((s, i) => (
                      <div key={i} className="agent-step">
                        <span className="step-dot" data-s={s.s} />
                        <span className="step-text">{s.t}</span>
                        {s.time && <span className="step-time">{s.time}</span>}
                      </div>
                    ))}
                    {a.activity.length > 3 && (
                      <button className="link-btn" style={{ marginTop: 6, fontSize: 12 }}
                        onClick={() => { setExpandedId(a.id); setActiveTab((x) => ({ ...x, [a.id]: "activity" })); }}>
                        Show all {a.activity.length} steps →
                      </button>
                    )}
                    {a.activity.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--fg-3)", padding: "6px 0" }}>
                        No activity yet.
                      </div>
                    )}
                  </div>
                )}

                {expanded && (
                  <div className="agent-detail">
                    <div className="agent-tabs">
                      {["activity", "settings", "output"].map((tid) => (
                        <button key={tid} className="agent-tab"
                          data-active={tab === tid ? "true" : undefined}
                          onClick={() => setActiveTab((x) => ({ ...x, [a.id]: tid }))}>
                          {tid === "activity" && <Icon name="layers" size="sm" />}
                          {tid === "settings" && <Icon name="settings" size="sm" />}
                          {tid === "output"   && <Icon name="spark" size="sm" />}
                          <span style={{ textTransform: "capitalize" }}>{tid}</span>
                        </button>
                      ))}
                      <div style={{ flex: 1 }} />
                      <button className="pill-btn" style={{ height: 26 }}
                        onClick={() => setExpandedId(null)}>
                        <Icon name="chevd" size="sm" style={{ transform: "rotate(180deg)" }} /> Collapse
                      </button>
                    </div>

                    {tab === "activity" && (
                      <div className="agent-tab-panel">
                        <div className="run-history">
                          <div className="run-history-h">
                            <span>Recent runs</span>
                            <span>{a.activity.length} steps</span>
                          </div>
                          {a.activity.map((s, i) => (
                            <div key={i} className="agent-step expanded">
                              <span className="step-dot" data-s={s.s} />
                              <div style={{ flex: 1 }}>
                                <div className="step-text" style={{ fontSize: 13 }}>{s.t}</div>
                                <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 3 }}>
                                  {s.time || "pending"}{s.s === "done" ? " · 1.4s · 2 citations" : ""}
                                </div>
                              </div>
                              {s.s === "done" && <button className="pill-btn" style={{ height: 24 }}>View</button>}
                            </div>
                          ))}
                          {a.activity.length === 0 && (
                            <div style={{ fontSize: 12, color: "var(--fg-3)", padding: "12px 0" }}>
                              No activity recorded yet.
                            </div>
                          )}
                        </div>
                        <div className="run-stats">
                          {[
                            { l: "Total runs",    v: "—"   },
                            { l: "Success rate",  v: "—" },
                            { l: "Avg duration",  v: "—"},
                            { l: "Last run",      v: a.activity[0]?.time || "—" },
                          ].map((s) => (
                            <div key={s.l}><span>{s.l}</span><b>{s.v}</b></div>
                          ))}
                        </div>
                      </div>
                    )}

                    {tab === "settings" && (
                      <div className="agent-tab-panel">
                        <div className="set-group">
                          <div className="set-group-h"><h2>Prompt</h2></div>
                          <div className="set-group-body">
                            <div style={{ padding: 14, fontFamily: "'Geist Mono', monospace", fontSize: 12.5, color: "var(--fg-2)", lineHeight: 1.6 }}>
                              ✶ {a.role}
                            </div>
                          </div>
                        </div>
                        <div className="set-group">
                          <div className="set-group-h"><h2>Sources</h2></div>
                          <div className="set-group-body">
                            <div style={{ display: "flex", gap: 6, padding: 14, flexWrap: "wrap" }}>
                              {a.sources.map((s, i) => (
                                <span key={i} className="src-chip" style={{ padding: "5px 10px", fontSize: 12 }}>
                                  <Icon name={srcIcon(s)} size="sm" />
                                  {s}
                                </span>
                              ))}
                              {a.sources.length === 0 && (
                                <span style={{ fontSize: 12, color: "var(--fg-3)" }}>No sources configured.</span>
                              )}
                              <button className="pill-btn" style={{ height: 28 }}>
                                <Icon name="plus" size="sm" /> Add source
                              </button>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, padding: "14px 0 4px" }}>
                          <button className="pill-btn" data-primary="true">
                            <Icon name="settings" size="sm" /> Open full configuration
                          </button>
                          <button className="pill-btn">Export as YAML</button>
                        </div>
                      </div>
                    )}

                    {tab === "output" && (
                      <div className="agent-tab-panel">
                        {a.designs ? (
                          <>
                            <div style={{ fontSize: 12.5, color: "var(--fg-3)", marginBottom: 12 }}>
                              Latest output · {a.designs.length} design variations
                            </div>
                            <div className="design-grid">
                              {a.designs.map((d, i) => (
                                <div key={i} className="design-thumb">
                                  <div className="design-preview"
                                    style={{ background: `linear-gradient(135deg, ${d.swatch}30, ${d.swatch}10)` }}>
                                    <svg viewBox="0 0 200 130" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                                      <rect x="10" y="10" width="56"  height="36" rx="4" fill={d.swatch} opacity="0.32" />
                                      <rect x="72" y="10" width="56"  height="36" rx="4" fill={d.swatch} opacity="0.28" />
                                      <rect x="134"y="10" width="56"  height="36" rx="4" fill={d.swatch} opacity="0.32" />
                                      <rect x="10" y="54" width="180" height="68" rx="5" fill={d.swatch} opacity="0.18" />
                                    </svg>
                                  </div>
                                  <div style={{ padding: "10px 4px 0" }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.title}</div>
                                    <div style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{d.sub}</div>
                                  </div>
                                  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                                    <button className="pill-btn" style={{ height: 24, flex: 1, justifyContent: "center" }}>Open</button>
                                    <button className="pill-btn" style={{ height: 24 }}><Icon name="upload" size="sm" /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="agent-output-preview">
                            <div className="aop-head">
                              <Icon name="file" size="sm" />
                              <span style={{ fontWeight: 600, fontSize: 12.5 }}>Latest output</span>
                              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-3)" }}>{a.activity[0]?.time || "—"}</span>
                            </div>
                            <div className="aop-body">
                              <p>{a.role}. Most recent run produced citations across the indexed knowledge base.</p>
                              <p style={{ color: "var(--fg-2)", fontSize: 12 }}>
                                <b>Citations:</b> atlas-api/src/auth.ts · atlas-edge/src/runtime.rs · RFC-014.pdf §4.2
                              </p>
                            </div>
                            <div style={{ display: "flex", gap: 6, padding: 12, borderTop: "0.5px solid var(--hairline)" }}>
                              <button className="pill-btn"><Icon name="sparkle" size="sm" /> Discuss with TEOS</button>
                              <button className="pill-btn"><Icon name="upload" size="sm" /> Export</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button className="card empty-card">
            <Icon name="plus" />
            <div>
              <b>Build a new agent</b>
              <div>Describe a job — TEOS will turn it into a reusable agent</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
