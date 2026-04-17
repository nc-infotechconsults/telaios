import { useEffect, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Server, ExternalLink, RefreshCw, CheckCircle, XCircle, Circle } from "lucide-react";

interface Environment {
  id: string;
  name: string;
  type: "kubernetes" | "docker";
  status: "connected" | "disconnected" | "error";
  namespace?: string;
}

function StatusIcon({ status }: { status: Environment["status"] }) {
  if (status === "connected") return <CheckCircle size={13} className="text-green-400 shrink-0" />;
  if (status === "error") return <XCircle size={13} className="text-red-400 shrink-0" />;
  return <Circle size={13} className="text-zinc-600 shrink-0" />;
}

export function EnvironmentsPanel() {
  const platformProject = useWorkspaceStore((s) => s.platformProject);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(false);

  const platformUrl = platformProject?.platform_api_url?.replace(/\/api$/, "").replace(/:3000$/, ":5173");
  const projectId = platformProject?.project_id;

  async function fetchEnvironments() {
    if (!platformProject?.platform_api_url || !projectId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("swe_auth_token");
      const res = await fetch(
        `${platformProject.platform_api_url}/projects/${projectId}/environments`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (res.ok) {
        const data = await res.json() as Environment[];
        setEnvironments(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projectId) {
      void fetchEnvironments();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!platformProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <Server size={32} className="text-zinc-700" />
        <p className="text-sm text-zinc-500">
          Open a platform project workspace to view environments.
        </p>
      </div>
    );
  }

  const envPageUrl = platformUrl ? `${platformUrl}/projects/${projectId}` : null;

  return (
    <div className="flex flex-col h-full overflow-hidden text-sm select-none">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-white/5 flex items-center justify-between">
        <span className="font-semibold text-zinc-200 text-sm">Environments</span>
        <div className="flex items-center gap-1">
          <button
            title="Refresh"
            onClick={fetchEnvironments}
            className="p-1 hover:bg-white/5 rounded transition-colors text-zinc-400 hover:text-zinc-200"
            aria-label="Refresh environments"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          {envPageUrl && (
            <a
              href={envPageUrl}
              target="_blank"
              rel="noreferrer"
              title="Manage in platform"
              className="p-1 hover:bg-white/5 rounded transition-colors text-zinc-400 hover:text-zinc-200"
              aria-label="Manage environments in platform"
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && environments.length === 0 ? (
          <p className="text-xs text-zinc-600 px-3 py-3 italic">Loading…</p>
        ) : environments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <Server size={24} className="text-zinc-700" />
            <p className="text-xs text-zinc-500">No environments configured.</p>
            {envPageUrl && (
              <a
                href={envPageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 hover:underline flex items-center gap-1"
              >
                Add environment <ExternalLink size={10} />
              </a>
            )}
          </div>
        ) : (
          environments.map((env) => {
            const detailUrl = envPageUrl ? `${envPageUrl}/environments/${env.id}` : null;
            return (
              <div
                key={env.id}
                className="px-3 py-2.5 hover:bg-white/[0.03] transition-colors border-b border-white/[0.03]"
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={env.status} />
                  <span className="flex-1 truncate font-medium text-zinc-200 text-xs">{env.name}</span>
                  {detailUrl && (
                    <a
                      href={detailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors"
                      aria-label={`Open ${env.name} in platform`}
                    >
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-zinc-600 mt-0.5 ml-5">
                  {env.type}{env.namespace ? ` · ${env.namespace}` : ""}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
