import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getProjects, sendConversationMessage } from "../lib/api";
import type { Project } from "../types";
import { Icon } from "./Icon";
import MeshBackground from "./MeshBackground";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

// Project view components
import ProjectDashboard from "../pages/project/ProjectDashboard";
import ProjectConversation from "../pages/project/ProjectConversation";
import ProjectRepositories from "../pages/project/ProjectRepositories";
import ProjectDocuments from "../pages/project/ProjectDocuments";
import ProjectDesigns from "../pages/project/ProjectDesigns";
import ProjectAgents from "../pages/project/ProjectAgents";
import ProjectLibrary from "../pages/project/ProjectLibrary";
import ProjectPlans from "../pages/project/ProjectPlans";
import ProjectTeam from "../pages/project/ProjectTeam";
import ProjectInbox from "../pages/project/ProjectInbox";
import ProjectMembers from "../pages/project/ProjectMembers";
import ProjectSettings from "../pages/project/ProjectSettings";

// Workspace view components
import WorkspaceProjects  from "../pages/workspace/WorkspaceProjects";
import WorkspaceLibrary   from "../pages/workspace/WorkspaceLibrary";
import WorkspaceAnalytics from "../pages/workspace/WorkspaceAnalytics";
import WorkspaceAgents    from "../pages/workspace/WorkspaceAgents";
import WorkspaceUsers     from "../pages/workspace/WorkspaceUsers";
import WorkspaceSettings  from "../pages/workspace/WorkspaceSettings";

export type ProjectView =
  | "dashboard" | "conversation" | "repositories" | "documents"
  | "designs" | "agents" | "library" | "plans" | "team"
  | "inbox" | "members" | "settings";

export type WsView = "projects" | "library" | "analytics" | "agents" | "users" | "settings";

const WS_VIEW_LABELS: Record<WsView, string> = {
  projects:  "Projects",
  library:   "Library",
  analytics: "Analytics",
  agents:    "Agent Profiles",
  users:     "Users",
  settings:  "Settings",
};

const WS_NAV = [
  { id: "projects",  label: "Projects",       icon: "home",     href: "/" },
  { id: "library",   label: "Library",        icon: "cube",     href: "/library" },
  { id: "analytics", label: "Analytics",      icon: "layers",   href: "/analytics" },
  { id: "agents",    label: "Agent Profiles", icon: "bot",      href: "/agents" },
] as const;

const WS_ADMIN_NAV = [
  { id: "users",    label: "Users",    icon: "users",    href: "/users" },
  { id: "settings", label: "Settings", icon: "settings", href: "/settings" },
] as const;

const VIEW_LABELS: Record<ProjectView, string> = {
  dashboard: "Dashboard", conversation: "Conversation", repositories: "Repositories",
  documents: "Documents", designs: "Designs", agents: "Agents", library: "Library",
  plans: "Plans", team: "Team", inbox: "Inbox", members: "Members", settings: "Settings",
};

const SPECIALISTS: Record<string, { name: string; icon: string; color: string; tagline: string }> = {
  qa:       { name: "Q&A",      icon: "chat",     color: "#0a84ff", tagline: "Answers grounded in your indexed sources." },
  explorer: { name: "Explorer", icon: "search",   color: "#64d2ff", tagline: "Finds and surfaces relevant context." },
  reverse:  { name: "Reverse",  icon: "layers",   color: "#bf5af2", tagline: "Reverse-engineers code into diagrams & prose." },
  planner:  { name: "Planner",  icon: "workflow", color: "#30d158", tagline: "Cross-repo implementation plans." },
  coder:    { name: "Coder",    icon: "code",     color: "#5e5ce6", tagline: "Drafts and refactors code." },
  designer: { name: "Designer", icon: "spark",    color: "#ff9f0a", tagline: "Designs UIs matching your brand & components." },
  reviewer: { name: "Reviewer", icon: "pr",       color: "#ff375f", tagline: "Reviews PRs, diffs and architecture." },
};

const PROJECT_COLORS = ["#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#ff375f", "#5e5ce6"];

const MOCK_NOTIFICATIONS: never[] = [];

const COMMANDS = [
  { section: "Ask TEOS", items: [
    { i: "chat",     name: "How does the edge tier handle expired refresh tokens?", kind: "Q&A",     view: null },
    { i: "layers",   name: "Reverse-engineer the payments flow",                   kind: "Reverse",  view: null },
    { i: "workflow", name: "Plan: add SSO via Okta",                               kind: "Feature",  view: null },
  ]},
  { section: "Navigate", items: [
    { i: "home",   name: "Dashboard",    kind: "Nav", view: "dashboard" },
    { i: "git",    name: "Repositories", kind: "Nav", view: "repositories" },
    { i: "book",   name: "Documents",    kind: "Nav", view: "documents" },
    { i: "bot",    name: "Agents",       kind: "Nav", view: "agents" },
    { i: "cube",   name: "Library",      kind: "Nav", view: "library" },
    { i: "inbox",  name: "Inbox",        kind: "Nav", view: "inbox" },
  ]},
];

export default function ProjectLayout({ wsView }: { wsView?: WsView } = {}) {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  const [project, setProject] = useState<Project | null>(null);
  const [sidebarProjects, setSidebarProjects] = useState<{ id: string; name: string; color: string }[]>([]);
  const [view, setView] = useState<ProjectView>("dashboard");
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [density] = useState<"compact" | "regular" | "comfy">("regular");

  // TEOS sidebar state
  const [teosMessages, setTeosMessages] = useState<Array<{ role: string; text: string; specialist?: string }>>([]);
  const [teosBusy, setTeosBusy] = useState(false);
  const [teosDraft, setTeosDraft] = useState("");
  const [teosStreamContent, setTeosStreamContent] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const teosStreamRef = useRef("");
  const sidebarEsRef = useRef<EventSource | null>(null);

  // Load current project and sidebar project list
  useEffect(() => {
    getProjects().then(({ items }) => {
      const p = projectId ? (items.find((x) => x.id === projectId) ?? null) : null;
      setProject(p);
      setSidebarProjects(
        items.slice(0, 6).map((item, i) => ({
          id: item.id,
          name: item.name,
          color: PROJECT_COLORS[i % PROJECT_COLORS.length],
        }))
      );
    }).catch(() => {});
  }, [projectId]);

  // AI sidebar SSE connection (project mode only)
  useEffect(() => {
    if (!projectId || wsView || DEMO) return;
    const token = localStorage.getItem("swe_auth_token") ?? "";
    const es = new EventSource(`/api/projects/${projectId}/conversation/stream${token ? `?token=${token}` : ""}`);
    sidebarEsRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>;
        if (data.type === "token") {
          teosStreamRef.current += (data.token as string) ?? "";
          setTeosStreamContent(teosStreamRef.current);
          setTeosBusy(true);
        } else if (data.type === "message") {
          const msg = data.message as { sender_type: string; content: string; specialist?: string } | undefined;
          if (msg?.sender_type === "agent") {
            setTeosMessages((m) => [...m, { role: "assistant", specialist: msg.specialist, text: msg.content }]);
            teosStreamRef.current = "";
            setTeosStreamContent("");
            setTeosBusy(false);
          }
        } else if (data.type === "agent_start") {
          teosStreamRef.current = "";
          setTeosStreamContent("");
          setTeosBusy(true);
        } else if (data.type === "agent_end") {
          if (!teosStreamRef.current) setTeosBusy(false);
        }
      } catch { /* ignore malformed events */ }
    };

    return () => {
      es.close();
      sidebarEsRef.current = null;
    };
  }, [projectId]);

  // ⌘K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Collapse AI sidebar when Conversation view is active (same engine)
  useEffect(() => {
    if (view === "conversation") setAiCollapsed(true);
  }, [view]);

  // Scroll TEOS thread to bottom
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [teosMessages, teosBusy]);

  // Auto-resize TEOS textarea
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "22px";
      taRef.current.style.height = Math.min(140, taRef.current.scrollHeight) + "px";
    }
  }, [teosDraft]);

  const sendTeosMessage = (text: string) => {
    if (!text.trim() || teosBusy) return;
    const trimmed = text.trim();
    setTeosMessages((m) => [...m, { role: "user", text: trimmed }]);
    setTeosBusy(true);
    setTeosDraft("");

    if (DEMO) {
      setTimeout(() => {
        setTeosMessages((m) => [...m, {
          role: "assistant",
          specialist: "qa",
          text: "I've analyzed your indexed repositories and documents. Based on the codebase structure, here's what I found.",
        }]);
        setTeosBusy(false);
      }, 1800);
      return;
    }

    sendConversationMessage(projectId!, trimmed).catch(() => {
      setTeosBusy(false);
    });
    // Response arrives via the sidebar SSE connection
  };

  const projectName = wsView ? "TelaiOS" : (project?.name ?? "Project");
  const projectColor = wsView ? "#0a84ff" : (sidebarProjects.find((p) => p.id === projectId)?.color ?? "#0a84ff");
  const userInitials = user?.display_name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() ?? "U";
  const unreadNotifs = 0;

  const mainNav = [
    { id: "dashboard",    label: "Dashboard",    icon: "home",     badge: null },
    { id: "conversation", label: "Conversation", icon: "chat",     badge: null },
    { id: "repositories", label: "Repositories", icon: "git",      badge: null },
    { id: "documents",    label: "Documents",    icon: "book",     badge: null },
    { id: "designs",      label: "Designs",      icon: "spark",    badge: null },
    { id: "agents",       label: "Agents",       icon: "bot",      badge: null },
    { id: "library",      label: "Library",      icon: "cube",     badge: null },
    { id: "plans",        label: "Plans",        icon: "workflow", badge: null },
    { id: "team",         label: "Team",         icon: "users",    badge: null },
  ] as const;

  const bottomNav = [
    { id: "inbox",    label: "Inbox",    icon: "inbox",    badge: null },
    { id: "members",  label: "Members",  icon: "users",    badge: null },
    { id: "settings", label: "Settings", icon: "settings", badge: null },
  ] as const;

  const renderView = () => {
    // Workspace mode
    if (wsView) {
      switch (wsView) {
        case "projects":  return <WorkspaceProjects />;
        case "library":   return <WorkspaceLibrary />;
        case "analytics": return <WorkspaceAnalytics />;
        case "agents":    return <WorkspaceAgents />;
        case "users":     return <WorkspaceUsers />;
        case "settings":  return <WorkspaceSettings />;
      }
    }
    // Project mode
    if (!projectId) return null;
    switch (view) {
      case "dashboard":    return <ProjectDashboard projectId={projectId} onNavigate={(v) => setView(v as ProjectView)} />;
      case "conversation": return <ProjectConversation projectId={projectId} />;
      case "repositories": return <ProjectRepositories projectId={projectId} />;
      case "documents":    return <ProjectDocuments projectId={projectId} />;
      case "designs":      return <ProjectDesigns projectId={projectId} />;
      case "agents":       return <ProjectAgents projectId={projectId} />;
      case "library":      return <ProjectLibrary projectId={projectId} />;
      case "plans":        return <ProjectPlans projectId={projectId} />;
      case "team":         return <ProjectTeam projectId={projectId} />;
      case "inbox":        return <ProjectInbox projectId={projectId} />;
      case "members":      return <ProjectMembers projectId={projectId} />;
      case "settings":     return <ProjectSettings projectId={projectId} />;
    }
  };

  const crumbTag: Record<string, string> = {
    repositories: "5 sources · 22.4k symbols",
    documents: "10 indexed · 752 pages",
    library: "8 MCP servers · 8 skills",
  };

  return (
    <>
      <MeshBackground />
      <div
        className="app"
        data-theme={theme}
        data-density={density}
        data-ai-collapsed={(wsView || aiCollapsed) ? "true" : undefined}
      >
        {/* ── Sidebar ── */}
        <aside className="sidebar glass">
          <div className="sb-brand">
            <div className="sb-logo" />
            <span>TelaiOS</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-3)", fontWeight: 500 }}>v2.4</span>
          </div>

          {/* Workspace switcher */}
          <div className="workspace-switch">
            <div className="ws-avatar" style={{ background: projectColor }}>
              {projectName.charAt(0).toUpperCase()}
            </div>
            <div className="ws-meta">
              <b>{projectName}</b>
              <span>Team · 24 members</span>
            </div>
            <div className="ws-arrows">
              <Icon name="chevd" size="sm" />
            </div>
          </div>

          <div className="sb-section">{wsView ? "Navigation" : "Workspace"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {wsView ? (
              <>
                {WS_NAV.map((n) => (
                  <button
                    key={n.id}
                    className="sb-row"
                    data-active={wsView === n.id}
                    onClick={() => { window.location.href = n.href; }}
                  >
                    <Icon name={n.icon} className="sb-icon" />
                    <span>{n.label}</span>
                  </button>
                ))}
                <div className="sb-section" style={{ marginTop: 4 }}>Admin</div>
                {WS_ADMIN_NAV.map((n) => (
                  <button
                    key={n.id}
                    className="sb-row"
                    data-active={wsView === n.id}
                    onClick={() => { window.location.href = n.href; }}
                  >
                    <Icon name={n.icon} className="sb-icon" />
                    <span>{n.label}</span>
                  </button>
                ))}
              </>
            ) : (
              mainNav.map((n) => (
                <button
                  key={n.id}
                  className="sb-row"
                  data-active={view === n.id}
                  onClick={() => setView(n.id as ProjectView)}
                >
                  <Icon name={n.icon} className="sb-icon" />
                  <span>{n.label}</span>
                  {n.badge && <span className="sb-badge">{n.badge}</span>}
                </button>
              ))
            )}
          </div>

          {!wsView && (
            <>
              <div className="sb-section">Projects</div>
              <div className="projects-list">
                {sidebarProjects.map((p) => (
                  <button
                    key={p.id}
                    className="proj-row"
                    data-active={projectId === p.id}
                    onClick={() => { window.location.href = `/projects/${p.id}`; }}
                  >
                    <span className="proj-dot" style={{ background: p.color }} />
                    <span>{p.name}</span>
                  </button>
                ))}
                <button className="proj-row" style={{ color: "var(--fg-3)" }}
                  onClick={() => { window.location.href = "/"; }}>
                  <Icon name="plus" size="sm" className="sb-icon" />
                  <span>All projects</span>
                </button>
              </div>
            </>
          )}

          <div className="sb-spacer" />

          {/* Bottom nav (project mode only) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingTop: 8 }}>
            {!wsView && bottomNav.map((n) => (
              <button
                key={n.id}
                className="sb-row"
                style={{ height: 30, fontSize: 12.5 }}
                data-active={view === n.id}
                onClick={() => setView(n.id as ProjectView)}
              >
                <Icon name={n.icon} className="sb-icon" />
                <span>{n.label}</span>
                {n.badge && <span className="sb-badge">{n.badge}</span>}
              </button>
            ))}

            {/* User row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 4px" }}>
              <div
                style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 600, color: "#fff", flexShrink: 0,
                }}
              >
                {userInitials}
              </div>
              <span style={{ flex: 1, fontSize: 12, color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.display_name || user?.email || "User"}
              </span>
              <button
                onClick={toggleTheme}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
                style={{ padding: 4, borderRadius: 6, color: "var(--fg-3)", fontSize: 13 }}
              >
                {theme === "dark" ? "☀" : "☽"}
              </button>
              <button onClick={logout} title="Log out" style={{ padding: 4, borderRadius: 6, color: "var(--fg-3)" }}>
                <Icon name="arrow" size="sm" style={{ transform: "rotate(180deg)" }} />
              </button>
            </div>
          </div>
        </aside>

        {/* ── Topbar ── */}
        <header className="topbar glass">
          <div className="crumb">
            <b>{wsView ? "Workspace" : projectName}</b>
            <span className="crumb-sep">/</span>
            <span>{wsView ? WS_VIEW_LABELS[wsView] : VIEW_LABELS[view]}</span>
            {!wsView && crumbTag[view] && <span className="crumb-tag">{crumbTag[view]}</span>}
          </div>

          <div className="tb-spacer" />

          <button className="tb-search" onClick={() => setCmdOpen(true)}>
            <Icon name="search" size="sm" />
            <span>Search or ask TEOS…</span>
            <kbd>⌘K</kbd>
          </button>

          {/* Notifications */}
          <div className="notif-wrap">
            <button className="tb-btn" title="Notifications" onClick={() => setNotifOpen(!notifOpen)}>
              <Icon name="bell" size="sm" />
              {unreadNotifs > 0 && <span className="notif-dot" />}
            </button>
            {notifOpen && (
              <>
                <div className="vis-backdrop" onClick={() => setNotifOpen(false)} />
                <NotifPopover
                  notifications={MOCK_NOTIFICATIONS}
                  openInbox={() => { setView("inbox"); setNotifOpen(false); }}
                />
              </>
            )}
          </div>

          {!wsView && view !== "conversation" && (
            <button className="tb-btn" title={aiCollapsed ? "Show AI" : "Hide AI"} data-active={!aiCollapsed} onClick={() => setAiCollapsed((v) => !v)}>
              <Icon name="panel" size="sm" />
            </button>
          )}
          <div className="tb-avatar">{userInitials}</div>
        </header>

        {/* ── Main ── */}
        <main className="main glass">
          {renderView()}
        </main>

        {/* ── AI Sidebar (project mode only) ── */}
        {!wsView && <aside className="ai-side glass glass-strong">
          <div className="ai-head">
            <div className="ai-head-title">
              <span className="ai-orb" />
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>TEOS</span>
                </div>
                <span style={{ fontSize: 10.5, color: "var(--fg-3)" }}>Always-on assistant</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              <button className="tb-btn" style={{ width: 28, height: 28 }} title="Sessions" onClick={() => setShowSessions(true)}>
                <Icon name="inbox" size="sm" />
              </button>
              <button className="tb-btn" style={{ width: 28, height: 28 }} title="New session" onClick={() => setTeosMessages([])}>
                <Icon name="plus" size="sm" />
              </button>
              <button className="tb-btn" style={{ width: 28, height: 28 }} title="Hide" onClick={() => setAiCollapsed(true)}>
                <Icon name="chev" size="sm" />
              </button>
            </div>
          </div>

          {/* Session meta */}
          <div className="session-meta">
            <div className="vis-wrap">
              <button className="vis-btn">
                <Icon name="users" size="sm" />
                <span>Team</span>
                <Icon name="chevd" size="sm" className="vis-chev" />
              </button>
            </div>
            <div className="participants-stack">
              <div className="tm-avatar stack av-2" style={{ zIndex: 10 }}>EN<span className="tm-online" /></div>
              <div className="tm-avatar stack av-2" style={{ zIndex: 9 }}>SO<span className="tm-online" /></div>
            </div>
            <span className="participants-count">2 active</span>
          </div>

          <div className="ai-thread" ref={threadRef}>
            {teosMessages.length === 0 && (
              <div className="ai-empty">
                <span className="ai-orb" style={{ width: 28, height: 28 }} />
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>How can I help?</div>
                <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 4, maxWidth: 280 }}>
                  I'll route to the right specialist — Designer, Planner, Reviewer, Coder, Explorer, Reverse Engineer or Q&A — based on what you ask.
                </div>
              </div>
            )}
            {teosMessages.map((m, i) => {
              const spec = m.specialist ? SPECIALISTS[m.specialist] : null;
              return (
                <div key={i} className="ai-msg" data-role={m.role}>
                  <div className="ai-msg-from">
                    {m.role === "user" ? "You" : (
                      <>
                        TEOS
                        {spec && (
                          <span className="ai-msg-spec" style={{ color: spec.color }}>
                            <Icon name={spec.icon} size="sm" />{spec.name}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="ai-bubble">{m.text}</div>
                </div>
              );
            })}
            {teosBusy && (
              <div className="ai-msg" data-role="assistant">
                <div className="ai-msg-from">TEOS</div>
                <div className="ai-bubble">
                  {teosStreamContent
                    ? <>{teosStreamContent}<span style={{ display: "inline-block", width: 7, height: 13, background: "#0a84ff", marginLeft: 2, borderRadius: 2, animation: "blink 1s infinite" }} /></>
                    : <div className="ai-typing"><span /><span /><span /></div>
                  }
                </div>
              </div>
            )}
          </div>

          <div className="ai-input-wrap">
            <div className="ai-chip-row">
              {["How does auth work?", "Plan a new feature", "Review this code"].map((s, i) => (
                <button key={i} className="ai-chip" onClick={() => sendTeosMessage(s)}>{s}</button>
              ))}
            </div>
            <div className="ai-input">
              <textarea
                ref={taRef}
                value={teosDraft}
                placeholder="Ask TEOS or describe a task…"
                onChange={(e) => setTeosDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTeosMessage(teosDraft); }
                }}
              />
              <button className="ai-send" disabled={!teosDraft.trim() || teosBusy} onClick={() => sendTeosMessage(teosDraft)}>
                <Icon name="send" size="sm" />
              </button>
            </div>
          </div>

          {/* Sessions drawer */}
          {showSessions && (
            <div className="sessions-drawer">
              <div className="sessions-head">
                <Icon name="inbox" size="sm" />
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>Sessions</span>
                <div style={{ flex: 1 }} />
                <button className="tb-btn" style={{ width: 28, height: 28 }} onClick={() => setShowSessions(false)}>
                  <Icon name="chev" size="sm" />
                </button>
              </div>
              <div className="sessions-body">
                {[
                  { id: "s-1", title: "Ship SSO via Okta — end-to-end", time: "now",    visibility: "team",    specs: ["explorer", "planner"] },
                  { id: "s-2", title: "Redesign the billing dashboard",  time: "1h ago", visibility: "team",    specs: ["designer"] },
                  { id: "s-3", title: "How does our refresh-token flow work?", time: "2d ago", visibility: "private", specs: ["qa"] },
                ].map((s) => (
                  <button key={s.id} className="session-row" onClick={() => { setTeosMessages([]); setShowSessions(false); }}>
                    <div className="session-row-head">
                      <span className="session-title">{s.title}</span>
                      <span className="session-time">{s.time}</span>
                    </div>
                    <div className="session-specs">
                      {s.specs.map((sp) => {
                        const specialist = SPECIALISTS[sp];
                        if (!specialist) return null;
                        return (
                          <span key={sp} className="spec-trail-chip mini" style={{ color: specialist.color }}>
                            <Icon name={specialist.icon} size="sm" />{specialist.name}
                          </span>
                        );
                      })}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>}
      </div>

      {/* Command palette */}
      {cmdOpen && (
        <CommandPalette
          commands={COMMANDS}
          onClose={() => setCmdOpen(false)}
          onAction={(item: { name: string; view?: string | null }) => {
            if (item.view) setView(item.view as ProjectView);
            else sendTeosMessage(item.name);
            setCmdOpen(false);
          }}
        />
      )}
    </>
  );
}

/* ── NotifPopover ── */
function NotifPopover({ notifications: _notifications, openInbox }: {
  notifications: never[];
  openInbox: () => void;
}) {
  return (
    <div className="notif-pop glass">
      <div className="notif-head">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Notifications</span>
        </div>
        <div style={{ flex: 1 }} />
        <button className="pill-btn" onClick={openInbox} style={{ fontSize: 11 }}>Open Inbox</button>
      </div>
      <div className="notif-body" style={{ padding: "20px 16px", textAlign: "center", color: "var(--fg-3)", fontSize: 13 }}>
        You're all caught up.
      </div>
    </div>
  );
}

/* ── CommandPalette ── */
function CommandPalette({ commands, onClose, onAction }: {
  commands: typeof COMMANDS;
  onClose: () => void;
  onAction: (item: { name: string; view?: string | null; i?: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  type FlatItem = { section?: string; name?: string; kind?: string; view?: string | null; i?: string };
  const flat: FlatItem[] = [];
  commands.forEach((sec) => {
    const filtered = sec.items.filter((it) => !q || it.name.toLowerCase().includes(q.toLowerCase()));
    if (filtered.length) {
      flat.push({ section: sec.section });
      filtered.forEach((it) => flat.push({ ...it }));
    }
  });
  const selectable = flat.filter((f) => !f.section);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(selectable.length - 1, s + 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    if (e.key === "Enter" && selectable[sel]) onAction(selectable[sel] as { name: string; view?: string | null; i?: string });
  };

  let selIdx = -1;
  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKey}
            placeholder="Search or ask TEOS…"
          />
          <kbd style={{ fontSize: 10.5, padding: "3px 6px", borderRadius: 5, background: "var(--glass-weak)", border: "0.5px solid var(--hairline)", color: "var(--fg-3)" }}>esc</kbd>
        </div>
        <div className="cmd-list">
          {flat.map((f, i) => {
            if (f.section) return <div key={i} className="cmd-section">{f.section}</div>;
            selIdx++;
            const isSel = selIdx === sel;
            return (
              <div key={i} className="cmd-item" data-sel={isSel}
                onMouseEnter={() => setSel(selIdx)}
                onClick={() => onAction(f as { name: string; view?: string | null; i?: string })}>
                {f.i && <Icon name={f.i} size="sm" />}
                <span>{f.name}</span>
                <span className="cmd-item-kind">{f.kind}</span>
              </div>
            );
          })}
          {flat.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: "var(--fg-3)", fontSize: 13 }}>
              No matches. Press Enter to ask TEOS.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
