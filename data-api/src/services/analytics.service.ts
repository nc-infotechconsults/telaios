import { AppDataSource } from "../configs/data-source.config";

// Whitelisted period values mapped to days
const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function parsePeriodDays(period: unknown): number {
  if (typeof period === "string" && PERIOD_DAYS[period] !== undefined) {
    return PERIOD_DAYS[period];
  }
  return 7;
}

export type TaskStatusCount = {
  status: string;
  count: number;
};

export type DailyThroughput = {
  date: string;
  done: number;
  created: number;
};

export type AgentStat = {
  agent_profile_id: string | null;
  total: number;
  done: number;
  failed: number;
  avg_duration_minutes: number | null;
};

export type BlockedTask = {
  id: string;
  title: string;
  plan_id: string;
  started_at: string;
};

export type ProjectAnalytics = {
  /** All-time snapshot of task statuses for this project — not period-filtered. */
  task_status_counts: Record<string, number>;
  /** Daily task activity within the selected period. Zero-filled for days with no activity. */
  daily_throughput: DailyThroughput[];
  /** All-time agent performance stats for this project. */
  agent_stats: AgentStat[];
  /** Tasks currently stuck in_progress for more than 2 hours. */
  blocked_tasks: BlockedTask[];
};

const BLOCKED_HOURS = 2;

/**
 * Returns analytics for a single project.
 * Status counts are all-time (current snapshot).
 * Throughput is period-scoped and zero-filled.
 * Agent stats are all-time.
 * Blocked tasks are current state (not period-filtered).
 */
export async function getProjectAnalytics(
  projectId: string,
  days: number
): Promise<ProjectAnalytics> {
  const db = AppDataSource;

  // ── 1. All-time task status counts ────────────────────────────────────────
  const statusRows: { status: string; count: string }[] = await db.query(
    `SELECT t.status, COUNT(*) AS count
     FROM tasks t
     JOIN plans p ON t.plan_id = p.id
     WHERE p.project_id = $1
       AND t.deleted_at IS NULL
     GROUP BY t.status`,
    [projectId]
  );

  const ALL_STATUSES = ["pending", "ready", "in_progress", "done", "failed", "cancelled", "skipped"];
  const task_status_counts: Record<string, number> = {};
  for (const s of ALL_STATUSES) task_status_counts[s] = 0;
  for (const row of statusRows) {
    task_status_counts[row.status] = parseInt(row.count, 10);
  }

  // ── 2. Daily throughput — zero-filled via generate_series ─────────────────
  // "done" = tasks completed (status=done, completed_at in window)
  // "created" = tasks created (created_at in window)
  const throughputRows: { date: string; done: string; created: string }[] = await db.query(
    `WITH date_series AS (
       SELECT gs::date AS day
       FROM generate_series(
         (NOW() AT TIME ZONE 'UTC')::date - ($2 - 1) * INTERVAL '1 day',
         (NOW() AT TIME ZONE 'UTC')::date,
         INTERVAL '1 day'
       ) gs
     ),
     done_counts AS (
       SELECT DATE(t.completed_at AT TIME ZONE 'UTC') AS day, COUNT(*) AS cnt
       FROM tasks t
       JOIN plans p ON t.plan_id = p.id
       WHERE p.project_id = $1
         AND t.status = 'done'
         AND t.completed_at >= (NOW() AT TIME ZONE 'UTC')::date - ($2 - 1) * INTERVAL '1 day'
         AND t.deleted_at IS NULL
       GROUP BY DATE(t.completed_at AT TIME ZONE 'UTC')
     ),
     created_counts AS (
       SELECT DATE(t.created_at AT TIME ZONE 'UTC') AS day, COUNT(*) AS cnt
       FROM tasks t
       JOIN plans p ON t.plan_id = p.id
       WHERE p.project_id = $1
         AND t.created_at >= (NOW() AT TIME ZONE 'UTC')::date - ($2 - 1) * INTERVAL '1 day'
         AND t.deleted_at IS NULL
       GROUP BY DATE(t.created_at AT TIME ZONE 'UTC')
     )
     SELECT
       TO_CHAR(ds.day, 'YYYY-MM-DD') AS date,
       COALESCE(dc.cnt, 0) AS done,
       COALESCE(cc.cnt, 0) AS created
     FROM date_series ds
     LEFT JOIN done_counts dc ON dc.day = ds.day
     LEFT JOIN created_counts cc ON cc.day = ds.day
     ORDER BY ds.day ASC`,
    [projectId, days]
  );

  const daily_throughput: DailyThroughput[] = throughputRows.map((r) => ({
    date: r.date,
    done: parseInt(r.done, 10),
    created: parseInt(r.created, 10),
  }));

  // ── 3. All-time agent stats ────────────────────────────────────────────────
  const agentRows: {
    agent_profile_id: string | null;
    total: string;
    done: string;
    failed: string;
    avg_seconds: string | null;
  }[] = await db.query(
    `SELECT
       t.agent_profile_id,
       COUNT(*) AS total,
       SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) AS failed,
       AVG(
         CASE
           WHEN t.started_at IS NOT NULL
            AND t.completed_at IS NOT NULL
            AND t.status IN ('done', 'failed')
           THEN EXTRACT(EPOCH FROM (t.completed_at - t.started_at))
           ELSE NULL
         END
       ) AS avg_seconds
     FROM tasks t
     JOIN plans p ON t.plan_id = p.id
     WHERE p.project_id = $1
       AND t.deleted_at IS NULL
     GROUP BY t.agent_profile_id`,
    [projectId]
  );

  const agent_stats: AgentStat[] = agentRows.map((r) => ({
    agent_profile_id: r.agent_profile_id ?? null,
    total: parseInt(r.total, 10),
    done: parseInt(r.done, 10),
    failed: parseInt(r.failed, 10),
    avg_duration_minutes:
      r.avg_seconds != null ? Math.round((parseFloat(r.avg_seconds) / 60) * 10) / 10 : null,
  }));

  // ── 4. Currently blocked tasks (in_progress > BLOCKED_HOURS hours) ─────────
  const blockedRows: { id: string; title: string; plan_id: string; started_at: Date }[] =
    await db.query(
      `SELECT t.id, t.title, t.plan_id, t.started_at
       FROM tasks t
       JOIN plans p ON t.plan_id = p.id
       WHERE p.project_id = $1
         AND t.status = 'in_progress'
         AND t.started_at < NOW() - $2 * INTERVAL '1 hour'
         AND t.deleted_at IS NULL
       ORDER BY t.started_at ASC`,
      [projectId, BLOCKED_HOURS]
    );

  const blocked_tasks: BlockedTask[] = blockedRows.map((r) => ({
    id: r.id,
    title: r.title,
    plan_id: r.plan_id,
    started_at: r.started_at instanceof Date ? r.started_at.toISOString() : String(r.started_at),
  }));

  return { task_status_counts, daily_throughput, agent_stats, blocked_tasks };
}

// ── Document analytics types ──────────────────────────────────────────────────

export type DocStat = {
  document_id: string;
  document_name: string;
  file_type: string;
  total_events: number;
  viewed: number;
  edited: number;
  commented: number;
  agent_events: number;
  human_events: number;
};

export type DocDailyActivity = {
  date: string;
  total: number;
  agent_events: number;
  human_events: number;
};

export type RecentDocEvent = {
  id: string;
  document_id: string;
  document_name: string;
  action: string;
  user_id: string | null;
  user_name: string | null;
  created_at: string;
};

export type DocumentAnalytics = {
  /** Top 10 documents ranked by event count within the period. */
  top_documents: DocStat[];
  /** Daily document activity (zero-filled) for the selected period. */
  daily_activity: DocDailyActivity[];
  /** 15 most recent document events within the period. */
  recent_events: RecentDocEvent[];
  /** Total event count across ALL documents in the period (derived from daily_activity, no LIMIT). */
  total_events: number;
  /** Total agent-generated events in the period. */
  total_agent_events: number;
  /** Total human-generated events in the period. */
  total_human_events: number;
};

/**
 * Returns document activity analytics for a single project.
 * Documents have a direct project_id column — no plans join needed.
 * agent_events: user_id IS NULL; human_events: user_id IS NOT NULL.
 */
export async function getProjectDocumentAnalytics(
  projectId: string,
  days: number
): Promise<DocumentAnalytics> {
  const db = AppDataSource;

  // ── 1. Top documents by event count ──────────────────────────────────────
  const topRows: {
    document_id: string;
    document_name: string;
    file_type: string;
    total_events: string;
    viewed: string;
    edited: string;
    commented: string;
    agent_events: string;
    human_events: string;
  }[] = await db.query(
    `SELECT
       d.id AS document_id,
       d.name AS document_name,
       d.file_type,
       COUNT(da.id) AS total_events,
       SUM(CASE WHEN da.action = 'viewed'    THEN 1 ELSE 0 END) AS viewed,
       SUM(CASE WHEN da.action = 'edited'    THEN 1 ELSE 0 END) AS edited,
       SUM(CASE WHEN da.action = 'commented' THEN 1 ELSE 0 END) AS commented,
       SUM(CASE WHEN da.user_id IS NULL      THEN 1 ELSE 0 END) AS agent_events,
       SUM(CASE WHEN da.user_id IS NOT NULL  THEN 1 ELSE 0 END) AS human_events
     FROM document_activities da
     JOIN documents d ON d.id = da.document_id
     WHERE d.project_id = $1
       AND d.deleted_at IS NULL
       AND da.created_at >= (NOW() AT TIME ZONE 'UTC')::date - ($2 - 1) * INTERVAL '1 day'
     GROUP BY d.id, d.name, d.file_type
     ORDER BY total_events DESC
     LIMIT 10`,
    [projectId, days]
  );

  const top_documents: DocStat[] = topRows.map((r) => ({
    document_id: r.document_id,
    document_name: r.document_name,
    file_type: r.file_type,
    total_events: parseInt(r.total_events, 10),
    viewed: parseInt(r.viewed, 10),
    edited: parseInt(r.edited, 10),
    commented: parseInt(r.commented, 10),
    agent_events: parseInt(r.agent_events, 10),
    human_events: parseInt(r.human_events, 10),
  }));

  // ── 2. Daily document activity — zero-filled ──────────────────────────────
  const dailyRows: {
    date: string;
    total: string;
    agent_events: string;
    human_events: string;
  }[] = await db.query(
    `WITH date_series AS (
       SELECT gs::date AS day
       FROM generate_series(
         (NOW() AT TIME ZONE 'UTC')::date - ($2 - 1) * INTERVAL '1 day',
         (NOW() AT TIME ZONE 'UTC')::date,
         INTERVAL '1 day'
       ) gs
     ),
     activity AS (
       SELECT
         DATE(da.created_at AT TIME ZONE 'UTC') AS day,
         COUNT(da.id) AS total,
         SUM(CASE WHEN da.user_id IS NULL     THEN 1 ELSE 0 END) AS agent_events,
         SUM(CASE WHEN da.user_id IS NOT NULL THEN 1 ELSE 0 END) AS human_events
       FROM document_activities da
       JOIN documents d ON d.id = da.document_id
       WHERE d.project_id = $1
         AND d.deleted_at IS NULL
         AND da.created_at >= (NOW() AT TIME ZONE 'UTC')::date - ($2 - 1) * INTERVAL '1 day'
       GROUP BY DATE(da.created_at AT TIME ZONE 'UTC')
     )
     SELECT
       TO_CHAR(ds.day, 'YYYY-MM-DD') AS date,
       COALESCE(a.total, 0) AS total,
       COALESCE(a.agent_events, 0) AS agent_events,
       COALESCE(a.human_events, 0) AS human_events
     FROM date_series ds
     LEFT JOIN activity a ON a.day = ds.day
     ORDER BY ds.day ASC`,
    [projectId, days]
  );

  const daily_activity: DocDailyActivity[] = dailyRows.map((r) => ({
    date: r.date,
    total: parseInt(r.total, 10),
    agent_events: parseInt(r.agent_events, 10),
    human_events: parseInt(r.human_events, 10),
  }));

  // ── 3. Recent events (last 15 in the period) ──────────────────────────────
  const recentRows: {
    id: string;
    document_id: string;
    document_name: string;
    action: string;
    user_id: string | null;
    user_name: string | null;
    created_at: Date;
  }[] = await db.query(
    `SELECT
       da.id,
       da.document_id,
       d.name AS document_name,
       da.action,
       da.user_id,
       u.display_name AS user_name,
       da.created_at
     FROM document_activities da
     JOIN documents d ON d.id = da.document_id
     LEFT JOIN users u ON u.id = da.user_id
     WHERE d.project_id = $1
       AND d.deleted_at IS NULL
       AND da.created_at >= (NOW() AT TIME ZONE 'UTC')::date - ($2 - 1) * INTERVAL '1 day'
     ORDER BY da.created_at DESC
     LIMIT 15`,
    [projectId, days]
  );

  const recent_events: RecentDocEvent[] = recentRows.map((r) => ({
    id: r.id,
    document_id: r.document_id,
    document_name: r.document_name,
    action: r.action,
    user_id: r.user_id ?? null,
    user_name: r.user_name ?? null,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  // ── 4. Aggregate totals from daily_activity (no LIMIT, covers all docs) ──
  const total_events = daily_activity.reduce((sum, d) => sum + d.total, 0);
  const total_agent_events = daily_activity.reduce((sum, d) => sum + d.agent_events, 0);
  const total_human_events = daily_activity.reduce((sum, d) => sum + d.human_events, 0);

  return { top_documents, daily_activity, recent_events, total_events, total_agent_events, total_human_events };
}

export type OrgProjectSummary = {
  project_id: string;
  project_name: string;
  project_status: string;
  project_created_at: string;
  total_tasks: number;
  done_tasks: number;
  failed_tasks: number;
  in_progress_tasks: number;
  last_activity: string | null;
};

/**
 * Returns org-wide project summaries ranked by most recent task activity.
 * Admins see all projects; regular users see only projects they are a member of.
 * Projects with no tasks are included with zero counts.
 */
export async function getOrgAnalytics(
  userId: string,
  isAdmin: boolean
): Promise<OrgProjectSummary[]> {
  const db = AppDataSource;

  const memberFilter = isAdmin
    ? ""
    : `AND EXISTS (
         SELECT 1 FROM project_members pm
         WHERE pm.project_id = proj.id
           AND pm.user_id = $1
       )`;

  const params = isAdmin ? [] : [userId];

  const rows: {
    project_id: string;
    project_name: string;
    project_status: string;
    project_created_at: Date;
    total_tasks: string;
    done_tasks: string;
    failed_tasks: string;
    in_progress_tasks: string;
    last_activity: Date | null;
  }[] = await db.query(
    `SELECT
       proj.id AS project_id,
       proj.name AS project_name,
       proj.status AS project_status,
       proj.created_at AS project_created_at,
       COUNT(t.id) AS total_tasks,
       COALESCE(SUM(CASE WHEN t.status = 'done'        THEN 1 ELSE 0 END), 0) AS done_tasks,
       COALESCE(SUM(CASE WHEN t.status = 'failed'      THEN 1 ELSE 0 END), 0) AS failed_tasks,
       COALESCE(SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_progress_tasks,
       MAX(t.updated_at) AS last_activity
     FROM projects proj
     LEFT JOIN plans pl ON pl.project_id = proj.id
     LEFT JOIN tasks t ON t.plan_id = pl.id AND t.deleted_at IS NULL
     WHERE proj.deleted_at IS NULL
       ${memberFilter}
     GROUP BY proj.id, proj.name, proj.status, proj.created_at
     ORDER BY MAX(t.updated_at) DESC NULLS LAST, proj.created_at DESC`,
    params
  );

  return rows.map((r) => ({
    project_id: r.project_id,
    project_name: r.project_name,
    project_status: r.project_status,
    project_created_at:
      r.project_created_at instanceof Date
        ? r.project_created_at.toISOString()
        : String(r.project_created_at),
    total_tasks: parseInt(r.total_tasks, 10),
    done_tasks: parseInt(r.done_tasks, 10),
    failed_tasks: parseInt(r.failed_tasks, 10),
    in_progress_tasks: parseInt(r.in_progress_tasks, 10),
    last_activity:
      r.last_activity instanceof Date
        ? r.last_activity.toISOString()
        : r.last_activity
        ? String(r.last_activity)
        : null,
  }));
}
