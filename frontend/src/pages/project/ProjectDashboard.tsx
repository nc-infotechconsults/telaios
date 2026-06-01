import { useState, useEffect } from "react";
import { Icon } from "../../components/Icon";
import {
  getProjects,
  getRepositories,
  listDocuments,
  listProjectTasks,
  getProjectAnalytics,
  getMessages,
} from "../../lib/api";
import type {
  Repository,
  Document as ApiDocument,
  Project,
  Task,
  Message,
  ProjectAnalytics,
} from "../../types";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function repoStatusToUi(status: Repository["status"]): string {
  switch (status) {
    case "ready":   return "synced";
    case "cloning": return "indexing";
    case "error":   return "error";
    default:        return "pending";
  }
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function taskStatusToUi(s: string): string {
  if (s === "in_progress") return "running";
  if (s === "pending" || s === "ready") return "queued";
  if (s === "done") return "done";
  if (s === "failed") return "failed";
  if (s === "cancelled" || s === "skipped") return "done";
  return s;
}

function taskIcon(type: string): string {
  switch (type) {
    case "code":    return "git";
    case "design":  return "spark";
    case "plan":    return "workflow";
    default:        return "layers";
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── DEMO mode mock data ───────────────────────────────────────────────────────

const DEMO_REPOS = [
  { name: "acme/atlas-api",   branch: "main",       lang: "TypeScript", langColor: "#3178c6", status: "synced",   files: 1284, lastSync: "12m ago" },
  { name: "acme/atlas-web",   branch: "main",       lang: "TypeScript", langColor: "#3178c6", status: "synced",   files: 3142, lastSync: "1h ago" },
  { name: "acme/atlas-edge",  branch: "main",       lang: "Rust",       langColor: "#dea584", status: "indexing", files: 412,  lastSync: "just now" },
  { name: "acme/atlas-infra", branch: "production", lang: "HCL",        langColor: "#5e5ce6", status: "synced",   files: 318,  lastSync: "yesterday" },
];

const SUGGEST_CHIPS = [
  { icon: "chat",     text: "How does the edge tier handle expired refresh tokens?", action: "qa" },
  { icon: "layers",   text: "Reverse-engineer the payments flow",                   action: "re" },
  { icon: "workflow", text: "Plan: add SSO via Okta to Atlas",                      action: "feat" },
  { icon: "spark",    text: "Design 3 variations of the billing dashboard",         action: "design" },
];

// ─── Component ────────────────────────────────────────────────────────────────

type RepoRow = { name: string; branch: string; lang: string; langColor: string; status: string; files: number; lastSync: string };

export default function ProjectDashboard({
  projectId,
  onNavigate,
}: {
  projectId: string;
  onNavigate: (view: string) => void;
}) {
  const [project, setProject]     = useState<Project | null>(null);
  const [repos, setRepos]         = useState<RepoRow[]>(DEMO ? DEMO_REPOS : []);
  const [docCount, setDocCount]   = useState(DEMO ? 12 : 0);
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);

  useEffect(() => {
    if (DEMO) return;
    void Promise.all([
      getProjects().then((r) => {
        const p = r.items.find((x) => x.id === projectId);
        if (p) setProject(p);
      }),
      getRepositories(projectId).then((data) => {
        setRepos(data.map((r) => ({
          name: r.name,
          branch: r.branch ?? "main",
          lang: r.provider_type.toUpperCase(),
          langColor: "#3178c6",
          status: repoStatusToUi(r.status),
          files: 0,
          lastSync: formatRelativeTime(r.updated_at),
        })));
      }),
      listDocuments(projectId).then((docs: ApiDocument[]) => setDocCount(docs.length)),
      listProjectTasks(projectId, { limit: 8 }).then(setTasks),
      getProjectAnalytics(projectId).then(setAnalytics),
      getMessages(projectId).then((msgs) => setMessages(msgs.slice(-6).reverse())),
    ]).catch(() => undefined);
  }, [projectId]);

  const synced = repos.filter((r) => r.status === "synced").length;

  const statusAttr = (s: string) =>
    s === "synced" ? "done" : s === "indexing" ? "running" : "failed";

  const runningCount = tasks.filter((t) => t.status === "in_progress").length;

  return (
    <div className="main-scroll">
      <h1 className="h-page">{project?.name ?? (DEMO ? "Atlas" : "Project")}</h1>
      <p className="sub-page">
        {project?.description ?? (DEMO ? "Core platform & infra" : "")}
        {(project?.description || DEMO) ? " · " : ""}
        <b style={{ color: "var(--fg-2)" }}>{repos.length} repos</b> and{" "}
        <b style={{ color: "var(--fg-2)" }}>{docCount} documents</b> indexed for knowledge
      </p>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 14 }}>
        {[
          { l: "Repos connected",   v: repos.length,                                   d: `${synced} synced`      },
          { l: "Documents indexed", v: docCount,                                        d: "indexed for search"    },
          { l: "Tasks completed",   v: analytics?.task_status_counts.done     ?? "—",  d: "all time"              },
          { l: "Tasks in progress", v: analytics?.task_status_counts.in_progress ?? "—", d: "running now"         },
        ].map((s, i) => (
          <div key={i} className="card stat">
            <span className="stat-l">{s.l}</span>
            <span className="stat-v">{s.v}</span>
            <span className="stat-delta">{s.d}</span>
          </div>
        ))}
      </div>

      {/* Hero Ask TEOS */}
      <div className="card hero-ask" style={{ marginBottom: 14, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span className="ai-orb" style={{ width: 22, height: 22 }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em" }}>
              Ask TEOS about anything you've connected
            </div>
            <div style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 2 }}>
              TEOS can answer questions, reverse-engineer systems, plan features and design new interfaces — grounded in your repos and documents.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SUGGEST_CHIPS.map((c, i) => (
            <button key={i} className="suggest-chip" onClick={() => onNavigate("conversation")}>
              <Icon name={c.icon} size="sm" />
              <span>{c.text}</span>
              <Icon name="arrow" size="sm" className="chip-arrow" />
            </button>
          ))}
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid-2" style={{ marginBottom: 14 }}>
        {/* Connected repos */}
        <div className="card">
          <div className="card-head">
            <Icon name="git" size="sm" />
            <span className="card-title">Connected repositories</span>
            <span className="card-sub">{repos.length} sources</span>
            <button className="pill-btn" style={{ marginLeft: 8 }} onClick={() => onNavigate("repositories")}>
              View all <Icon name="arrow" size="sm" />
            </button>
          </div>
          <div>
            {repos.slice(0, 4).map((r) => (
              <div key={r.name} className="repo-row">
                <span className="lang-dot" style={{ background: r.langColor }} />
                <div className="repo-name">
                  <b>{r.name}</b>
                  <span>{r.branch}{r.files ? ` · ${r.files.toLocaleString()} files` : ""}</span>
                </div>
                <span className="task-status" data-s={statusAttr(r.status)}>
                  {r.status}
                </span>
                <span className="repo-meta">{r.lastSync}</span>
              </div>
            ))}
            {repos.length === 0 && !DEMO && (
              <div style={{ fontSize: 12.5, color: "var(--fg-3)", padding: "12px 14px" }}>
                No repositories connected yet.
              </div>
            )}
          </div>
        </div>

        {/* TEOS tasks */}
        <div className="card">
          <div className="card-head">
            <Icon name="sparkle" size="sm" />
            <span className="card-title">TEOS is working on</span>
            <span className="card-sub">{runningCount} running</span>
          </div>
          {tasks.map((t) => {
            const uiStatus = taskStatusToUi(t.status);
            const progress =
              uiStatus === "done" ? 100 :
              uiStatus === "running" ? 50 :
              0;
            return (
              <div key={t.id} className="agent-task">
                <div className="task-icon">
                  <Icon name={taskIcon(t.type)} size="sm" />
                </div>
                <div className="task-body">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="task-title">{t.title}</span>
                    <span className="task-status" data-s={uiStatus} style={{ marginLeft: "auto" }}>
                      {uiStatus}
                    </span>
                  </div>
                  {t.description && (
                    <div className="task-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.description}
                    </div>
                  )}
                  {uiStatus !== "queued" && (
                    <div className="task-bar">
                      <div style={{ width: progress + "%" }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {tasks.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--fg-3)", padding: "12px 14px" }}>
              No tasks yet. Start by creating a plan.
            </div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="card">
        <div className="card-head">
          <Icon name="layers" size="sm" />
          <span className="card-title">Recent activity</span>
          <span className="card-sub">Conversation history</span>
          <button className="pill-btn" style={{ marginLeft: 8 }} onClick={() => onNavigate("conversation")}>
            <Icon name="spark" size="sm" /> Open
          </button>
        </div>
        <div>
          {messages.map((m) => {
            const isUser = m.role === "user";
            const displayName = isUser ? "User" : "TEOS";
            const initial = isUser ? initials("User") : "✶";
            const avatarClass = isUser ? "av-2" : "av-3";
            const tag = isUser ? "Question" : "Answer";
            const truncated = m.content.length > 120 ? m.content.slice(0, 120) + "…" : m.content;
            return (
              <div key={m.id} className="act-row">
                <div className={"act-avatar " + avatarClass}>{initial}</div>
                <div className="act-body">
                  <span className="act-tag">{tag}</span>
                  <b>{displayName}</b> {truncated}
                  <div className="act-time">{formatRelativeTime(m.created_at)}</div>
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--fg-3)", padding: "12px 14px" }}>
              No conversation history yet. Ask TEOS something to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
