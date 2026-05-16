import { useCallback, useEffect, useState } from "react";
import { Chip, Spinner } from "../ui";
import { getProjectAnalytics, getProjectDocAnalytics } from "../../lib/api";
import { toast } from "../../lib/toast";
import type {
  AgentStat,
  AnalyticsPeriod,
  BlockedTask,
  DailyThroughput,
  DocDailyActivity,
  DocStat,
  DocumentAnalytics,
  ProjectAnalytics,
  RecentDocEvent,
} from "../../types";

interface Props {
  projectId: string;
}

type Period = AnalyticsPeriod;

const PERIODS: Period[] = ["7d", "30d", "90d"];
const PERIOD_LABEL: Record<Period, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days" };

const STATUS_ORDER = ["in_progress", "ready", "pending", "done", "failed", "cancelled", "skipped"] as const;
const STATUS_COLOR: Record<string, string> = {
  in_progress: "bg-primary",
  ready: "bg-secondary",
  pending: "bg-default-300",
  done: "bg-success",
  failed: "bg-danger",
  cancelled: "bg-warning",
  skipped: "bg-default-200",
};
const STATUS_CHIP: Record<string, "primary" | "secondary" | "default" | "success" | "danger" | "warning"> = {
  in_progress: "primary",
  ready: "secondary",
  pending: "default",
  done: "success",
  failed: "danger",
  cancelled: "warning",
  skipped: "default",
};

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round((minutes / 60) * 10) / 10} hr`;
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 0) return "just now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h === 0) return `${m}m ago`;
  return `${h}h ${m}m ago`;
}

// ── Status breakdown ──────────────────────────────────────────────────────────

function StatusBreakdown({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-default-400 py-4">No tasks yet for this project.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {STATUS_ORDER.map((s) => {
          const pct = total > 0 ? (counts[s] ?? 0) / total : 0;
          if (pct === 0) return null;
          return (
            <div
              key={s}
              className={`${STATUS_COLOR[s]} transition-all`}
              style={{ width: `${pct * 100}%` }}
              title={`${s}: ${counts[s]}`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {STATUS_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <Chip size="sm" variant="flat" color={STATUS_CHIP[s]}>
              {s.replace(/_/g, " ")}
            </Chip>
            <span className="text-sm font-medium">{counts[s]}</span>
            <span className="text-xs text-default-400">
              ({Math.round(((counts[s] ?? 0) / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-default-400">{total} tasks total (all time)</p>
    </div>
  );
}

// ── Daily throughput bar chart ────────────────────────────────────────────────

function ThroughputChart({ data }: { data: DailyThroughput[] }) {
  const maxVal = Math.max(...data.flatMap((d) => [d.done, d.created]), 1);

  const isEmpty = data.every((d) => d.done === 0 && d.created === 0);
  if (isEmpty) {
    return <p className="text-sm text-default-400 py-4">No task activity in this period.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-1 h-24">
        {data.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
            <div className="flex items-end gap-px w-full justify-center" style={{ height: "88px" }}>
              {/* Created bar */}
              <div
                className="bg-default-200 rounded-t w-2 transition-all"
                style={{ height: `${(d.created / maxVal) * 88}px` }}
                title={`Created: ${d.created}`}
              />
              {/* Done bar */}
              <div
                className="bg-success rounded-t w-2 transition-all"
                style={{ height: `${(d.done / maxVal) * 88}px` }}
                title={`Done: ${d.done}`}
              />
            </div>
          </div>
        ))}
      </div>
      {/* Date labels — show only first, middle, last */}
      <div className="flex justify-between text-xs text-default-400 px-1">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[Math.floor(data.length / 2)]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-default-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-success inline-block" /> Done</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-default-200 inline-block" /> Created</span>
      </div>
    </div>
  );
}

// ── Agent stats table ─────────────────────────────────────────────────────────

function AgentStatsTable({ stats }: { stats: AgentStat[] }) {
  if (stats.length === 0) {
    return <p className="text-sm text-default-400 py-4">No agent-assigned tasks yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-divider">
            <th className="text-left py-2 pr-4 text-default-500 font-medium">Agent</th>
            <th className="text-right py-2 px-2 text-default-500 font-medium">Total</th>
            <th className="text-right py-2 px-2 text-default-500 font-medium">Done</th>
            <th className="text-right py-2 px-2 text-default-500 font-medium">Failed</th>
            <th className="text-right py-2 px-2 text-default-500 font-medium">Success %</th>
            <th className="text-right py-2 pl-2 text-default-500 font-medium">Avg duration</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => {
            const successPct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
            return (
              <tr key={s.agent_profile_id ?? `unassigned-${i}`} className="border-b border-divider/50 hover:bg-default-50 transition-colors">
                <td className="py-2 pr-4 font-mono text-xs text-default-500 truncate max-w-[180px]">
                  {s.agent_profile_id ?? <span className="italic text-default-400">Unassigned</span>}
                </td>
                <td className="py-2 px-2 text-right">{s.total}</td>
                <td className="py-2 px-2 text-right text-success">{s.done}</td>
                <td className="py-2 px-2 text-right text-danger">{s.failed}</td>
                <td className="py-2 px-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-default-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${successPct >= 80 ? "bg-success" : successPct >= 50 ? "bg-warning" : "bg-danger"}`}
                        style={{ width: `${successPct}%` }}
                      />
                    </div>
                    <span className="text-xs">{successPct}%</span>
                  </div>
                </td>
                <td className="py-2 pl-2 text-right text-default-500">{formatDuration(s.avg_duration_minutes)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Blocked task alerts ───────────────────────────────────────────────────────

function BlockedTaskAlerts({ tasks }: { tasks: BlockedTask[] }) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center gap-2 text-success text-sm">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        No blocked tasks — everything looks healthy.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border border-warning/40 bg-warning/5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{t.title}</p>
            <p className="text-xs text-default-400">Started {formatTimeAgo(t.started_at)} — still in progress</p>
          </div>
          <Chip size="sm" color="warning" variant="flat">stuck</Chip>
        </div>
      ))}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-divider p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

// ── Document activity chart ───────────────────────────────────────────────────

function DocActivityChart({ data }: { data: DocDailyActivity[] }) {
  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const isEmpty = data.every((d) => d.total === 0);

  if (isEmpty) {
    return <p className="text-sm text-default-400 py-4">No document activity in this period.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-1 h-24">
        {data.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
            <div className="flex items-end gap-px w-full justify-center" style={{ height: "88px" }}>
              {/* Human bar */}
              <div
                className="bg-success rounded-t w-2 transition-all"
                style={{ height: `${(d.human_events / maxVal) * 88}px` }}
                title={`Human: ${d.human_events}`}
              />
              {/* Agent bar */}
              <div
                className="bg-primary rounded-t w-2 transition-all"
                style={{ height: `${(d.agent_events / maxVal) * 88}px` }}
                title={`Agent: ${d.agent_events}`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-default-400 px-1">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[Math.floor(data.length / 2)]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-default-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-success inline-block" /> Human</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary inline-block" /> Agent</span>
      </div>
    </div>
  );
}

// ── Top documents table ───────────────────────────────────────────────────────

const FILE_TYPE_COLOR: Record<string, "primary" | "success" | "warning" | "danger" | "default"> = {
  pdf: "danger",
  docx: "primary",
  xlsx: "success",
  md: "default",
  txt: "default",
  csv: "success",
  json: "warning",
  other: "default",
};

function TopDocumentsTable({ docs }: { docs: DocStat[] }) {
  if (docs.length === 0) {
    return <p className="text-sm text-default-400 py-4">No documents accessed in this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-divider">
            <th className="text-left py-2 pr-3 text-default-500 font-medium">Document</th>
            <th className="text-right py-2 px-2 text-default-500 font-medium">Events</th>
            <th className="text-right py-2 px-2 text-default-500 font-medium">Viewed</th>
            <th className="text-right py-2 px-2 text-default-500 font-medium">Edited</th>
            <th className="text-right py-2 pl-2 text-default-500 font-medium">Agent / Human</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.document_id} className="border-b border-divider/50 hover:bg-default-50 transition-colors">
              <td className="py-2 pr-3 max-w-[200px]">
                <div className="flex items-center gap-2 min-w-0">
                  <Chip size="sm" variant="flat" color={FILE_TYPE_COLOR[d.file_type] ?? "default"}>
                    {d.file_type}
                  </Chip>
                  <span className="truncate text-xs">{d.document_name}</span>
                </div>
              </td>
              <td className="py-2 px-2 text-right font-medium">{d.total_events}</td>
              <td className="py-2 px-2 text-right text-default-500">{d.viewed}</td>
              <td className="py-2 px-2 text-right text-default-500">{d.edited}</td>
              <td className="py-2 pl-2 text-right">
                <span className="text-primary">{d.agent_events}</span>
                <span className="text-default-400 mx-1">/</span>
                <span className="text-success">{d.human_events}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Recent docs feed ──────────────────────────────────────────────────────────

const ACTION_VERB: Record<string, string> = {
  viewed: "viewed",
  edited: "edited",
  commented: "commented on",
  created: "created",
  shared: "shared",
  deleted: "deleted",
  restored: "restored",
  version_created: "created a version of",
};

function RecentDocsFeed({ events }: { events: RecentDocEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-default-400 py-2">No recent document events.</p>;
  }

  return (
    <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
      {events.map((e) => {
        const diff = Date.now() - new Date(e.created_at).getTime();
        const h = Math.floor(diff / 3_600_000);
        const m = Math.floor((diff % 3_600_000) / 60_000);
        const timeAgo = diff < 0 ? "just now" : h === 0 ? `${m}m ago` : `${h}h ${m}m ago`;
        const actor = e.user_name ?? "Agent";
        const verb = ACTION_VERB[e.action] ?? e.action;

        return (
          <div key={e.id} className="flex items-center gap-2 py-1.5 text-xs border-b border-divider/40 last:border-0">
            <span className={`shrink-0 font-medium ${e.user_id ? "text-success" : "text-primary"}`}>
              {actor}
            </span>
            <span className="text-default-400">{verb}</span>
            <span className="truncate text-default-600 flex-1">{e.document_name}</span>
            <span className="shrink-0 text-default-400">{timeAgo}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main AnalyticsTab ─────────────────────────────────────────────────────────

export default function AnalyticsTab({ projectId }: Props) {
  const [period, setPeriod] = useState<Period>("7d");
  const [data, setData] = useState<ProjectAnalytics | null>(null);
  const [docData, setDocData] = useState<DocumentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(true);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    setDocLoading(true);
    const [taskRes, docRes] = await Promise.allSettled([
      getProjectAnalytics(projectId, p),
      getProjectDocAnalytics(projectId, p),
    ]);
    if (taskRes.status === "fulfilled") {
      setData(taskRes.value);
    } else {
      toast.error("Failed to load task analytics");
    }
    if (docRes.status === "fulfilled") {
      setDocData(docRes.value);
    } else {
      toast.error("Failed to load document analytics");
    }
    setLoading(false);
    setDocLoading(false);
  }, [projectId]);

  useEffect(() => { load(period); }, [load, period]);

  const handlePeriod = (p: Period) => {
    setPeriod(p);
  };

  return (
    <div className="flex flex-col gap-5 px-5 py-5">

      {/* Period toggle */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-default-400 mr-2">Period:</span>
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => handlePeriod(p)}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
              period === p
                ? "bg-primary text-white"
                : "bg-default-100 text-default-500 hover:bg-default-200"
            }`}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Section title="Task Status (all time)">
            <StatusBreakdown counts={data.task_status_counts} />
          </Section>

          <Section title={`Daily Throughput (last ${PERIOD_LABEL[period]})`}>
            <ThroughputChart data={data.daily_throughput} />
          </Section>

          <Section title="Agent Performance (all time)">
            <AgentStatsTable stats={data.agent_stats} />
          </Section>

          <Section title="Blocked Tasks (>2h in progress)">
            <BlockedTaskAlerts tasks={data.blocked_tasks} />
          </Section>

          {/* Document signal sections — share the same period toggle */}
          <Section title={`Document Activity (last ${PERIOD_LABEL[period]})`}>
            {docLoading ? <Spinner size="sm" /> : (
              <DocActivityChart data={docData?.daily_activity ?? []} />
            )}
            {!docLoading && docData && docData.total_events > 0 && (
              <p className="text-xs text-default-400">
                {docData.total_events} events —{" "}
                {docData.total_agent_events} agent,{" "}
                {docData.total_human_events} human
              </p>
            )}
          </Section>

          <Section title="Most Active Documents">
            {docLoading ? <Spinner size="sm" /> : (
              <TopDocumentsTable docs={docData?.top_documents ?? []} />
            )}
          </Section>

          {/* Full-width recent activity feed */}
          <div className="lg:col-span-2">
            <Section title="Recent Document Events">
              {docLoading ? <Spinner size="sm" /> : (
                <RecentDocsFeed events={docData?.recent_events ?? []} />
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
