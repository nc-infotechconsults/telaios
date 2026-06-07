import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useAppSettings } from "../context/AppSettingsContext";
import { getProjects, sendConversationMessage } from "../lib/api";
import type { Project } from "../types";
import { Icon } from "./Icon";
import MeshBackground from "./MeshBackground";
import { Sidebar } from "./shell/Sidebar";
import { Topbar } from "./shell/Topbar";
import { CommandPalette } from "./shell/CommandPalette";

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
import ProjectInbox from "../pages/project/ProjectInbox";
import ProjectMembers from "../pages/project/ProjectMembers";

// Workspace view components
import WorkspaceOverview  from "../pages/workspace/WorkspaceOverview";
import WorkspaceProjects  from "../pages/workspace/WorkspaceProjects";
import WorkspaceLibrary   from "../pages/workspace/WorkspaceLibrary";
import WorkspaceAnalytics from "../pages/workspace/WorkspaceAnalytics";
import WorkspaceAgents    from "../pages/workspace/WorkspaceAgents";
import WorkspacePeople    from "../pages/workspace/WorkspacePeople";
import WorkspaceSettings  from "../pages/workspace/WorkspaceSettings";
import WorkspaceAuditLog  from "../pages/workspace/WorkspaceAuditLog";
import WorkspaceBilling   from "../pages/workspace/WorkspaceBilling";
import WorkspaceSecurity  from "../pages/workspace/WorkspaceSecurity";

export type ProjectView =
  | "dashboard" | "conversation" | "repositories" | "documents"
  | "designs" | "agents" | "library" | "plans"
  | "inbox" | "members" | "settings";

export type WsView =
  | "overview" | "projects" | "library" | "analytics" | "agents"
  | "people" | "settings" | "audit" | "billing" | "security";

const WS_VIEW_LABELS: Record<WsView, string> = {
  overview:  "Overview",
  projects:  "Projects",
  library:   "Library",
  analytics: "Analytics",
  agents:    "Agents",
  people:    "People",
  settings:  "Settings",
  audit:     "Audit Log",
  billing:   "Billing",
  security:  "Security",
};


const VIEW_LABELS: Record<ProjectView, string> = {
  dashboard: "Dashboard", conversation: "Conversation", repositories: "Repositories",
  documents: "Documents", designs: "Designs", agents: "Agents", library: "Library",
  plans: "Plans", inbox: "Inbox", members: "Members", settings: "Settings",
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


export default function ProjectLayout({ wsView }: { wsView?: WsView } = {}) {
  const { projectId } = useParams<{ projectId: string }>();
  const { settings: appSettings } = useAppSettings();
  const brand = appSettings.brand_name?.trim() || "TelaiOS";

  const [project, setProject] = useState<Project | null>(null);
  const [sidebarProjects, setSidebarProjects] = useState<{ id: string; name: string; color: string }[]>([]);
  const [view, setView] = useState<ProjectView>("dashboard");
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

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


  const renderView = () => {
    // Workspace mode
    if (wsView) {
      switch (wsView) {
        case "overview":  return <WorkspaceOverview />;
        case "projects":  return <WorkspaceProjects />;
        case "library":   return <WorkspaceLibrary />;
        case "analytics": return <WorkspaceAnalytics />;
        case "agents":    return <WorkspaceAgents />;
        case "people":    return <WorkspacePeople />;
        case "settings":  return <WorkspaceSettings />;
        case "audit":     return <WorkspaceAuditLog />;
        case "billing":   return <WorkspaceBilling />;
        case "security":  return <WorkspaceSecurity />;
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
      case "inbox":        return <ProjectInbox projectId={projectId} />;
      case "members":      return <ProjectMembers projectId={projectId} />;
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
        data-ai-collapsed={(wsView || aiCollapsed) ? "true" : undefined}
      >
        {/* ── Sidebar ── */}
        <Sidebar
          mode={
            wsView
              ? { kind: "workspace", wsView }
              : {
                  kind: "project",
                  projectId: projectId!,
                  projectName: project?.name ?? "Project",
                  view,
                  onSelectView: setView,
                  projects: sidebarProjects,
                }
          }
        />

        {/* ── Topbar ── */}
        <Topbar
          breadcrumbTitle={wsView ? brand : (project?.name ?? "Project")}
          viewLabel={wsView ? WS_VIEW_LABELS[wsView] : VIEW_LABELS[view]}
          extraTag={!wsView ? crumbTag[view] : undefined}
          onOpenCommandPalette={() => setCmdOpen(true)}
        />

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
      <CommandPalette
        isOpen={cmdOpen}
        onOpenChange={setCmdOpen}
        onNavigate={(v) => setView(v as ProjectView)}
        projectName={wsView ? brand : (project?.name ?? "Project")}
      />
    </>
  );
}
