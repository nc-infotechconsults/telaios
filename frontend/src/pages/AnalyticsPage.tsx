import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chip, Spinner } from "@heroui/react";
import { getOrgAnalytics } from "../lib/api";
import { toast } from "../lib/toast";
import type { OrgProjectSummary } from "../types";

const PROJECT_STATUS_COLOR: Record<string, "warning" | "primary" | "success" | "default"> = {
  planning: "warning",
  executing: "primary",
  done: "success",
};

function HealthBar({ done, failed, total }: { done: number; failed: number; total: number }) {
  if (total === 0) return <div className="h-1.5 rounded-full bg-default-100 w-full" />;
  const donePct = (done / total) * 100;
  const failedPct = (failed / total) * 100;
  const pendingPct = 100 - donePct - failedPct;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden w-full gap-px">
      {donePct > 0 && <div className="bg-success rounded-l-full" style={{ width: `${donePct}%` }} />}
      {failedPct > 0 && <div className="bg-danger" style={{ width: `${failedPct}%` }} />}
      {pendingPct > 0 && <div className="bg-default-100 rounded-r-full flex-1" />}
    </div>
  );
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "No activity";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "Just now";
}

function ProjectCard({ project, onClick }: { project: OrgProjectSummary; onClick: () => void }) {
  const successPct =
    project.total_tasks > 0
      ? Math.round((project.done_tasks / project.total_tasks) * 100)
      : null;

  return (
    <button
      onClick={onClick}
      className="text-left flex flex-col gap-4 p-5 rounded-xl border border-divider hover:border-primary/50 hover:bg-default-50 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{project.project_name}</p>
          <p className="text-xs text-default-400 mt-0.5">
            Last activity: {formatRelativeTime(project.last_activity)}
          </p>
        </div>
        <Chip
          size="sm"
          variant="flat"
          color={PROJECT_STATUS_COLOR[project.project_status] ?? "default"}
        >
          {project.project_status}
        </Chip>
      </div>

      <HealthBar
        done={project.done_tasks}
        failed={project.failed_tasks}
        total={project.total_tasks}
      />

      <div className="flex items-center gap-4 text-xs">
        <span className="text-default-400">{project.total_tasks} tasks</span>
        <span className="flex items-center gap-1 text-success font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          {project.done_tasks} done
        </span>
        {project.failed_tasks > 0 && (
          <span className="flex items-center gap-1 text-danger font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-danger" />
            {project.failed_tasks} failed
          </span>
        )}
        {project.in_progress_tasks > 0 && (
          <span className="flex items-center gap-1 text-primary font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {project.in_progress_tasks} running
          </span>
        )}
        {successPct !== null && (
          <span className="ml-auto text-default-400">{successPct}% success</span>
        )}
      </div>
    </button>
  );
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<OrgProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOrgAnalytics();
      setProjects(data);
    } catch {
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeProjects = projects.filter((p) => p.in_progress_tasks > 0);
  const staleProjects = projects.filter(
    (p) => p.in_progress_tasks === 0 && p.total_tasks > 0 && p.last_activity
  );
  const emptyProjects = projects.filter((p) => p.total_tasks === 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Analytics</h1>
          <p className="text-sm text-default-400 mt-0.5">
            Org-wide project activity — ranked by recent task throughput
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-default-400 gap-2">
          <p className="text-lg">No projects yet</p>
          <p className="text-sm">Create a project to start seeing analytics.</p>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="flex flex-col gap-8">
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Projects", value: projects.length },
              { label: "Active now", value: activeProjects.length },
              { label: "Total tasks", value: projects.reduce((a, p) => a + p.total_tasks, 0) },
              { label: "Tasks done", value: projects.reduce((a, p) => a + p.done_tasks, 0) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-divider p-4 flex flex-col gap-1">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-default-400">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Active projects */}
          {activeProjects.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Active Projects ({activeProjects.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeProjects.map((p) => (
                  <ProjectCard
                    key={p.project_id}
                    project={p}
                    onClick={() => navigate(`/projects/${p.project_id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other projects with tasks */}
          {staleProjects.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-default-500">
                Other Projects ({staleProjects.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {staleProjects.map((p) => (
                  <ProjectCard
                    key={p.project_id}
                    project={p}
                    onClick={() => navigate(`/projects/${p.project_id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty projects */}
          {emptyProjects.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-default-400">
                No tasks yet ({emptyProjects.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {emptyProjects.map((p) => (
                  <ProjectCard
                    key={p.project_id}
                    project={p}
                    onClick={() => navigate(`/projects/${p.project_id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
