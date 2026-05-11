"""Analytics service — raw SQL queries.

Port of ``data-api/src/services/analytics.service.ts``.
All queries use SQLAlchemy ``text()`` to match the original SQL closely.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.analytics.schemas import (
    AgentStat,
    BlockedTask,
    DailyThroughput,
    DocDailyActivity,
    DocStat,
    DocumentAnalytics,
    OrgProjectSummary,
    ProjectAnalytics,
    RecentDocEvent,
    TaskStatusCounts,
)

_ALL_STATUSES = ("pending", "ready", "in_progress", "done", "failed", "cancelled", "skipped")
_BLOCKED_HOURS = 2

PERIOD_DAYS: dict[str, int] = {"7d": 7, "30d": 30, "90d": 90}


def parse_period_days(period: str | None) -> int:
    if period and period in PERIOD_DAYS:
        return PERIOD_DAYS[period]
    return 7


def _to_iso(val: object) -> str:
    if isinstance(val, datetime):
        if val.tzinfo is None:
            val = val.replace(tzinfo=UTC)
        return val.isoformat()
    return str(val)


class AnalyticsService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    # ── Project analytics ─────────────────────────────────────────────────────

    async def get_project_analytics(self, project_id: uuid.UUID, days: int) -> ProjectAnalytics:
        # 1. Task status counts (all-time)
        status_rows = await self._s.execute(
            text(
                """
                SELECT t.status, COUNT(*) AS count
                FROM tasks t
                JOIN plans p ON t.plan_id = p.id
                WHERE p.project_id = :project_id
                  AND t.deleted_at IS NULL
                GROUP BY t.status
                """
            ),
            {"project_id": str(project_id)},
        )
        counts_dict: dict[str, int] = {s: 0 for s in _ALL_STATUSES}
        for row in status_rows.mappings():
            counts_dict[row["status"]] = int(row["count"])
        status_counts = TaskStatusCounts(**counts_dict)

        # 2. Daily throughput (period-scoped, zero-filled)
        throughput_rows = await self._s.execute(
            text(
                """
                WITH date_series AS (
                  SELECT gs::date AS day
                  FROM generate_series(
                    (NOW() AT TIME ZONE 'UTC')::date - (:days - 1) * INTERVAL '1 day',
                    (NOW() AT TIME ZONE 'UTC')::date,
                    INTERVAL '1 day'
                  ) gs
                ),
                done_counts AS (
                  SELECT DATE(t.completed_at AT TIME ZONE 'UTC') AS day, COUNT(*) AS cnt
                  FROM tasks t
                  JOIN plans p ON t.plan_id = p.id
                  WHERE p.project_id = :project_id
                    AND t.status = 'done'
                    AND t.completed_at >= (NOW() AT TIME ZONE 'UTC')::date - (:days - 1) * INTERVAL '1 day'
                    AND t.deleted_at IS NULL
                  GROUP BY DATE(t.completed_at AT TIME ZONE 'UTC')
                ),
                created_counts AS (
                  SELECT DATE(t.created_at AT TIME ZONE 'UTC') AS day, COUNT(*) AS cnt
                  FROM tasks t
                  JOIN plans p ON t.plan_id = p.id
                  WHERE p.project_id = :project_id
                    AND t.created_at >= (NOW() AT TIME ZONE 'UTC')::date - (:days - 1) * INTERVAL '1 day'
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
                ORDER BY ds.day ASC
                """
            ),
            {"project_id": str(project_id), "days": days},
        )
        daily_throughput = [
            DailyThroughput(
                date=row["date"],
                done=int(row["done"]),
                created=int(row["created"]),
            )
            for row in throughput_rows.mappings()
        ]

        # 3. Agent stats (all-time)
        agent_rows = await self._s.execute(
            text(
                """
                SELECT
                  t.agent_profile_id,
                  COUNT(*) AS total,
                  SUM(CASE WHEN t.status = 'done'   THEN 1 ELSE 0 END) AS done,
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
                WHERE p.project_id = :project_id
                  AND t.deleted_at IS NULL
                GROUP BY t.agent_profile_id
                """
            ),
            {"project_id": str(project_id)},
        )
        agent_stats = [
            AgentStat(
                agent_profile_id=row["agent_profile_id"],
                total=int(row["total"]),
                done=int(row["done"]),
                failed=int(row["failed"]),
                avg_duration_minutes=(
                    round((float(row["avg_seconds"]) / 60) * 10) / 10
                    if row["avg_seconds"] is not None
                    else None
                ),
            )
            for row in agent_rows.mappings()
        ]

        # 4. Blocked tasks (in_progress > BLOCKED_HOURS)
        blocked_rows = await self._s.execute(
            text(
                """
                SELECT t.id, t.title, t.plan_id, t.started_at
                FROM tasks t
                JOIN plans p ON t.plan_id = p.id
                WHERE p.project_id = :project_id
                  AND t.status = 'in_progress'
                  AND t.started_at < NOW() - :blocked_hours * INTERVAL '1 hour'
                  AND t.deleted_at IS NULL
                ORDER BY t.started_at ASC
                """
            ),
            {"project_id": str(project_id), "blocked_hours": _BLOCKED_HOURS},
        )
        blocked_tasks = [
            BlockedTask(
                id=str(row["id"]),
                title=row["title"],
                plan_id=str(row["plan_id"]),
                started_at=_to_iso(row["started_at"]),
            )
            for row in blocked_rows.mappings()
        ]

        return ProjectAnalytics(
            task_status_counts=status_counts,
            daily_throughput=daily_throughput,
            agent_stats=agent_stats,
            blocked_tasks=blocked_tasks,
        )

    # ── Document analytics ────────────────────────────────────────────────────

    async def get_project_document_analytics(
        self, project_id: uuid.UUID, days: int
    ) -> DocumentAnalytics:
        # 1. Top documents
        top_rows = await self._s.execute(
            text(
                """
                SELECT
                  d.id AS document_id,
                  d.name AS document_name,
                  d.file_type,
                  COUNT(da.id) AS total_events,
                  SUM(CASE WHEN da.action = 'viewed'    THEN 1 ELSE 0 END) AS viewed,
                  SUM(CASE WHEN da.action = 'edited'    THEN 1 ELSE 0 END) AS edited,
                  SUM(CASE WHEN da.action = 'commented' THEN 1 ELSE 0 END) AS commented,
                  SUM(CASE WHEN da.user_id IS NULL       THEN 1 ELSE 0 END) AS agent_events,
                  SUM(CASE WHEN da.user_id IS NOT NULL   THEN 1 ELSE 0 END) AS human_events
                FROM document_activities da
                JOIN documents d ON d.id = da.document_id
                WHERE d.project_id = :project_id
                  AND d.deleted_at IS NULL
                  AND da.created_at >= (NOW() AT TIME ZONE 'UTC')::date - (:days - 1) * INTERVAL '1 day'
                GROUP BY d.id, d.name, d.file_type
                ORDER BY total_events DESC
                LIMIT 10
                """
            ),
            {"project_id": str(project_id), "days": days},
        )
        top_documents = [
            DocStat(
                document_id=str(row["document_id"]),
                document_name=row["document_name"],
                file_type=row["file_type"],
                total_events=int(row["total_events"]),
                viewed=int(row["viewed"]),
                edited=int(row["edited"]),
                commented=int(row["commented"]),
                agent_events=int(row["agent_events"]),
                human_events=int(row["human_events"]),
            )
            for row in top_rows.mappings()
        ]

        # 2. Daily activity (zero-filled)
        daily_rows = await self._s.execute(
            text(
                """
                WITH date_series AS (
                  SELECT gs::date AS day
                  FROM generate_series(
                    (NOW() AT TIME ZONE 'UTC')::date - (:days - 1) * INTERVAL '1 day',
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
                  WHERE d.project_id = :project_id
                    AND d.deleted_at IS NULL
                    AND da.created_at >= (NOW() AT TIME ZONE 'UTC')::date - (:days - 1) * INTERVAL '1 day'
                  GROUP BY DATE(da.created_at AT TIME ZONE 'UTC')
                )
                SELECT
                  TO_CHAR(ds.day, 'YYYY-MM-DD') AS date,
                  COALESCE(a.total, 0) AS total,
                  COALESCE(a.agent_events, 0) AS agent_events,
                  COALESCE(a.human_events, 0) AS human_events
                FROM date_series ds
                LEFT JOIN activity a ON a.day = ds.day
                ORDER BY ds.day ASC
                """
            ),
            {"project_id": str(project_id), "days": days},
        )
        daily_activity = [
            DocDailyActivity(
                date=row["date"],
                total=int(row["total"]),
                agent_events=int(row["agent_events"]),
                human_events=int(row["human_events"]),
            )
            for row in daily_rows.mappings()
        ]

        # 3. Recent events (last 15)
        recent_rows = await self._s.execute(
            text(
                """
                SELECT
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
                WHERE d.project_id = :project_id
                  AND d.deleted_at IS NULL
                  AND da.created_at >= (NOW() AT TIME ZONE 'UTC')::date - (:days - 1) * INTERVAL '1 day'
                ORDER BY da.created_at DESC
                LIMIT 15
                """
            ),
            {"project_id": str(project_id), "days": days},
        )
        recent_events = [
            RecentDocEvent(
                id=str(row["id"]),
                document_id=str(row["document_id"]),
                document_name=row["document_name"],
                action=row["action"],
                user_id=str(row["user_id"]) if row["user_id"] else None,
                user_name=row["user_name"],
                created_at=_to_iso(row["created_at"]),
            )
            for row in recent_rows.mappings()
        ]

        # 4. Totals from daily_activity
        total_events = sum(d.total for d in daily_activity)
        total_agent_events = sum(d.agent_events for d in daily_activity)
        total_human_events = sum(d.human_events for d in daily_activity)

        return DocumentAnalytics(
            top_documents=top_documents,
            daily_activity=daily_activity,
            recent_events=recent_events,
            total_events=total_events,
            total_agent_events=total_agent_events,
            total_human_events=total_human_events,
        )

    # ── Org analytics ─────────────────────────────────────────────────────────

    async def get_org_analytics(
        self,
        user_id: uuid.UUID,
        is_admin: bool,
    ) -> list[OrgProjectSummary]:
        if is_admin:
            sql = text(
                """
                SELECT
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
                GROUP BY proj.id, proj.name, proj.status, proj.created_at
                ORDER BY MAX(t.updated_at) DESC NULLS LAST, proj.created_at DESC
                """
            )
            params: dict[str, object] = {}
        else:
            sql = text(
                """
                SELECT
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
                  AND EXISTS (
                    SELECT 1 FROM project_members pm
                    WHERE pm.project_id = proj.id AND pm.user_id = :user_id
                  )
                GROUP BY proj.id, proj.name, proj.status, proj.created_at
                ORDER BY MAX(t.updated_at) DESC NULLS LAST, proj.created_at DESC
                """
            )
            params = {"user_id": str(user_id)}

        rows = await self._s.execute(sql, params)
        return [
            OrgProjectSummary(
                project_id=str(row["project_id"]),
                project_name=row["project_name"],
                project_status=row["project_status"],
                project_created_at=_to_iso(row["project_created_at"]),
                total_tasks=int(row["total_tasks"]),
                done_tasks=int(row["done_tasks"]),
                failed_tasks=int(row["failed_tasks"]),
                in_progress_tasks=int(row["in_progress_tasks"]),
                last_activity=_to_iso(row["last_activity"]) if row["last_activity"] else None,
            )
            for row in rows.mappings()
        ]


__all__ = ["AnalyticsService", "parse_period_days"]
