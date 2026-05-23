"""Domain events — Pydantic models for significant business occurrences.

Events are immutable facts about something that happened in the domain.
Handlers subscribe to events and execute side effects (notifications,
audit logs, external service calls) without coupling the core logic.

Usage::

    from telaios.domain.events import EventBus, TaskCompleted

    bus = EventBus()
    bus.subscribe(TaskCompleted, on_task_completed)
    await bus.publish(TaskCompleted(task_id=..., plan_id=...))
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from telaios.domain.values import PlanId, ProjectId, TaskId, UserId

# ── Event base ────────────────────────────────────────────────────────────────


class DomainEvent(BaseModel):
    """Base class for all domain events."""

    model_config = ConfigDict(frozen=True)

    event_id: str | None = None
    occurred_at: datetime | None = None


# ── Task events ───────────────────────────────────────────────────────────────


class TaskCreated(DomainEvent):
    task_id: TaskId
    plan_id: PlanId
    title: str


class TaskStatusChanged(DomainEvent):
    task_id: TaskId
    plan_id: PlanId
    previous_status: str
    new_status: str


class TaskCompleted(DomainEvent):
    task_id: TaskId
    plan_id: PlanId
    result: str | None = None


class TaskFailed(DomainEvent):
    task_id: TaskId
    plan_id: PlanId
    reason: str | None = None


# ── Plan events ───────────────────────────────────────────────────────────────


class PlanConfirmed(DomainEvent):
    plan_id: PlanId
    project_id: ProjectId


class PlanCompleted(DomainEvent):
    plan_id: PlanId
    project_id: ProjectId


class PlanFailed(DomainEvent):
    plan_id: PlanId
    project_id: ProjectId
    reason: str | None = None


# ── Project events ────────────────────────────────────────────────────────────


class ProjectCreated(DomainEvent):
    project_id: ProjectId
    name: str


class MemberAdded(DomainEvent):
    project_id: ProjectId
    user_id: UserId


class MemberRemoved(DomainEvent):
    project_id: ProjectId
    user_id: UserId


# ── Event bus ─────────────────────────────────────────────────────────────────

EventHandler = Callable[[DomainEvent], Awaitable[None]]


class EventBus:
    """Simple in-process event bus with type-based subscription.

    For production use, replace with a distributed bus (Redis pub/sub, Kafka).
    """

    def __init__(self) -> None:
        self._handlers: dict[type[DomainEvent], list[EventHandler]] = {}

    def subscribe(
        self, event_type: type[DomainEvent], handler: EventHandler
    ) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    async def publish(self, event: DomainEvent) -> None:
        handlers = self._handlers.get(type(event), [])
        for handler in handlers:
            await handler(event)

    def clear(self) -> None:
        self._handlers.clear()
