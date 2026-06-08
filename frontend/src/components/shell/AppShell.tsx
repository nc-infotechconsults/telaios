import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@heroui/react";
import { useAppSettings } from "../../context/AppSettingsContext";
import {
  getConversationHistory,
  getProjects,
  listProjectMembers,
  sendConversationMessage,
} from "../../lib/api";
import type { ConversationMessage, Project, ProjectMember } from "../../types";
import { Icon } from "../Icon";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const SESSION_GAP_MS = 2 * 60 * 60 * 1000; // 2-hour gap separates sessions

interface TeosMessage {
  id: string;
  sender_type: "user" | "agent";
  specialist: string | null;
  content: string;
  created_at: string;
}

interface TeosSession {
  id: string;
  title: string;
  time: string;
  specs: string[];
  startIndex: number;
  endIndex: number;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toTeosMessage(m: ConversationMessage): TeosMessage {
  return {
    id: m.id,
    sender_type: m.sender_type,
    specialist: m.specialist,
    content: m.content,
    created_at: m.created_at,
  };
}

function memberInitials(m: ProjectMember): string {
  const name = m.user.display_name?.trim() || m.user.email || "";
  if (!name) return "?";
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return name.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const MEMBER_PILL_COLORS = [
  { bg: "var(--success, #30d158)", fg: "var(--success-foreground, #fff)" },
  { bg: "var(--accent, #0a84ff)", fg: "var(--accent-foreground, #fff)" },
  { bg: "var(--warning, #ff9f0a)", fg: "var(--warning-foreground, #1a1a1a)" },
  { bg: "var(--danger, #ff375f)", fg: "var(--danger-foreground, #fff)" },
];

// Project view components
import ProjectDashboard from "../../pages/project/ProjectDashboard";
import ProjectConversation from "../../pages/project/ProjectConversation";
import ProjectRepositories from "../../pages/project/ProjectRepositories";
import ProjectDocuments from "../../pages/project/ProjectDocuments";
import ProjectDesigns from "../../pages/project/ProjectDesigns";
import ProjectAgents from "../../pages/project/ProjectAgents";
import ProjectLibrary from "../../pages/project/ProjectLibrary";
import ProjectPlans from "../../pages/project/ProjectPlans";
import ProjectInbox from "../../pages/project/ProjectInbox";
import ProjectMembers from "../../pages/project/ProjectMembers";

// Workspace view components
import WorkspaceOverview  from "../../pages/workspace/WorkspaceOverview";
import WorkspaceProjects  from "../../pages/workspace/WorkspaceProjects";
import WorkspaceLibrary   from "../../pages/workspace/WorkspaceLibrary";
import WorkspaceAnalytics from "../../pages/workspace/WorkspaceAnalytics";
import WorkspaceAgents    from "../../pages/workspace/WorkspaceAgents";
import WorkspacePeople    from "../../pages/workspace/WorkspacePeople";
import WorkspaceSettings  from "../../pages/workspace/WorkspaceSettings";
import WorkspaceAuditLog  from "../../pages/workspace/WorkspaceAuditLog";
import WorkspaceBilling   from "../../pages/workspace/WorkspaceBilling";
import WorkspaceSecurity  from "../../pages/workspace/WorkspaceSecurity";

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


export default function AppShell({ wsView }: { wsView?: WsView } = {}) {
  const { projectId } = useParams<{ projectId: string }>();
  const { settings: appSettings } = useAppSettings();
  const brand = appSettings.brand_name?.trim() || "TelaiOS";

  const [project, setProject] = useState<Project | null>(null);
  const [sidebarProjects, setSidebarProjects] = useState<{ id: string; name: string; color: string }[]>([]);
  const [view, setView] = useState<ProjectView>("dashboard");
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  // TEOS sidebar state
  const [teosMessages, setTeosMessages] = useState<TeosMessage[]>([]);
  const [teosBusy, setTeosBusy] = useState(false);
  const [teosDraft, setTeosDraft] = useState("");
  const [teosStreamContent, setTeosStreamContent] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  // null = view latest session; "new" = empty new session view; sessionId = view that slice
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
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

  // Load conversation history + members when project changes
  useEffect(() => {
    if (!projectId || wsView || DEMO) {
      setTeosMessages([]);
      setMembers([]);
      return;
    }
    getConversationHistory(projectId, { limit: 200 })
      .then(({ messages }) => {
        setTeosMessages(messages.map(toTeosMessage));
      })
      .catch(() => {});
    listProjectMembers(projectId)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [projectId, wsView]);

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
          const msg = data.message as ConversationMessage | undefined;
          if (msg) {
            setTeosMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, toTeosMessage(msg)]
            );
            if (msg.sender_type === "agent") {
              teosStreamRef.current = "";
              setTeosStreamContent("");
              setTeosBusy(false);
            }
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
  }, [projectId, wsView]);

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
    setTeosBusy(true);
    setTeosDraft("");
    // Snap the view back to "latest" so the user sees their just-sent message land.
    setActiveSessionId(null);

    if (DEMO) {
      const now = new Date().toISOString();
      setTeosMessages((m) => [
        ...m,
        { id: `local-${Date.now()}`, sender_type: "user", specialist: null, content: trimmed, created_at: now },
      ]);
      setTimeout(() => {
        setTeosMessages((m) => [
          ...m,
          {
            id: `demo-${Date.now()}`,
            sender_type: "agent",
            specialist: "qa",
            content: "I've analyzed your indexed repositories and documents. Based on the codebase structure, here's what I found.",
            created_at: new Date().toISOString(),
          },
        ]);
        setTeosBusy(false);
      }, 1800);
      return;
    }

    sendConversationMessage(projectId!, trimmed).catch(() => {
      setTeosBusy(false);
    });
    // User + agent messages arrive via the sidebar SSE connection
  };

  // Group messages into sessions by 2-hour gap (mirrors ProjectConversation).
  const teosSessions = useMemo<TeosSession[]>(() => {
    if (teosMessages.length === 0) return [];
    const result: TeosSession[] = [];
    let start = 0;
    for (let i = 1; i <= teosMessages.length; i++) {
      const isLast = i === teosMessages.length;
      const bigGap = !isLast && (
        new Date(teosMessages[i].created_at).getTime()
        - new Date(teosMessages[i - 1].created_at).getTime() > SESSION_GAP_MS
      );
      if (bigGap || isLast) {
        const slice = teosMessages.slice(start, i);
        const firstUser = slice.find((m) => m.sender_type === "user");
        const specs = [...new Set(slice.map((m) => m.specialist).filter((s): s is string => !!s))];
        result.push({
          id: `session-${start}`,
          title: firstUser?.content.slice(0, 60) ?? "Conversation",
          time: formatRelativeTime(slice[0].created_at),
          specs,
          startIndex: start,
          endIndex: i,
        });
        start = i;
      }
    }
    return result;
  }, [teosMessages]);

  // Default to latest session (activeSessionId null), explicit "new" = empty.
  const isNewSession = activeSessionId === "new";
  const activeSession = isNewSession
    ? null
    : teosSessions.find((s) => s.id === activeSessionId) ?? teosSessions[teosSessions.length - 1] ?? null;
  const visibleMessages = activeSession
    ? teosMessages.slice(activeSession.startIndex, activeSession.endIndex)
    : [];
  // Only show the live stream bubble when the user is on the latest session (where new messages land).
  const showLiveStream = !isNewSession && activeSession === (teosSessions[teosSessions.length - 1] ?? null);

  // Scroll TEOS thread to bottom on visible-message updates
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [visibleMessages, teosBusy, teosStreamContent]);

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

  return (
    <>
      <div
        className="grid h-screen grid-cols-[240px_1fr_auto] grid-rows-[56px_1fr] gap-2.5 bg-background p-2.5 text-foreground"
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
          onOpenCommandPalette={() => setCmdOpen(true)}
          aiSidebar={
            !wsView && view !== "conversation"
              ? { collapsed: aiCollapsed, onToggle: () => setAiCollapsed((c) => !c) }
              : undefined
          }
        />

        {/* ── Main ── */}
        <main
          className={`col-start-2 flex flex-col overflow-hidden rounded-2xl bg-surface shadow-surface ${
            view === "conversation" && !wsView ? "" : "p-7"
          }`}
        >
          <div className="flex-1 overflow-y-auto">{renderView()}</div>
        </main>

        {/* ── AI Sidebar (project mode only) ── */}
        {!wsView && <aside
          aria-label="TEOS AI assistant"
          className={`relative col-start-3 row-start-1 row-span-2 flex flex-col overflow-hidden rounded-2xl bg-surface shadow-surface transition-[width,opacity] duration-300 ${
            aiCollapsed ? "pointer-events-none w-0 opacity-0" : "w-[380px] opacity-100"
          }`}
        >
          {/* Header */}
          <header className="flex items-center gap-2.5 border-b border-separator px-4 py-3">
            <span
              aria-hidden
              className="block size-[18px] shrink-0 rounded-full"
              style={{
                background: "var(--accent-grad, linear-gradient(135deg,#0a84ff,#bf5af2))",
                boxShadow: "0 0 0 2px rgba(10,132,255,0.18), 0 0 12px rgba(191,90,242,0.5)",
              }}
            />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="text-[13.5px] font-semibold text-foreground">TEOS</span>
              <span className="text-[10.5px] text-muted">Always-on assistant</span>
            </div>
            <div className="ms-auto flex items-center gap-1">
              <Button isIconOnly size="sm" variant="tertiary" aria-label="Sessions" onPress={() => setShowSessions(true)}>
                <Icon name="inbox" size="sm" />
              </Button>
              <Button isIconOnly size="sm" variant="tertiary" aria-label="New session" onPress={() => setActiveSessionId("new")}>
                <Icon name="plus" size="sm" />
              </Button>
              <Button isIconOnly size="sm" variant="tertiary" aria-label="Hide sidebar" onPress={() => setAiCollapsed(true)}>
                <Icon name="chev" size="sm" />
              </Button>
            </div>
          </header>

          {/* Session meta — project members */}
          {members.length > 0 && (
            <div className="flex items-center gap-2 border-b border-separator px-4 py-2 text-[11.5px] text-muted">
              <Icon name="users" size="sm" className="opacity-70" />
              <div className="flex items-center">
                {members.slice(0, 3).map((m, i) => {
                  const palette = MEMBER_PILL_COLORS[i % MEMBER_PILL_COLORS.length];
                  return (
                    <span
                      key={m.user_id}
                      title={m.user.display_name || m.user.email}
                      className={`inline-flex size-5 items-center justify-center rounded-full text-[9px] font-semibold ring-2 ring-surface ${i > 0 ? "-ms-1.5" : ""}`}
                      style={{ background: palette.bg, color: palette.fg }}
                    >
                      {memberInitials(m)}
                    </span>
                  );
                })}
              </div>
              <span>
                {members.length} {members.length === 1 ? "member" : "members"}
              </span>
            </div>
          )}

          {/* Thread */}
          <div ref={threadRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            {visibleMessages.length === 0 && !teosBusy && (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-muted">
                <span
                  aria-hidden
                  className="block size-7 rounded-full"
                  style={{
                    background: "var(--accent-grad, linear-gradient(135deg,#0a84ff,#bf5af2))",
                    boxShadow: "0 0 0 2px rgba(10,132,255,0.18), 0 0 12px rgba(191,90,242,0.5)",
                  }}
                />
                <div className="mt-3 text-sm font-semibold text-foreground">How can I help?</div>
                <p className="mt-1 max-w-[280px] text-xs text-muted">
                  I'll route to the right specialist — Designer, Planner, Reviewer, Coder, Explorer, Reverse Engineer or Q&amp;A — based on what you ask.
                </p>
              </div>
            )}
            {visibleMessages.map((m) => {
              const spec = m.specialist ? SPECIALISTS[m.specialist] : null;
              const isUser = m.sender_type === "user";
              return (
                <div key={m.id} className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
                    {isUser ? "You" : "TEOS"}
                    {!isUser && spec && (
                      <span className="flex items-center gap-1" style={{ color: spec.color }}>
                        <Icon name={spec.icon} size="sm" />
                        {spec.name}
                      </span>
                    )}
                  </div>
                  <div
                    className={
                      isUser
                        ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-3.5 py-2 text-sm text-accent-foreground"
                        : "max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-secondary px-3.5 py-2 text-sm text-foreground"
                    }
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
            {teosBusy && showLiveStream && (
              <div className="flex flex-col items-start gap-1">
                <div className="px-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">TEOS</div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-secondary px-3.5 py-2 text-sm text-foreground">
                  {teosStreamContent ? (
                    <>
                      {teosStreamContent}
                      <span className="ms-0.5 inline-block h-3 w-[7px] rounded-sm bg-accent align-baseline animate-pulse" />
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 py-1">
                      <span className="size-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="size-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="size-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <footer className="flex flex-col gap-2 border-t border-separator px-3 py-3">
            <div className="flex flex-wrap gap-1.5">
              {["How does auth work?", "Plan a new feature", "Review this code"].map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => sendTeosMessage(s)}
                  className="rounded-full bg-surface-secondary px-3 py-1 text-[11.5px] text-muted hover:bg-default hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-surface-secondary px-3 py-2 focus-within:border-accent">
              <textarea
                ref={taRef}
                value={teosDraft}
                placeholder="Ask TEOS or describe a task…"
                onChange={(e) => setTeosDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendTeosMessage(teosDraft);
                  }
                }}
                className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
                style={{ height: 22, maxHeight: 140 }}
              />
              <Button
                isIconOnly
                size="sm"
                isDisabled={!teosDraft.trim() || teosBusy}
                onPress={() => sendTeosMessage(teosDraft)}
                aria-label="Send message"
              >
                <Icon name="send" size="sm" />
              </Button>
            </div>
          </footer>

          {/* Sessions drawer */}
          {showSessions && (
            <div className="absolute inset-0 z-10 flex flex-col bg-surface">
              <header className="flex items-center gap-2 border-b border-separator px-4 py-3">
                <Icon name="inbox" size="sm" />
                <span className="text-[13.5px] font-semibold text-foreground">Sessions</span>
                <div className="flex-1" />
                <Button isIconOnly size="sm" variant="tertiary" aria-label="Close sessions" onPress={() => setShowSessions(false)}>
                  <Icon name="chev" size="sm" />
                </Button>
              </header>
              <div className="flex-1 overflow-y-auto p-3">
                <button
                  type="button"
                  onClick={() => { setActiveSessionId("new"); setShowSessions(false); }}
                  data-active={isNewSession || undefined}
                  className="mb-2 flex w-full items-center gap-2 rounded-xl border border-border bg-surface-secondary px-3 py-2 text-start text-[12.5px] font-medium text-muted hover:border-accent hover:text-foreground data-[active=true]:border-accent data-[active=true]:text-foreground"
                >
                  <Icon name="plus" size="sm" />
                  <span>New session</span>
                </button>
                {teosSessions.length === 0 ? (
                  <div className="px-2 py-6 text-center text-[12px] text-muted">
                    No sessions yet. Start a conversation to create one.
                  </div>
                ) : (
                  [...teosSessions].reverse().map((s) => {
                    const isActive = !isNewSession && activeSession?.id === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setActiveSessionId(s.id); setShowSessions(false); }}
                        data-active={isActive || undefined}
                        className="mb-1.5 flex w-full flex-col gap-1.5 rounded-xl border border-border bg-surface-secondary px-3 py-2.5 text-start hover:border-accent data-[active=true]:border-accent"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="flex-1 truncate text-[13px] font-medium text-foreground">{s.title}</span>
                          <span className="text-[10.5px] text-muted">{s.time}</span>
                        </div>
                        {s.specs.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {s.specs.map((sp) => {
                              const specialist = SPECIALISTS[sp];
                              if (!specialist) return null;
                              return (
                                <span
                                  key={sp}
                                  className="inline-flex items-center gap-1 rounded-md bg-default px-1.5 py-0.5 text-[10.5px]"
                                  style={{ color: specialist.color }}
                                >
                                  <Icon name={specialist.icon} size="sm" />
                                  {specialist.name}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
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
