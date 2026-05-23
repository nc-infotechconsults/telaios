import { useEffect, useState } from "react";
import { getRepositories, createRepository, deleteRepository } from "../../lib/api";
import type { Repository, RepositoryProviderType } from "../../types";

const PROVIDER_ICONS: Record<RepositoryProviderType, string> = {
  github: "🐙",
  gitlab: "🦊",
  bitbucket: "🪣",
  git: "⎔",
  s3: "☁",
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ready: { label: "Synced", color: "#30d158" },
  cloning: { label: "Indexing…", color: "#ff9f0a" },
  error: { label: "Failed", color: "#ff375f" },
  unconfigured: { label: "Not configured", color: "var(--label-quaternary)" },
};

export default function ProjectRepositories({ projectId }: { projectId: string }) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ provider: "git" as RepositoryProviderType, url: "", branch: "main" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getRepositories(projectId)
      .then(setRepos)
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreate = async () => {
    if (!form.url.trim()) return;
    setCreating(true);
    try {
      const repo = await createRepository(projectId, {
        provider_type: form.provider,
        remote_url: form.url.trim(),
        branch: form.branch.trim() || "main",
        name: form.url.split("/").pop()?.replace(".git", "") ?? "repo",
        auth_type: "none",
      });
      setRepos((prev) => [...prev, repo]);
      setShowModal(false);
      setForm({ provider: "git", url: "", branch: "main" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteRepository(projectId, id);
    setRepos((prev) => prev.filter((r) => r.id !== id));
  };

  const stats = [
    { label: "Connected", value: repos.length, color: "#0a84ff" },
    { label: "Synced",    value: repos.filter(r => r.status === "ready").length, color: "#30d158" },
    { label: "Indexing",  value: repos.filter(r => r.status === "cloning").length, color: "#ff9f0a" },
    { label: "Failed",    value: repos.filter(r => r.status === "error").length, color: "#ff375f" },
  ];

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--label-primary)" }}>Repositories</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--label-secondary)" }}>
            Connect and index git repositories for TEOS knowledge extraction
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
            border: "none",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Connect Repository
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{ background: "var(--glass)", backdropFilter: "blur(20px)", border: "0.5px solid var(--glass-edge)", borderRadius: 14, padding: "12px 14px", boxShadow: "var(--shadow-glass-panel)" }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{loading ? "–" : s.value}</div>
            <div style={{ fontSize: 12, color: "var(--label-secondary)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Repo cards */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2].map(i => (
            <div key={i} style={{ height: 100, borderRadius: 16, background: "var(--fill-quaternary)", animation: "pulse 2s ease-in-out infinite" }} aria-hidden="true" />
          ))}
        </div>
      ) : repos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--label-tertiary)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⎔</div>
          <p style={{ fontSize: 14, margin: 0 }}>No repositories connected yet</p>
          <p style={{ fontSize: 12, margin: "8px 0 0" }}>Connect a repository to enable code knowledge extraction</p>
          <button onClick={() => setShowModal(true)} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 10, background: "#0a84ff", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Connect your first repo
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }} role="list" aria-label="Repositories">
          {repos.map((repo) => {
            const statusInfo = STATUS_MAP[repo.status] ?? STATUS_MAP.unconfigured;
            return (
              <div
                key={repo.id}
                role="listitem"
                style={{
                  background: "var(--glass)",
                  backdropFilter: "blur(20px)",
                  border: "0.5px solid var(--glass-edge)",
                  borderRadius: 16,
                  padding: "16px 18px",
                  boxShadow: "var(--shadow-glass-panel)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }} aria-hidden="true">{PROVIDER_ICONS[repo.provider_type]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--label-primary)" }}>{repo.name}</span>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 9999, background: statusInfo.color + "18", color: statusInfo.color, fontWeight: 500 }}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--label-tertiary)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {repo.remote_url ?? repo.bucket_name ?? "—"}
                    </div>
                    <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                      {repo.branch && (
                        <MetaChip icon="⎇" label={`Branch: ${repo.branch}`} />
                      )}
                      <MetaChip icon="⌖" label={`Provider: ${repo.provider_type}`} />
                    </div>
                    {repo.status === "cloning" && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ height: 3, borderRadius: 9999, background: "var(--fill-tertiary)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: "60%", background: "#ff9f0a", borderRadius: 9999, animation: "pulse 2s ease-in-out infinite" }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <ActionButton label="Ask about this repo" color="#0a84ff" icon="?" />
                    <ActionButton label="Re-sync" color="#30d158" icon="↺" />
                    <ActionButton
                      label="Delete"
                      color="#ff375f"
                      icon="✕"
                      onClick={() => handleDelete(repo.id)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connect modal */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            className="glass-panel-strong"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(480px, 92vw)", padding: 24, boxShadow: "var(--shadow-glass-lg)" }}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "var(--label-primary)" }}>Connect Repository</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--label-secondary)", marginBottom: 4, display: "block" }}>Provider</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["github", "gitlab", "bitbucket", "git"] as RepositoryProviderType[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setForm(f => ({ ...f, provider: p }))}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "0.5px solid",
                        borderColor: form.provider === p ? "#0a84ff" : "var(--hairline)",
                        background: form.provider === p ? "rgba(10,132,255,0.12)" : "var(--fill-quaternary)",
                        color: form.provider === p ? "#0a84ff" : "var(--label-secondary)",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: form.provider === p ? 600 : 400,
                      }}
                    >
                      {PROVIDER_ICONS[p]} {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="repo-url" style={{ fontSize: 12, color: "var(--label-secondary)", marginBottom: 4, display: "block" }}>Repository URL</label>
                <input
                  id="repo-url"
                  type="text"
                  value={form.url}
                  onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://github.com/org/repo.git"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, background: "var(--fill-tertiary)", border: "0.5px solid var(--glass-edge)", color: "var(--label-primary)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label htmlFor="repo-branch" style={{ fontSize: 12, color: "var(--label-secondary)", marginBottom: 4, display: "block" }}>Branch</label>
                <input
                  id="repo-branch"
                  type="text"
                  value={form.branch}
                  onChange={(e) => setForm(f => ({ ...f, branch: e.target.value }))}
                  placeholder="main"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, background: "var(--fill-tertiary)", border: "0.5px solid var(--glass-edge)", color: "var(--label-primary)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ padding: "8px 16px", borderRadius: 10, background: "var(--fill-tertiary)", border: "0.5px solid var(--hairline)", color: "var(--label-secondary)", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !form.url.trim()}
                style={{
                  padding: "8px 20px",
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
                  border: "none",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: creating || !form.url.trim() ? "default" : "pointer",
                  opacity: creating || !form.url.trim() ? 0.5 : 1,
                }}
              >
                {creating ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--label-tertiary)" }}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

function ActionButton({ label, color, icon, onClick }: { label: string; color: string; icon: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: color + "14",
        border: "0.5px solid " + color + "30",
        color,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {icon}
    </button>
  );
}
