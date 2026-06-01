import { useState, useEffect } from "react";
import { Icon } from "../../components/Icon";
import { listProjectMcps, listProjectSkills, createProjectMcp, deleteProjectMcp } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { ProjectMcp, ProjectSkill } from "../../types";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

const MCP_SERVERS = [
  { id: "mcp-github",   name: "GitHub",              scope: "global",  description: "Read repos, branches, PRs, issues and CI status.", transport: "stdio · @modelcontextprotocol/server-github", icon: "git",      color: "#1f2328", status: "connected",    tools: 18, version: "1.4.2", author: "TelaiOS · verified", lastUsed: "2m ago" },
  { id: "mcp-figma",    name: "Figma",               scope: "global",  description: "Pull components, frames and design tokens from your team library.", transport: "http · figma.com/api", icon: "spark",    color: "#a259ff", status: "connected",    tools: 9,  version: "2.1.0", author: "TelaiOS · verified", lastUsed: "32m ago" },
  { id: "mcp-linear",   name: "Linear",              scope: "global",  description: "Query and update tickets, cycles, projects and roadmaps.", transport: "http · linear.app/api", icon: "layers",   color: "#5e6ad2", status: "connected",    tools: 14, version: "0.9.3", author: "Linear", lastUsed: "1h ago" },
  { id: "mcp-slack",    name: "Slack",               scope: "global",  description: "Post messages, read channels, look up users.", transport: "http · slack.com/api", icon: "chat",     color: "#4a154b", status: "disconnected", tools: 11, version: "1.0.7", author: "Slack", lastUsed: "—" },
  { id: "mcp-postgres", name: "Atlas Postgres",      scope: "project", description: "Read-only access to the staging Postgres cluster.", transport: "stdio · @modelcontextprotocol/server-postgres", icon: "cube",     color: "#336791", status: "connected",    tools: 6,  version: "1.2.0", author: "Acme · Platform", lastUsed: "12m ago" },
  { id: "mcp-sentry",   name: "Sentry — Atlas",      scope: "project", description: "Browse exceptions, traces and release health for atlas-*.", transport: "http · sentry.io/api", icon: "issue",    color: "#362d59", status: "connected",    tools: 7,  version: "0.5.1", author: "Acme · SRE", lastUsed: "4m ago" },
  { id: "mcp-fs",       name: "Workspace Filesystem", scope: "project", description: "Local read/write access to the cloned atlas-* repos.", transport: "stdio · @modelcontextprotocol/server-filesystem", icon: "folder",   color: "#0a84ff", status: "connected",    tools: 5,  version: "1.0.0", author: "TelaiOS", lastUsed: "now" },
  { id: "mcp-stripe",   name: "Stripe (sandbox)",    scope: "global",  description: "Read customers, subscriptions and events in test mode.", transport: "http · stripe.com/api", icon: "cube",     color: "#635bff", status: "needs-auth",   tools: 23, version: "1.8.0", author: "Stripe", lastUsed: "—" },
];

const SKILLS = [
  { id: "sk-rfc",      name: "RFC drafter",          slug: "rfc-drafter",       scope: "global",  description: "Drafts a structured RFC from a feature brief.", icon: "book",     color: "#0a84ff", runs: 142, lastUsed: "1h ago",  version: "1.4.0", license: "MIT",    tags: ["writing", "planning"] },
  { id: "sk-diagram",  name: "Diagram drawer",        slug: "diagram-drawer",    scope: "global",  description: "Generates Mermaid call graphs, sequence diagrams, and ER diagrams from source.", icon: "layers",   color: "#bf5af2", runs: 88,  lastUsed: "2d ago",  version: "0.9.3", license: "MIT",    tags: ["visual", "analysis"] },
  { id: "sk-pr",       name: "PR reviewer",           slug: "pr-reviewer",       scope: "global",  description: "Posts inline review comments on a pull request grounded in the repository's conventions.", icon: "pr",       color: "#30d158", runs: 312, lastUsed: "12m ago", version: "2.1.0", license: "Apache-2.0", tags: ["code", "quality"] },
  { id: "sk-tests",    name: "Test generator",        slug: "test-generator",    scope: "global",  description: "Authors unit and integration tests for a target module.", icon: "check",    color: "#30d158", runs: 64,  lastUsed: "5h ago",  version: "1.0.2", license: "MIT",    tags: ["code", "testing"] },
  { id: "sk-ui-mock",  name: "UI mockup composer",    slug: "ui-mockup-composer", scope: "global", description: "Composes high-fidelity HTML mockups using the linked brand kit's tokens and components.", icon: "spark",    color: "#ff9f0a", runs: 47,  lastUsed: "32m ago", version: "0.7.1", license: "MIT",    tags: ["design"] },
  { id: "sk-sql",      name: "SQL writer (Atlas)",    slug: "atlas-sql-writer",  scope: "project", description: "Authors safe read-only SELECT queries against the Atlas Postgres schema.", icon: "terminal", color: "#5e6ad2", runs: 28,  lastUsed: "18m ago", version: "0.4.0", license: "Proprietary", tags: ["data", "code"] },
  { id: "sk-brand",    name: "Brand-kit checker",     slug: "atlas-brand-checker", scope: "project", description: "Validates a UI mockup against the Atlas brand kit's tokens and accessibility floor.", icon: "check",    color: "#30d158", runs: 18,  lastUsed: "1h ago",  version: "0.3.2", license: "Proprietary", tags: ["design", "quality"] },
  { id: "sk-incident", name: "Incident triager",      slug: "incident-triager",  scope: "project", description: "Walks an on-call engineer through severity assignment and runbook steps for a live incident.", icon: "issue",    color: "#ff375f", runs: 9,   lastUsed: "1d ago",  version: "0.2.0", license: "Proprietary", tags: ["ops"] },
];

// ─── API → UI helpers ─────────────────────────────────────────────────────────

function mcpToUi(m: ProjectMcp) {
  return {
    id: m.id, name: m.name, scope: "project" as const,
    description: m.description ?? "",
    transport: m.transport === "stdio" ? `stdio · ${m.command ?? ""}` : `http · ${m.url ?? ""}`,
    icon: "cube" as const, color: "#0a84ff", status: "connected" as const,
    tools: 0, version: "—", author: "Custom", lastUsed: "—",
  };
}

function skillToUi(s: ProjectSkill) {
  return {
    id: s.id, name: s.name, scope: "project" as const,
    slug: s.slug, description: s.description ?? "",
    icon: "book" as const, color: "#bf5af2",
    runs: 0, lastUsed: "—", version: "—", license: "Custom", tags: [] as string[],
  };
}

const EMPTY_MCP_FORM = { name: "", transport: "stdio" as "stdio" | "streamable-http", command: "", url: "" };

export default function ProjectLibrary({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<"mcp" | "skills">("mcp");
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "project">("all");
  const [addMcpOpen, setAddMcpOpen] = useState(false);
  const [mcpForm, setMcpForm] = useState(EMPTY_MCP_FORM);
  const [saving, setSaving] = useState(false);
  const [apiMcps, setApiMcps] = useState<ReturnType<typeof mcpToUi>[]>([]);
  const [apiSkills, setApiSkills] = useState<ReturnType<typeof skillToUi>[]>([]);

  const reloadMcps = () => {
    listProjectMcps(projectId).then((data) => setApiMcps(data.map(mcpToUi))).catch(() => {});
  };

  useEffect(() => {
    if (DEMO) return;
    reloadMcps();
    listProjectSkills(projectId).then((data) => setApiSkills(data.map(skillToUi))).catch(() => {});
  }, [projectId]);

  const handleAddMcp = async () => {
    if (!mcpForm.name.trim()) return;
    setSaving(true);
    try {
      const slug = mcpForm.name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      await createProjectMcp(projectId, {
        name: mcpForm.name.trim(),
        slug,
        transport: mcpForm.transport,
        command: mcpForm.transport === "stdio" ? mcpForm.command.trim() || undefined : undefined,
        url: mcpForm.transport !== "stdio" ? mcpForm.url.trim() || undefined : undefined,
      });
      reloadMcps();
      setMcpForm(EMPTY_MCP_FORM);
      setAddMcpOpen(false);
      toast.success("MCP server added");
    } catch {
      toast.error("Failed to add MCP server");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMcp = async (mcpId: string) => {
    try {
      await deleteProjectMcp(projectId, mcpId);
      setApiMcps((prev) => prev.filter((m) => m.id !== mcpId));
      toast.success("MCP server removed");
    } catch {
      toast.error("Failed to remove MCP server");
    }
  };

  // Merge mock globals with real project-scoped items
  const allMcps = DEMO ? MCP_SERVERS : [
    ...MCP_SERVERS.filter((s) => s.scope === "global"),
    ...apiMcps,
  ];
  const allSkills = DEMO ? SKILLS : [
    ...SKILLS.filter((s) => s.scope === "global"),
    ...apiSkills,
  ];

  const mcpFiltered = allMcps.filter((s) => scopeFilter === "all" || s.scope === scopeFilter);
  const skillsFiltered = allSkills.filter((s) => scopeFilter === "all" || s.scope === scopeFilter);

  return (
    <>
      <h1 className="h-page">Library</h1>
      <p className="sub-page">MCP servers and skills your agents can use. Global items are shared across the workspace; project items are scoped to Atlas.</p>

      <div className="grid-4" style={{ marginBottom: 14 }}>
        {[
          { l: "MCP servers",    v: allMcps.length, d: `${allMcps.filter(s => s.status === "connected").length} connected` },
          { l: "Skills",         v: allSkills.length, d: "agent instruction packs" },
          { l: "Total tools",    v: allMcps.reduce((a, s) => a + s.tools, 0), d: "across all servers" },
          { l: "Skill runs",     v: allSkills.reduce((a, s) => a + s.runs, 0), d: "this month" },
        ].map((s, i) => (
          <div key={i} className="card stat">
            <span className="stat-l">{s.l}</span>
            <span className="stat-v">{s.v}</span>
            <span className="stat-delta">{s.d}</span>
          </div>
        ))}
      </div>

      {/* Tabs + filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div className="seg">
          <button className="seg-btn" data-active={tab === "mcp"} onClick={() => setTab("mcp")}>
            MCP Servers <span className="tab-count">{allMcps.length}</span>
          </button>
          <button className="seg-btn" data-active={tab === "skills"} onClick={() => setTab("skills")}>
            Skills <span className="tab-count">{allSkills.length}</span>
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div className="seg">
          {(["all", "global", "project"] as const).map((s) => (
            <button key={s} className="seg-btn" data-active={scopeFilter === s} onClick={() => setScopeFilter(s)}>{s}</button>
          ))}
        </div>
        {tab === "mcp" && (
          <button className="pill-btn" data-primary="true" onClick={() => setAddMcpOpen(true)}>
            <Icon name="plus" size="sm" /> Add server
          </button>
        )}
      </div>

      {tab === "mcp" && (
        <div className="stack">
          {mcpFiltered.map((s) => (
            <div key={s.id} className="card lib-card">
              <div className="lib-card-h">
                <div className="lib-card-ico" style={{ background: s.color + "22", color: s.color }}>
                  <Icon name={s.icon} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="lib-card-name">{s.name}</span>
                    <span className="scope-pill" data-s={s.scope}>{s.scope}</span>
                    <span className="lib-status" data-s={s.status}>
                      <span className="lib-status-dot" />{s.status}
                    </span>
                  </div>
                  <div className="lib-card-desc">{s.description}</div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 4 }}>
                    <span className="mono">{s.transport}</span> · v{s.version} · by {s.author}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
                      <b style={{ color: "var(--fg-2)" }}>{s.tools}</b> tools · used {s.lastUsed}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {s.scope === "project" && !DEMO ? (
                      <button className="pill-btn danger" title="Remove" onClick={() => handleDeleteMcp(s.id)}>
                        <Icon name="trash" size="sm" />
                      </button>
                    ) : s.status === "connected" ? (
                      <button className="pill-btn"><Icon name="settings" size="sm" /></button>
                    ) : (
                      <button className="pill-btn" data-primary="true">
                        <Icon name="play2" size="sm" /> Connect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button className="card empty-card" onClick={() => setAddMcpOpen(true)}>
            <Icon name="plus" />
            <div>
              <b>Add an MCP server</b>
              <div>stdio, HTTP, or any Model Context Protocol server</div>
            </div>
          </button>
        </div>
      )}

      {tab === "skills" && (
        <div className="stack">
          {skillsFiltered.map((s) => (
            <div key={s.id} className="card lib-card">
              <div className="lib-card-h">
                <div className="lib-card-ico" style={{ background: s.color + "22", color: s.color }}>
                  <Icon name={s.icon} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="lib-card-name">{s.name}</span>
                    <span className="scope-pill" data-s={s.scope}>{s.scope}</span>
                    <span style={{ fontSize: 11, color: "var(--fg-3)" }}>v{s.version}</span>
                    <span style={{ fontSize: 11, color: "var(--fg-3)"}}>{s.license}</span>
                  </div>
                  <div className="lib-card-desc">{s.description}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {s.tags.map((t) => (
                      <span key={t} className="crumb-tag" style={{ fontSize: 10.5 }}>{t}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                  <span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
                    <b style={{ color: "var(--fg-2)" }}>{s.runs}</b> runs · {s.lastUsed}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="pill-btn"><Icon name="eye" size="sm" /> View</button>
                    <button className="pill-btn"><Icon name="settings" size="sm" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button className="card empty-card">
            <Icon name="plus" />
            <div>
              <b>Add a skill</b>
              <div>Upload a SKILL.md folder or paste a git URL</div>
            </div>
          </button>
        </div>
      )}

      {addMcpOpen && (
        <div className="cmd-overlay" onClick={() => { setAddMcpOpen(false); setMcpForm(EMPTY_MCP_FORM); }}>
          <div className="cmd-panel" onClick={(e) => e.stopPropagation()} style={{ width: 540, padding: 0 }}>
            <div style={{ padding: "20px 22px 6px" }}>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>Add MCP server</div>
              <div style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 4 }}>Connect a Model Context Protocol server to give agents new tools.</div>
            </div>
            <div style={{ padding: "12px 22px 0", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div className="form-l">Name</div>
                <input
                  className="form-input"
                  placeholder="My MCP server"
                  value={mcpForm.name}
                  onChange={(e) => setMcpForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <div className="form-l">Transport</div>
                <div className="seg">
                  {(["stdio", "streamable-http"] as const).map((t) => (
                    <button key={t} className="seg-btn"
                      data-active={mcpForm.transport === t}
                      onClick={() => setMcpForm((f) => ({ ...f, transport: t }))}>
                      {t === "stdio" ? "stdio" : "http"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="form-l">{mcpForm.transport === "stdio" ? "Command" : "URL"}</div>
                <input
                  className="form-input"
                  placeholder={mcpForm.transport === "stdio" ? "npx @modelcontextprotocol/server-github" : "https://my-mcp-server.com/mcp"}
                  value={mcpForm.transport === "stdio" ? mcpForm.command : mcpForm.url}
                  onChange={(e) => setMcpForm((f) =>
                    mcpForm.transport === "stdio"
                      ? { ...f, command: e.target.value }
                      : { ...f, url: e.target.value }
                  )}
                />
              </div>
            </div>
            <div style={{ padding: 18, display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "0.5px solid var(--hairline)", marginTop: 16 }}>
              <button className="pill-btn" onClick={() => { setAddMcpOpen(false); setMcpForm(EMPTY_MCP_FORM); }}>Cancel</button>
              <button className="pill-btn" data-primary="true"
                disabled={!mcpForm.name.trim() || saving}
                onClick={handleAddMcp}>
                {saving ? "Adding…" : "Connect server"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
