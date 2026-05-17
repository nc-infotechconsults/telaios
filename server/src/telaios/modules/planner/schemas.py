"""
modules/planner/schemas.py — HTTP, SSE, and thread-state schemas for the planner API.

Domain types (PlanStatus, PlanTask, Question, PlanResponseFormat) are defined in
``telaios.core.agents.planner.schemas`` and re-exported here for backwards
compatibility with any code that imports them from this module.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from telaios.core.agents.planner.schemas import PlanResponseFormat as PlanResponseFormat
from telaios.core.agents.planner.schemas import PlanStatus as PlanStatus
from telaios.core.agents.planner.schemas import PlanTask as PlanTask
from telaios.core.agents.planner.schemas import Question as Question

# ---------------------------------------------------------------------------
# HTTP request / response schemas
# ---------------------------------------------------------------------------


class CreateThreadResponse(BaseModel):
    thread_id: str


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1)


class RefuseRequest(BaseModel):
    reason: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# SSE event data schemas
# ---------------------------------------------------------------------------


class ChunkEventData(BaseModel):
    content: str


class ToolCallEventData(BaseModel):
    name: str
    args: dict[str, Any] = {}


class ToolResultEventData(BaseModel):
    name: str
    content: str


class PauseQuestionsEventData(BaseModel):
    type: Literal["questions"] = "questions"
    questions: list[Question]


class PausePlanReadyEventData(BaseModel):
    type: Literal["plan_ready"] = "plan_ready"
    tasks: list[PlanTask]
    response: str | None = None


class DoneEventData(BaseModel):
    status: str


class ErrorEventData(BaseModel):
    message: str


# Typed SSE event — callers yield these; the router serialises them to SSE.
class SSEEvent(BaseModel):
    event: str
    data: (
        ChunkEventData
        | ToolCallEventData
        | ToolResultEventData
        | PauseQuestionsEventData
        | PausePlanReadyEventData
        | DoneEventData
        | ErrorEventData
    )


# ---------------------------------------------------------------------------
# Thread state (GET /planner/threads/{id})
# ---------------------------------------------------------------------------


class PlannerThreadState(BaseModel):
    thread_id: str
    user_id: str
    status: PlanStatus
    plan: PlanResponseFormat | None = None


__all__ = [
    "ChunkEventData",
    "CreateThreadResponse",
    "DoneEventData",
    "ErrorEventData",
    "PausePlanReadyEventData",
    "PauseQuestionsEventData",
    "PlanResponseFormat",
    "PlanStatus",
    "PlanTask",
    "PlannerThreadState",
    "Question",
    "RefuseRequest",
    "SSEEvent",
    "SendMessageRequest",
    "ToolCallEventData",
    "ToolResultEventData",
]
