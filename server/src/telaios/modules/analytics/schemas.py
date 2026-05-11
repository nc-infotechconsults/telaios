"""Analytics Pydantic schemas."""

from __future__ import annotations

from pydantic import BaseModel


class TaskStatusCounts(BaseModel):
    pending: int = 0
    ready: int = 0
    in_progress: int = 0
    done: int = 0
    failed: int = 0
    cancelled: int = 0
    skipped: int = 0


class DailyThroughput(BaseModel):
    date: str
    done: int
    created: int


class AgentStat(BaseModel):
    agent_profile_id: str | None
    total: int
    done: int
    failed: int
    avg_duration_minutes: float | None


class BlockedTask(BaseModel):
    id: str
    title: str
    plan_id: str
    started_at: str


class ProjectAnalytics(BaseModel):
    task_status_counts: TaskStatusCounts
    daily_throughput: list[DailyThroughput]
    agent_stats: list[AgentStat]
    blocked_tasks: list[BlockedTask]


class DocStat(BaseModel):
    document_id: str
    document_name: str
    file_type: str
    total_events: int
    viewed: int
    edited: int
    commented: int
    agent_events: int
    human_events: int


class DocDailyActivity(BaseModel):
    date: str
    total: int
    agent_events: int
    human_events: int


class RecentDocEvent(BaseModel):
    id: str
    document_id: str
    document_name: str
    action: str
    user_id: str | None
    user_name: str | None
    created_at: str


class DocumentAnalytics(BaseModel):
    top_documents: list[DocStat]
    daily_activity: list[DocDailyActivity]
    recent_events: list[RecentDocEvent]
    total_events: int
    total_agent_events: int
    total_human_events: int


class OrgProjectSummary(BaseModel):
    project_id: str
    project_name: str
    project_status: str
    project_created_at: str
    total_tasks: int
    done_tasks: int
    failed_tasks: int
    in_progress_tasks: int
    last_activity: str | None


__all__ = [
    "AgentStat",
    "BlockedTask",
    "DailyThroughput",
    "DocDailyActivity",
    "DocStat",
    "DocumentAnalytics",
    "OrgProjectSummary",
    "ProjectAnalytics",
    "RecentDocEvent",
    "TaskStatusCounts",
]
