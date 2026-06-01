import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { listDesignSessions, createDesignSession } from "../../lib/api";
import type { DesignSession } from "../../types";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

// ─── Mock data (DEMO mode only) ───────────────────────────────────────────────

const MOCK_DESIGNS = [
  {
    id: "d-billing-density", title: "Billing dashboard — density-first", accent: "#0a84ff",
    status: "review",  brand: "Acme Brand v3", author: "TEOS Designer", time: "32 min ago",
    components: ["DataTable", "KpiCard", "FilterBar", "Toolbar"],
    prompt: "Redesign the billing dashboard to fit dense tabular data with KPIs above the fold.",
    versions: [
      { id: "v1", label: "v1",           summary: "First sketch — KPIs in a row, basic table.",      variant: "a" },
      { id: "v2", label: "v2",           summary: "Pinned the KPI strip, compacted row heights.",      variant: "b" },
      { id: "v3", label: "v3 · current", summary: "Added inline status chips & quick filters.",        variant: "c" },
    ],
  },
  {
    id: "d-billing-narr", title: "Billing dashboard — narrative", accent: "#bf5af2",
    status: "review",  brand: "Acme Brand v3", author: "TEOS Designer", time: "32 min ago",
    components: ["HeroBlock", "Section", "CalloutCard", "KpiCard"],
    prompt: "Redesign the billing dashboard as a scrollytelling, narrative layout.",
    versions: [{ id: "v1", label: "v1 · current", summary: "Scrollytelling layout.", variant: "a" }],
  },
  {
    id: "d-billing-ops", title: "Billing dashboard — ops control", accent: "#30d158",
    status: "approved", brand: "Acme Brand v3", author: "TEOS Designer", time: "32 min ago",
    components: ["KpiCard", "ChartTile", "EventStream", "QuickActions"],
    prompt: "Redesign the billing dashboard as an ops-control room with KPIs up top.",
    versions: [
      { id: "v1", label: "v1",           summary: "Five KPIs across the top.",                              variant: "a" },
      { id: "v2", label: "v2 · current", summary: "Tightened to four KPIs + live event stream.",            variant: "b" },
    ],
  },
  {
    id: "d-onboarding", title: "Onboarding — 4-step setup", accent: "#ff9f0a",
    status: "draft",   brand: "Acme Brand v3", author: "TEOS Designer", time: "yesterday",
    components: ["Stepper", "FormCard", "FilePicker", "EmptyState"],
    prompt: "New user onboarding for connecting first repo and uploading a brand kit.",
    versions: [{ id: "v1", label: "v1 · current", summary: "Top stepper + card form.", variant: "a" }],
  },
  {
    id: "d-settings", title: "Settings — workspace admin", accent: "#5e5ce6",
    status: "approved", brand: "Acme Brand v3", author: "TEOS Designer", time: "2 days ago",
    components: ["SectionNav", "FormGroup", "Toggle", "Select"],
    prompt: "Workspace admin settings with section nav and dense form layout.",
    versions: [{ id: "v1", label: "v1 · current", summary: "Left nav + grouped form rows.", variant: "a" }],
  },
  {
    id: "d-empty", title: "Empty inbox — illustrated", accent: "#ff375f",
    status: "draft",   brand: "Acme Brand v3", author: "TEOS Designer", time: "3 days ago",
    components: ["EmptyState", "Illustration", "PrimaryButton"],
    prompt: "Empty-state for when the inbox is fully triaged. Warm, illustrative.",
    versions: [{ id: "v1", label: "v1 · current", summary: "Centered illustration + copy.", variant: "a" }],
  },
  {
    id: "d-pricing", title: "Pricing page — 3 tiers", accent: "#64d2ff",
    status: "review",  brand: "Acme Brand v3", author: "TEOS Designer", time: "5 days ago",
    components: ["PricingCard", "FeatureTable", "FAQAccordion"],
    prompt: "Public pricing page with three tiers and feature comparison.",
    versions: [{ id: "v1", label: "v1 · current", summary: "Three cards, middle tier featured.", variant: "a" }],
  },
  {
    id: "d-login", title: "Sign-in — Okta SSO", accent: "#0a84ff",
    status: "approved", brand: "Acme Brand v3", author: "TEOS Designer", time: "1 week ago",
    components: ["AuthCard", "Input", "SSOButton", "FootLink"],
    prompt: "Sign-in screen with email/password and Okta SSO option.",
    versions: [{ id: "v1", label: "v1 · current", summary: "Centered card with SSO button on top.", variant: "a" }],
  },
  {
    id: "d-list", title: "Repositories — list view", accent: "#bf5af2",
    status: "draft",   brand: "Acme Brand v3", author: "TEOS Designer", time: "1 week ago",
    components: ["DataTable", "FilterPill", "Toolbar"],
    prompt: "Alternative dense list layout for the repositories page.",
    versions: [{ id: "v1", label: "v1 · current", summary: "Dense table with status column.", variant: "a" }],
  },
];

// ─── Accent palette for real sessions ────────────────────────────────────────

const ACCENTS = ["#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#5e5ce6", "#ff375f", "#64d2ff", "#ff9f0a"];

function accentForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

// ─── Map DesignSession → card shape ──────────────────────────────────────────

type FilterKey = "all" | "active" | "running" | "archived" | "done";

interface DesignCard {
  id: string;
  title: string;
  accent: string;
  status: string;
  author: string;
  time: string;
  components: string[];
  versions: { id: string; label: string; summary: string; variant: string }[];
  layerLabel: string;
}

function sessionToCard(s: DesignSession, index: number): DesignCard {
  const statusMap: Record<string, string> = {
    active:   "running",
    archived: "done",
  };
  const relTime = (() => {
    try {
      const diff = Date.now() - new Date(s.updated_at).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return "recently";
    }
  })();
  return {
    id: s.id,
    title: s.title ?? "Untitled",
    accent: accentForId(s.id),
    status: statusMap[s.status] ?? s.status,
    author: "TEOS Designer",
    time: relTime,
    components: [],
    layerLabel: s.layer_type.replace(/_/g, " "),
    versions: [
      {
        id: `${s.id}-v1`,
        label: `v${index + 1} · current`,
        summary: s.layer_type.replace(/_/g, " "),
        variant: "a",
      },
    ],
  };
}

const STATUS_COLOR: Record<string, string> = {
  approved: "#30d158",
  review:   "#ff9f0a",
  draft:    "#5e5ce6",
  running:  "#0a84ff",
  done:     "#30d158",
  active:   "#0a84ff",
  archived: "#98989d",
};

// ─── SVG thumbnail ────────────────────────────────────────────────────────────

function DesignThumb({ seed, accent }: { seed: number; accent: string }) {
  if (seed % 3 === 0) return (
    <svg viewBox="0 0 200 130" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="180" height="14" rx="3" fill={accent} opacity="0.5" />
      <rect x="10" y="32" width="60"  height="90" rx="4" fill={accent} opacity="0.18" />
      <rect x="78" y="32" width="112" height="20" rx="3" fill={accent} opacity="0.28" />
      <rect x="78" y="58" width="112" height="14" rx="3" fill={accent} opacity="0.18" />
      <rect x="78" y="78" width="112" height="14" rx="3" fill={accent} opacity="0.18" />
      <rect x="78" y="98" width="78"  height="14" rx="3" fill={accent} opacity="0.18" />
    </svg>
  );
  if (seed % 3 === 1) return (
    <svg viewBox="0 0 200 130" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="14"  width="160" height="40" rx="6" fill={accent} opacity="0.3" />
      <rect x="20" y="62"  width="90"  height="10" rx="3" fill={accent} opacity="0.4" />
      <rect x="20" y="78"  width="160" height="8"  rx="3" fill={accent} opacity="0.2" />
      <rect x="20" y="92"  width="160" height="8"  rx="3" fill={accent} opacity="0.2" />
      <rect x="20" y="106" width="120" height="8"  rx="3" fill={accent} opacity="0.2" />
    </svg>
  );
  return (
    <svg viewBox="0 0 200 130" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect x="10"  y="10" width="56"  height="36" rx="4" fill={accent} opacity="0.32" />
      <rect x="72"  y="10" width="56"  height="36" rx="4" fill={accent} opacity="0.28" />
      <rect x="134" y="10" width="56"  height="36" rx="4" fill={accent} opacity="0.32" />
      <rect x="10"  y="54" width="180" height="68" rx="5" fill={accent} opacity="0.18" />
      <rect x="20"  y="64" width="68"  height="6"  rx="2" fill={accent} opacity="0.5"  />
      <rect x="20"  y="76" width="160" height="4"  rx="2" fill={accent} opacity="0.3"  />
      <rect x="20"  y="86" width="160" height="4"  rx="2" fill={accent} opacity="0.3"  />
      <rect x="20"  y="96" width="120" height="4"  rx="2" fill={accent} opacity="0.3"  />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectDesigns({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<DesignCard[]>(DEMO ? MOCK_DESIGNS as unknown as DesignCard[] : []);
  const [loading, setLoading]   = useState(!DEMO);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter]     = useState<FilterKey>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (DEMO) return;
    setLoading(true);
    listDesignSessions(projectId)
      .then((sessions) => setDesigns(sessions.map((s, i) => sessionToCard(s, i))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleNewDesign = async () => {
    if (DEMO || creating) return;
    setCreating(true);
    try {
      const session = await createDesignSession(projectId);
      setDesigns((prev) => [sessionToCard(session, 0), ...prev]);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const DESIGNS = designs;

  const filtered = filter === "all" ? DESIGNS : DESIGNS.filter((d) => d.status === filter);

  const filterCounts = {
    all:      DESIGNS.length,
    approved: DESIGNS.filter((d) => d.status === "approved").length,
    review:   DESIGNS.filter((d) => d.status === "review").length,
    draft:    DESIGNS.filter((d) => d.status === "draft").length,
    running:  DESIGNS.filter((d) => d.status === "running").length,
    active:   DESIGNS.filter((d) => d.status === "active").length,
    done:     DESIGNS.filter((d) => d.status === "done").length,
    archived: DESIGNS.filter((d) => d.status === "archived").length,
  };

  // Determine which filter tabs to show
  const filterTabs = (DEMO
    ? [
        { key: "all" as FilterKey,      label: "All"      },
        { key: "approved" as FilterKey, label: "Approved" },
        { key: "review" as FilterKey,   label: "Review"   },
        { key: "draft" as FilterKey,    label: "Draft"    },
      ]
    : [
        { key: "all" as FilterKey,     label: "All"      },
        { key: "running" as FilterKey, label: "Active"   },
        { key: "done" as FilterKey,    label: "Archived" },
      ]) as { key: FilterKey; label: string }[];

  return (
    <div className="main-scroll">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <h1 className="h-page">Designs</h1>
          <p className="sub-page" style={{ margin: 0 }}>
            Interfaces designed by TEOS Designer using your brand kit and component library.
            Each iteration is versioned and citable.
          </p>
        </div>
        <button className="pill-btn" data-primary="true" onClick={handleNewDesign} disabled={creating}>
          <Icon name="spark" size="sm" /> {creating ? "Creating…" : "New design"}
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {filterTabs.map((f) => (
          <button key={f.key} className="pill-btn" data-primary={filter === f.key ? "true" : undefined}
            onClick={() => setFilter(f.key)}>
            {f.label}
            {(filterCounts as Record<string, number>)[f.key] > 0 && (
              <span className="tab-count">{(filterCounts as Record<string, number>)[f.key]}</span>
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="pill-btn"><Icon name="sliders" size="sm" /> Sort: Recent</button>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--fg-3)", fontSize: 13 }}>
          Loading designs…
        </div>
      )}

      {/* Design cards grid */}
      {!loading && (
        <div className="designs-grid">
          {filtered.map((d, i) => {
            const isExpanded = expanded === d.id;
            const statusColor = STATUS_COLOR[d.status] || "var(--fg-3)";
            const subLabel = (d as DesignCard & { layerLabel?: string }).layerLabel;
            return (
              <div key={d.id} className="design-card">
                {/* Preview thumbnail */}
                <div className="design-preview-thumb"
                  style={{ background: `linear-gradient(135deg, ${d.accent}30, ${d.accent}10)` }}>
                  <DesignThumb seed={i} accent={d.accent} />
                </div>

                {/* Card body */}
                <div style={{ padding: "12px 14px 10px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 3 }}>
                        {subLabel ? `${subLabel} · ` : ""}{d.author} · {d.time}
                      </div>
                    </div>
                    <span className="design-status"
                      style={{ background: statusColor + "20", color: statusColor, border: `0.5px solid ${statusColor}40` }}>
                      {d.status}
                    </span>
                  </div>

                  {/* Component chips (only when present) */}
                  {d.components.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                      {d.components.slice(0, 3).map((c) => (
                        <span key={c} className="crumb-tag" style={{ fontSize: 11 }}>{c}</span>
                      ))}
                      {d.components.length > 3 && (
                        <span className="crumb-tag" style={{ fontSize: 11 }}>+{d.components.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Version history toggle */}
                  <button
                    className="link-btn"
                    style={{ fontSize: 12, marginBottom: 6 }}
                    onClick={() => setExpanded(isExpanded ? null : d.id)}
                  >
                    {d.versions.length} version{d.versions.length !== 1 ? "s" : ""}{" "}
                    {isExpanded ? "↑" : "↓"}
                  </button>

                  {isExpanded && (
                    <div style={{ marginBottom: 10 }}>
                      {d.versions.map((v) => (
                        <div key={v.id} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "5px 0", borderBottom: "0.5px solid var(--hairline)",
                          fontSize: 12,
                        }}>
                          <span className="crumb-tag" style={{ fontSize: 10, flexShrink: 0 }}>{v.label}</span>
                          <span style={{ flex: 1, color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {v.summary}
                          </span>
                          <button
                            className="pill-btn"
                            style={{ height: 22, fontSize: 10 }}
                            onClick={() => { if (!DEMO) navigate(`/projects/${projectId}/design/${d.id}`); }}
                          >Open</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="pill-btn"
                      data-primary="true"
                      style={{ flex: 1, justifyContent: "center", height: 28 }}
                      onClick={() => {
                        if (!DEMO) navigate(`/projects/${projectId}/design/${d.id}`);
                      }}
                    >
                      <Icon name="eye" size="sm" /> Open
                    </button>
                    <button
                      className="pill-btn"
                      style={{ height: 28 }}
                      onClick={() => {
                        if (!DEMO) navigate(`/projects/${projectId}/design/${d.id}`);
                      }}
                    >
                      <Icon name="spark" size="sm" /> Iterate
                    </button>
                    <button className="pill-btn" style={{ height: 28 }}>
                      <Icon name="upload" size="sm" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--fg-3)", fontSize: 13 }}>
          No designs in this filter. Ask TEOS Designer to create one.
        </div>
      )}
    </div>
  );
}
