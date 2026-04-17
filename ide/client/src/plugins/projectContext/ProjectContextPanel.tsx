import { useEffect } from "react";
import { useWorkspaceStore, type PlatformProjectManifest } from "@/stores/workspaceStore";
import { useParams } from "react-router-dom";
import { RefreshCw, GitBranch, FileText, ExternalLink, CheckCircle, XCircle, Circle } from "lucide-react";
import { notify } from "@/stores/notificationStore";

function RepoStatusIcon({ status }: { status: "ok" | "error" }) {
  return status === "ok" ? (
    <CheckCircle size={13} className="text-green-400 shrink-0" />
  ) : (
    <XCircle size={13} className="text-red-400 shrink-0" />
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "planning"
      ? "bg-yellow-400"
      : status === "executing"
      ? "bg-blue-400 animate-pulse"
      : status === "done"
      ? "bg-green-400"
      : "bg-zinc-500";
  return <span className={`w-2 h-2 rounded-full ${color} inline-block`} />;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 px-3 pt-4 pb-1">
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-zinc-600 px-3 py-1 italic">{children}</p>
  );
}

export function ProjectContextPanel() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { platformProject, isLoading, loadPlatformProject, syncRepos } = useWorkspaceStore();

  useEffect(() => {
    if (workspaceId) {
      loadPlatformProject(workspaceId);
    }
  }, [workspaceId, loadPlatformProject]);

  const handleSync = async () => {
    if (!workspaceId) return;
    try {
      await syncRepos(workspaceId);
      await loadPlatformProject(workspaceId);
      notify({ title: "Repos synced", type: "success" });
    } catch {
      notify({ title: "Sync failed", type: "error" });
    }
  };

  if (!platformProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <Circle size={32} className="text-zinc-700" />
        <p className="text-sm text-zinc-500">
          {isLoading ? "Loading project…" : "No platform project linked to this workspace."}
        </p>
      </div>
    );
  }

  const manifest = platformProject as PlatformProjectManifest;
  const platformUrl = manifest.platform_api_url?.replace(/\/api$/, "").replace(/:3000$/, ":5173");
  const planUrl = platformUrl ? `${platformUrl}/projects/${manifest.project_id}` : null;

  return (
    <div className="flex flex-col h-full overflow-hidden text-sm select-none">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={manifest.project_status} />
            <span className="font-semibold text-zinc-200 truncate">{manifest.project_name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              title="Sync repositories"
              onClick={handleSync}
              className="p-1 hover:bg-white/5 rounded transition-colors text-zinc-400 hover:text-zinc-200"
              aria-label="Sync repositories"
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            </button>
            {planUrl && (
              <a
                href={planUrl}
                target="_blank"
                rel="noreferrer"
                title="Open project in platform"
                className="p-1 hover:bg-white/5 rounded transition-colors text-zinc-400 hover:text-zinc-200"
                aria-label="Open project in platform"
              >
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>
        <p className="text-[11px] text-zinc-500 mt-1 truncate">
          ID: <code className="font-mono">{manifest.project_id.slice(0, 8)}…</code>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Repositories */}
        <SectionHeader>Repositories ({manifest.repositories?.length ?? 0})</SectionHeader>
        {manifest.repositories?.length ? (
          manifest.repositories.map((repo) => {
            const cloneResult = manifest.clone_results?.find((r) => r.name === repo.name);
            return (
              <div
                key={repo.name}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03] transition-colors"
              >
                {cloneResult ? (
                  <RepoStatusIcon status={cloneResult.status} />
                ) : (
                  <Circle size={13} className="text-zinc-600 shrink-0" />
                )}
                <span className="flex-1 truncate text-zinc-300 font-mono text-xs">{repo.name}</span>
                <span className="flex items-center gap-0.5 text-[10px] text-zinc-600 shrink-0">
                  <GitBranch size={10} />
                  {repo.branch}
                </span>
              </div>
            );
          })
        ) : (
          <EmptyHint>No repositories in this project</EmptyHint>
        )}

        {/* Quick links */}
        {planUrl && (
          <>
            <SectionHeader>Platform Links</SectionHeader>
            <a
              href={planUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03] transition-colors text-zinc-400 hover:text-zinc-200"
            >
              <FileText size={13} className="shrink-0" />
              <span className="flex-1 truncate text-xs">Open Plans</span>
              <ExternalLink size={11} className="shrink-0 text-zinc-600" />
            </a>
            <a
              href={`${planUrl}?tab=environments`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03] transition-colors text-zinc-400 hover:text-zinc-200"
            >
              <FileText size={13} className="shrink-0" />
              <span className="flex-1 truncate text-xs">Environments</span>
              <ExternalLink size={11} className="shrink-0 text-zinc-600" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}
