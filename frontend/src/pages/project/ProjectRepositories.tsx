import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { getRepositories, createRepository } from "../../lib/api";
import type { Repository } from "../../types";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

// ─── Mock data (used in DEMO mode only) ───────────────────────────────────────

const MOCK_REPOS = [
  {
    name: "acme/atlas-api",   provider: "GitHub", url: "github.com/acme/atlas-api",
    branch: "main",       lang: "TypeScript", langColor: "#3178c6",
    status: "synced",   files: 1284, symbols: 8420,  lastSync: "12 minutes ago", progress: 100,
    desc: "REST + GraphQL gateway. Indexed at commit a3f9c12.",
  },
  {
    name: "acme/atlas-web",   provider: "GitHub", url: "github.com/acme/atlas-web",
    branch: "main",       lang: "TypeScript", langColor: "#3178c6",
    status: "synced",   files: 3142, symbols: 12480, lastSync: "1 hour ago",     progress: 100,
    desc: "Customer-facing web app. UI component library indexed.",
  },
  {
    name: "acme/atlas-edge",  provider: "GitHub", url: "github.com/acme/atlas-edge",
    branch: "main",       lang: "Rust",       langColor: "#dea584",
    status: "indexing", files: 412,  symbols: 0,     lastSync: "just now",       progress: 64,
    desc: "Low-latency edge workers. Pulling commits…",
  },
  {
    name: "acme/atlas-infra", provider: "GitLab", url: "gitlab.com/acme/atlas-infra",
    branch: "production", lang: "HCL",        langColor: "#5e5ce6",
    status: "synced",   files: 318,  symbols: 1240,  lastSync: "yesterday",      progress: 100,
    desc: "Terraform & helm charts. Auto-syncs on push.",
  },
  {
    name: "acme/atlas-cli",   provider: "GitHub", url: "github.com/acme/atlas-cli",
    branch: "main",       lang: "Go",         langColor: "#00add8",
    status: "failed",   files: 0,    symbols: 0,     lastSync: "3 hours ago",    progress: 0,
    desc: "Authentication expired. Reconnect to resume indexing.",
  },
];

// ─── Helpers to map real Repository fields to UI shape ────────────────────────

const PROVIDER_LANG: Record<string, { lang: string; langColor: string }> = {
  github:    { lang: "TypeScript", langColor: "#3178c6" },
  gitlab:    { lang: "TypeScript", langColor: "#3178c6" },
  bitbucket: { lang: "TypeScript", langColor: "#3178c6" },
  git:       { lang: "Unknown",    langColor: "#8b8b8b" },
  s3:        { lang: "S3",         langColor: "#ff9900" },
};

function repoStatusToUi(status: Repository["status"]): string {
  switch (status) {
    case "ready":       return "synced";
    case "cloning":     return "indexing";
    case "error":       return "error";
    case "unconfigured":
    default:            return "pending";
  }
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function repoToUi(r: Repository) {
  const { lang, langColor } = PROVIDER_LANG[r.provider_type] ?? PROVIDER_LANG.git;
  const uiStatus = repoStatusToUi(r.status);
  return {
    id:        r.id,
    name:      r.name,
    provider:  r.provider_type,
    url:       r.remote_url ?? "",
    branch:    r.branch ?? "main",
    lang,
    langColor,
    status:    uiStatus,
    files:     0,
    symbols:   0,
    lastSync:  formatRelativeTime(r.updated_at),
    progress:  uiStatus === "indexing" ? 50 : uiStatus === "synced" ? 100 : 0,
    desc:      r.error_message ?? "",
  };
}

function statusAttr(s: string) {
  return s === "synced" ? "done" : s === "indexing" ? "running" : "failed";
}

// ─── Connect modal ────────────────────────────────────────────────────────────

const PROVIDER_TYPE_MAP: Record<string, Repository["provider_type"]> = {
  GitHub: "github", GitLab: "gitlab", Bitbucket: "bitbucket", Other: "git",
};

function ConnectRepoModal({
  projectId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [provider, setProvider] = useState("GitHub");
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [saving, setSaving] = useState(false);

  async function handleConnect() {
    if (DEMO) { onClose(); return; }
    setSaving(true);
    try {
      await createRepository(projectId, {
        name: url,
        provider_type: PROVIDER_TYPE_MAP[provider] ?? "git",
        remote_url: url,
        branch: branch || "main",
        auth_type: "none",
      });
      onSuccess();
      onClose();
    } catch {
      // ignore — keep modal open so user can retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-panel" onClick={(e) => e.stopPropagation()} style={{ width: 540, padding: 0 }}>
        <div style={{ padding: "20px 22px 6px" }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>Connect a repository</div>
          <div style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 4 }}>
            TEOS will clone, index symbols and start watching for commits.
          </div>
        </div>
        <div style={{ padding: "12px 22px 0", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div className="form-l">Provider</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["GitHub", "GitLab", "Bitbucket", "Other"].map((p) => (
                <button key={p} className="pill-btn" data-primary={provider === p ? "true" : undefined}
                  onClick={() => setProvider(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="form-l">Repository URL</div>
            <input className="form-input" placeholder="github.com/acme/atlas-web"
              value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <div className="form-l">Branch</div>
            <input className="form-input" placeholder="main" value={branch}
              onChange={(e) => setBranch(e.target.value)} />
          </div>
          <div style={{
            padding: 12, borderRadius: 12, background: "var(--glass-weak)",
            border: "0.5px solid var(--hairline)", fontSize: 12, color: "var(--fg-2)",
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <Icon name="sparkle" size="sm" style={{ marginTop: 2, color: "var(--accent-1)" }} />
            <div>TEOS extracts symbols, doc strings, dependency graphs and recent PR descriptions.
              Nothing is shared outside your workspace.</div>
          </div>
        </div>
        <div style={{
          padding: 18, display: "flex", gap: 8, justifyContent: "flex-end",
          borderTop: "0.5px solid var(--hairline)", marginTop: 16,
        }}>
          <button className="pill-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="pill-btn" data-primary="true" onClick={handleConnect} disabled={saving}>
            {saving ? "Connecting…" : "Connect & start indexing"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectRepositories({ projectId }: { projectId: string }) {
  const [showConnect, setShowConnect] = useState(false);
  const [repos, setRepos] = useState(DEMO ? MOCK_REPOS : [] as ReturnType<typeof repoToUi>[]);
  const [loading, setLoading] = useState(!DEMO);
  const [error, setError] = useState<string | null>(null);

  async function loadRepos() {
    if (DEMO) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getRepositories(projectId);
      setRepos(data.map(repoToUi));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadRepos(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncedCount = repos.filter((r) => r.status === "synced").length;

  return (
    <div className="main-scroll">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <h1 className="h-page">Repositories</h1>
          <p className="sub-page" style={{ margin: 0 }}>
            Git sources TEOS indexes for knowledge. Connect a repo and TEOS extracts symbols, call graphs,
            doc strings and patterns so agents can reason over them.
          </p>
        </div>
        <button className="pill-btn" data-primary="true" onClick={() => setShowConnect(true)}>
          <Icon name="plus" size="sm" /> Connect repository
        </button>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ margin: "20px 0 14px" }}>
        {[
          { l: "Connected",     v: repos.length,  d: `${syncedCount} synced` },
          { l: "Files indexed", v: "5,156",        d: "across 4 languages" },
          { l: "Symbols",       v: "22.4k",        d: "functions, classes, types" },
          { l: "Last sync",     v: "12m",          d: "atlas-api" },
        ].map((s, i) => (
          <div key={i} className="card stat">
            <span className="stat-l">{s.l}</span>
            <span className="stat-v">{s.v}</span>
            <span className="stat-delta">{s.d}</span>
          </div>
        ))}
      </div>

      {/* Loading / error states */}
      {loading && (
        <div style={{ padding: "24px 0", color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>
      )}
      {error && (
        <div style={{ padding: "12px 0", color: "var(--error, #e05)", fontSize: 13 }}>{error}</div>
      )}

      {/* Repo cards */}
      {!loading && (
        <div className="stack">
          {repos.map((r) => (
            <div key={r.name} className="card repo-card">
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div className="repo-prov-ico">
                  <Icon name="git" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-0.01em" }}>{r.name}</span>
                    <span className="crumb-tag"><Icon name="branch" size="sm" /> {r.branch}</span>
                    <span className="crumb-tag">
                      <span className="lang-dot" style={{ background: r.langColor }} /> {r.lang}
                    </span>
                    <span className="task-status" data-s={statusAttr(r.status)}>{r.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 4 }}>
                    <span className="mono">{r.url}</span> · {r.desc}
                  </div>
                  {r.status === "indexing" && (
                    <div className="task-bar" style={{ marginTop: 10, maxWidth: 480 }}>
                      <div style={{ width: r.progress + "%" }} />
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 11.5, color: "var(--fg-3)" }}>
                    <span><b style={{ color: "var(--fg-2)" }}>{r.files.toLocaleString()}</b> files</span>
                    <span><b style={{ color: "var(--fg-2)" }}>{r.symbols.toLocaleString()}</b> symbols</span>
                    <span>Last sync <b style={{ color: "var(--fg-2)" }}>{r.lastSync}</b></span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <button className="pill-btn">
                    <Icon name="sparkle" size="sm" /> Ask about this repo
                  </button>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="pill-btn" onClick={() => void loadRepos()}><Icon name="refresh" size="sm" /> Re-sync</button>
                    <button className="pill-btn"><Icon name="settings" size="sm" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button className="card empty-card" onClick={() => setShowConnect(true)}>
            <Icon name="plus" />
            <div>
              <b>Connect another repository</b>
              <div>GitHub, GitLab, Bitbucket — or paste any git URL</div>
            </div>
          </button>
        </div>
      )}

      {showConnect && (
        <ConnectRepoModal
          projectId={projectId}
          onClose={() => setShowConnect(false)}
          onSuccess={() => void loadRepos()}
        />
      )}
    </div>
  );
}
