import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getProjects } from "../lib/api";
import type { Project } from "../types";
import MeshBackground from "./MeshBackground";
import AiSidebar from "./AiSidebar";
import CommandPalette from "./CommandPalette";

// View components
import ProjectDashboard from "../pages/project/ProjectDashboard";
import ProjectConversation from "../pages/project/ProjectConversation";
import ProjectRepositories from "../pages/project/ProjectRepositories";
import ProjectDocuments from "../pages/project/ProjectDocuments";
import ProjectDesigns from "../pages/project/ProjectDesigns";
import ProjectAgents from "../pages/project/ProjectAgents";
import ProjectInbox from "../pages/project/ProjectInbox";
import ProjectTeam from "../pages/project/ProjectTeam";
import ProjectSettings from "../pages/project/ProjectSettings";

export type ProjectView =
  | "dashboard"
  | "conversation"
  | "repositories"
  | "documents"
  | "designs"
  | "agents"
  | "inbox"
  | "team"
  | "settings";

const VIEW_LABELS: Record<ProjectView, string> = {
  dashboard:    "Dashboard",
  conversation: "Conversation",
  repositories: "Repositories",
  documents:    "Documents",
  designs:      "Designs",
  agents:       "Agents",
  inbox:        "Inbox",
  team:         "Team",
  settings:     "Settings",
};

interface NavItem {
  view: ProjectView;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  const [project, setProject] = useState<Project | null>(null);
  const [view, setView] = useState<ProjectView>("dashboard");
  const [aiVisible, setAiVisible] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [inboxCount] = useState(3);

  // Auto-collapse AI sidebar below 1180px
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1180px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setAiVisible(!e.matches);
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Load project
  useEffect(() => {
    if (!projectId) return;
    getProjects().then(({ items }) => {
      const p = items.find((x) => x.id === projectId) ?? null;
      setProject(p);
    }).catch(() => {});
  }, [projectId]);

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const navItems: NavItem[] = [
    { view: "dashboard",    icon: <NavIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />, label: "Dashboard" },
    { view: "conversation", icon: <NavIcon d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />, label: "Conversation" },
    { view: "repositories", icon: <NavIcon d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />, label: "Repositories" },
    { view: "documents",    icon: <NavIcon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />, label: "Documents" },
    { view: "designs",      icon: <NavIcon d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />, label: "Designs" },
    { view: "agents",       icon: <NavIcon d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v3M21 12h-5" />, label: "Agents" },
    { view: "team",         icon: <NavIcon d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />, label: "Team" },
  ];

  const bottomNavItems: NavItem[] = [
    { view: "inbox",    icon: <NavIcon d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />, label: "Inbox", badge: inboxCount },
    { view: "settings", icon: <NavIcon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />, label: "Settings" },
  ];

  const isConversation = view === "conversation";
  const showAi = aiVisible && !isConversation;
  const projectName = project?.name ?? "Project";

  const renderView = () => {
    if (!projectId) return null;
    switch (view) {
      case "dashboard":    return <ProjectDashboard projectId={projectId} onNavigate={setView} />;
      case "conversation": return <ProjectConversation projectId={projectId} />;
      case "repositories": return <ProjectRepositories projectId={projectId} />;
      case "documents":    return <ProjectDocuments projectId={projectId} />;
      case "designs":      return <ProjectDesigns projectId={projectId} />;
      case "agents":       return <ProjectAgents projectId={projectId} />;
      case "inbox":        return <ProjectInbox projectId={projectId} />;
      case "team":         return <ProjectTeam projectId={projectId} />;
      case "settings":     return <ProjectSettings projectId={projectId} />;
    }
  };

  return (
    <>
      <MeshBackground />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: showAi
            ? "240px 1fr 380px"
            : "240px 1fr",
          gridTemplateRows: "56px 1fr",
          width: "100vw",
          height: "100vh",
          padding: 10,
          gap: 10,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <nav
          className="glass-panel"
          aria-label="Project navigation"
          style={{
            gridRow: "1 / span 2",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Brand */}
          <div
            style={{
              padding: "16px 16px 12px",
              borderBottom: "0.5px solid var(--hairline)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #0a84ff, #bf5af2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                T
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--label-primary)", lineHeight: 1.2 }}>TelaiOS</div>
                <div style={{ fontSize: 10, color: "var(--label-tertiary)" }}>v2.4</div>
              </div>
            </div>

            {/* Workspace switcher */}
            <button
              onClick={() => navigate("/")}
              aria-label={`Switch workspace from ${projectName}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "7px 10px",
                borderRadius: 10,
                background: "var(--hover-glass)",
                border: "0.5px solid var(--hairline)",
                cursor: "pointer",
                color: "var(--label-primary)",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: "linear-gradient(135deg, #30d158, #0a84ff)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color: "#fff",
                  fontWeight: 700,
                }}
                aria-hidden="true"
              >
                {projectName.charAt(0).toUpperCase()}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {projectName}
              </span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M7 10l5 5 5-5" />
              </svg>
            </button>
          </div>

          {/* Primary nav */}
          <div style={{ flex: 1, padding: "8px 8px", overflowY: "auto" }}>
            {navItems.map((item) => (
              <NavButton
                key={item.view}
                item={item}
                active={view === item.view}
                onClick={() => setView(item.view)}
              />
            ))}
          </div>

          {/* Bottom nav */}
          <div style={{ padding: "8px", borderTop: "0.5px solid var(--hairline)", flexShrink: 0 }}>
            {bottomNavItems.map((item) => (
              <NavButton
                key={item.view}
                item={item}
                active={view === item.view}
                onClick={() => setView(item.view)}
              />
            ))}

            {/* User avatar + logout */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 8px 4px",
                marginTop: 4,
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {user?.display_name?.charAt(0)?.toUpperCase() ?? "U"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user?.display_name || user?.email || "User"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={toggleTheme}
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--label-secondary)", fontSize: 14, padding: 4, borderRadius: 6 }}
                >
                  {theme === "dark" ? "☀" : "☽"}
                </button>
                <button
                  onClick={logout}
                  aria-label="Log out"
                  title="Log out"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--label-tertiary)", fontSize: 12, padding: 4, borderRadius: 6 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* ── Topbar ────────────────────────────────────────────────────── */}
        <header
          className="glass-panel"
          style={{
            gridColumn: "2",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 16px",
            zIndex: 30,
            flexShrink: 0,
          }}
        >
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, flexShrink: 0 }}>
            <button
              onClick={() => navigate("/")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--label-secondary)", fontSize: 13 }}
            >
              {projectName}
            </button>
            <span aria-hidden="true" style={{ color: "var(--label-quaternary)" }}>/</span>
            <span style={{ color: "var(--label-primary)", fontWeight: 500 }}>
              {VIEW_LABELS[view]}
            </span>
          </nav>

          {/* Search / Command */}
          <button
            onClick={() => setCmdOpen(true)}
            aria-label="Open command palette (⌘K)"
            style={{
              flex: 1,
              maxWidth: 360,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 10,
              background: "var(--fill-tertiary)",
              border: "0.5px solid var(--hairline)",
              cursor: "text",
              color: "var(--label-tertiary)",
              fontSize: 13,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <span>Search or ask TEOS…</span>
            <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.6 }}>⌘K</span>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            {/* Bell */}
            <TopbarIconButton
              onClick={() => setView("inbox")}
              label="Inbox"
              badge={inboxCount}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </TopbarIconButton>

            {/* AI sidebar toggle */}
            {!isConversation && (
              <TopbarIconButton
                onClick={() => setAiVisible((v) => !v)}
                label={aiVisible ? "Hide AI sidebar" : "Show AI sidebar"}
                active={aiVisible}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="15" y1="3" x2="15" y2="21" />
                </svg>
              </TopbarIconButton>
            )}
          </div>
        </header>

        {/* ── Main content ──────────────────────────────────────────────── */}
        <main
          className="glass-panel"
          style={{
            gridColumn: "2",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ flex: 1, overflow: "auto", position: "relative", zIndex: 1 }}>
            {renderView()}
          </div>
        </main>

        {/* ── AI Sidebar ────────────────────────────────────────────────── */}
        {showAi && projectId && (
          <div style={{ gridColumn: "3", gridRow: "1 / span 2" }}>
            <AiSidebar
              projectId={projectId}
              projectName={projectName}
              visible={true}
            />
          </div>
        )}
      </div>

      {/* Command palette */}
      <CommandPalette
        isOpen={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={(v) => setView(v as ProjectView)}
        projectName={projectName}
      />
    </>
  );
}

/* ─── Nav button ────────────────────────────────────────────────────────── */
function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "7px 10px",
        borderRadius: 10,
        border: "none",
        borderLeft: active ? "2.5px solid #0a84ff" : "2.5px solid transparent",
        background: active ? "var(--glass-strong)" : "none",
        cursor: "pointer",
        color: active ? "var(--label-primary)" : "var(--label-secondary)",
        fontSize: 13,
        fontWeight: active ? 500 : 400,
        textAlign: "left",
        marginBottom: 1,
        transition: "background 120ms, color 120ms",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "var(--hover-glass)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "none";
      }}
    >
      {item.icon}
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span
          aria-label={`${item.badge} unread`}
          style={{
            minWidth: 18,
            height: 18,
            borderRadius: 9999,
            background: "#ff375f",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
          }}
        >
          {item.badge}
        </span>
      )}
    </button>
  );
}

/* ─── Topbar icon button ────────────────────────────────────────────────── */
function TopbarIconButton({
  children,
  onClick,
  label,
  badge,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  badge?: number;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        position: "relative",
        width: 32,
        height: 32,
        borderRadius: 8,
        background: active ? "var(--hover-glass)" : "none",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: active ? "var(--label-primary)" : "var(--label-secondary)",
        transition: "background 120ms, color 120ms",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover-glass)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = active ? "var(--hover-glass)" : "none"; }}
    >
      {children}
      {badge != null && badge > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#ff375f",
            border: "1.5px solid var(--bg-primary)",
            fontSize: 8,
            fontWeight: 700,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
