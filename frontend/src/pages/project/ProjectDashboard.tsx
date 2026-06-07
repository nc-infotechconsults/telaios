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
    <div className="flex-1 overflow-y-auto">
      <h1 className="text-[26px] font-semibold tracking-tight mb-1">{project?.name ?? (DEMO ? "Atlas" : "Project")}</h1>
      <p className="text-[13.5px] text-muted mb-6">
        {project?.description ?? (DEMO ? "Core platform & infra" : "")}
        {(project?.description || DEMO) ? " · " : ""}
        <b className="text-foreground">{repos.length} repos</b> and{" "}
        <b className="text-foreground">{docCount} documents</b> indexed for knowledge
      </p>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3.5">
        {[
          { l: "Repos connected",   v: repos.length,                                   d: `${synced} synced`      },
          { l: "Documents indexed", v: docCount,                                        d: "indexed for search"    },
          { l: "Tasks completed",   v: analytics?.task_status_counts.done     ?? "—",  d: "all time"              },
          { l: "Tasks in progress", v: analytics?.task_status_counts.in_progress ?? "—", d: "running now"         },
        ].map((s, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-2xl bg-surface p-4 shadow-surface">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{s.l}</span>
            <span className="text-[28px] font-semibold tracking-tight tabular-nums">{s.v}</span>
            <span className="text-[11.5px] font-medium text-success">{s.d}</span>
          </div>
        ))}
      </div>

      {/* Hero Ask TEOS */}
      <div className="rounded-2xl bg-surface p-6 shadow-surface mb-3.5">
        <div className="flex items-center gap-3 mb-3.5">
          <span
            aria-hidden
            className="block size-[22px] shrink-0 rounded-full"
            style={{
              background: "var(--accent-grad, linear-gradient(135deg,#0a84ff,#bf5af2))",
              boxShadow: "0 0 0 2px rgba(10,132,255,0.18), 0 0 12px rgba(191,90,242,0.5)",
            }}
          />
          <div>
            <div className="text-[15px] font-semibold tracking-tight">
              Ask TEOS about anything you've connected
            </div>
            <div className="text-[12.5px] text-muted mt-0.5">
              TEOS can answer questions, reverse-engineer systems, plan features and design new interfaces — grounded in your repos and documents.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGEST_CHIPS.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onNavigate("conversation")}
              className="flex items-center gap-2 rounded-full bg-surface-secondary px-3 py-1.5 text-[12.5px] text-muted hover:bg-default hover:text-foreground"
            >
              <Icon name={c.icon} size="sm" />
              <span>{c.text}</span>
              <Icon name="arrow" size="sm" className="opacity-50" />
            </button>
          ))}
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5 mb-3.5">
        {/* Connected repos */}
        <div className="rounded-2xl bg-surface p-4 shadow-surface">
          <div className="flex items-center gap-2.5 mb-3">
            <Icon name="git" size="sm" />
            <span className="text-[13px] font-semibold">Connected repositories</span>
            <span className="text-xs text-muted ms-auto">{repos.length} sources</span>
            <button
              type="button"
              onClick={() => onNavigate("repositories")}
              className="ms-2 inline-flex items-center gap-1 rounded-lg bg-surface-secondary px-3 py-1 text-[12px] font-medium text-muted hover:bg-default hover:text-foreground"
            >
              View all <Icon name="arrow" size="sm" />
            </button>
          </div>
          <div>
            {repos.slice(0, 4).map((r) => (
              <div key={r.name} className="grid grid-cols-[12px_1fr_auto_auto] gap-3.5 items-center py-2.5 border-b border-separator last:border-b-0 text-[13px]">
                <span className="size-2 rounded-full" style={{ background: r.langColor }} />
                <div>
                  <b className="font-semibold">{r.name}</b>
                  <span className="text-muted ms-1.5 text-xs">{r.branch}{r.files ? ` · ${r.files.toLocaleString()} files` : ""}</span>
                </div>
                <span
                  className={
                    "text-[10.5px] font-medium px-1.5 py-0.5 rounded " +
                    (statusAttr(r.status) === "done" ? "bg-success-soft text-success-soft-foreground" :
                     statusAttr(r.status) === "running" ? "bg-accent-soft text-accent-soft-foreground" :
                     "bg-danger-soft text-danger-soft-foreground")
                  }
                >
                  {r.status}
                </span>
                <span className="text-[11.5px] text-muted">{r.lastSync}</span>
              </div>
            ))}
            {repos.length === 0 && !DEMO && (
              <div className="text-[12.5px] text-muted px-3.5 py-3">
                No repositories connected yet.
              </div>
            )}
          </div>
        </div>

        {/* TEOS tasks */}
        <div className="rounded-2xl bg-surface p-4 shadow-surface">
          <div className="flex items-center gap-2.5 mb-3">
            <Icon name="sparkle" size="sm" />
            <span className="text-[13px] font-semibold">TEOS is working on</span>
            <span className="text-xs text-muted ms-auto">{runningCount} running</span>
          </div>
          {tasks.map((t) => {
            const uiStatus = taskStatusToUi(t.status);
            const progress =
              uiStatus === "done" ? 100 :
              uiStatus === "running" ? 50 :
              0;
            return (
              <div key={t.id} className="flex gap-3 rounded-xl bg-surface-secondary border border-border p-3 mt-2 first:mt-0">
                <div
                  className="flex size-7.5 shrink-0 items-center justify-center rounded-lg text-accent-foreground"
                  style={{ background: "var(--accent-grad, linear-gradient(135deg,#0a84ff,#bf5af2))" }}
                >
                  <Icon name={taskIcon(t.type)} size="sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-semibold">{t.title}</span>
                    <span
                      className={
                        "ms-auto text-[10.5px] font-medium px-1.5 py-0.5 rounded " +
                        (uiStatus === "done" ? "bg-success-soft text-success-soft-foreground" :
                         uiStatus === "running" ? "bg-accent-soft text-accent-soft-foreground" :
                         uiStatus === "failed" ? "bg-danger-soft text-danger-soft-foreground" :
                         "bg-default text-muted")
                      }
                    >
                      {uiStatus}
                    </span>
                  </div>
                  {t.description && (
                    <div className="text-[11.5px] text-muted mt-0.5 truncate">
                      {t.description}
                    </div>
                  )}
                  {uiStatus !== "queued" && (
                    <div className="h-1 rounded-full bg-default border border-border mt-2 overflow-hidden">
                      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: progress + "%" }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {tasks.length === 0 && (
            <div className="text-[12.5px] text-muted px-3.5 py-3">
              No tasks yet. Start by creating a plan.
            </div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-2xl bg-surface p-4 shadow-surface">
        <div className="flex items-center gap-2.5 mb-3">
          <Icon name="layers" size="sm" />
          <span className="text-[13px] font-semibold">Recent activity</span>
          <span className="text-xs text-muted ms-auto">Conversation history</span>
          <button
            type="button"
            onClick={() => onNavigate("conversation")}
            className="ms-2 inline-flex items-center gap-1 rounded-lg bg-surface-secondary px-3 py-1 text-[12px] font-medium text-muted hover:bg-default hover:text-foreground"
          >
            <Icon name="spark" size="sm" /> Open
          </button>
        </div>
        <div>
          {messages.map((m) => {
            const isUser = m.role === "user";
            const displayName = isUser ? "User" : "TEOS";
            const initial = isUser ? initials("User") : null;
            const avatarBg = isUser ? "bg-success" : "bg-accent";
            const tag = isUser ? "Question" : "Answer";
            const truncated = m.content.length > 120 ? m.content.slice(0, 120) + "…" : m.content;
            return (
              <div key={m.id} className="flex gap-3 py-2.5 border-b border-separator last:border-b-0">
                <div className={`size-6.5 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold text-accent-foreground ${avatarBg}`}>
                  {initial ?? <i className="fa-solid fa-robot" aria-hidden="true" />}
                </div>
                <div className="flex-1 min-w-0 text-[12.5px] leading-relaxed text-muted">
                  <span className="inline-block text-[10.5px] font-medium px-1.5 py-0.5 rounded bg-surface-secondary border border-border me-1">{tag}</span>
                  <b className="text-foreground">{displayName}</b> {truncated}
                  <div className="text-[11px] text-muted/70 mt-0.5">{formatRelativeTime(m.created_at)}</div>
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (
            <div className="text-[12.5px] text-muted px-3.5 py-3">
              No conversation history yet. Ask TEOS something to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
