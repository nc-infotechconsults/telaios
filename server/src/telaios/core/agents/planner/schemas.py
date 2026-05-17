"""
core/agents/planner/schemas.py — Domain types for the planner agent.

These are pure domain types used by the LangGraph graph (structured output,
state, node logic).  HTTP/SSE schemas live in modules/planner/schemas.py.
"""

from __future__ import annotations

import uuid
from enum import StrEnum

from pydantic import BaseModel, Field


class PlanStatus(StrEnum):
    PENDING = "pending"
    INTERVIEWING = "interviewing"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    ACCEPTED = "accepted"
    REFUSED = "refused"


class PlanTask(BaseModel):
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique identifier for the task",
    )
    name: str = Field(description="Name of the task")
    short_description: str = Field(description="Short description of the task")
    details: str = Field(
        description=(
            "Detailed description of the task, with specification about the execution, "
            "condition and all information required to fully accomplish it."
        )
    )
    dependencies: list[str] = Field(
        default_factory=list,
        description="List of task IDs that this task depends on",
    )
    category: str = Field(description="Category of the task")


class Question(BaseModel):
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique identifier for the question",
    )
    question: str = Field(description="The question to be asked to the user")
    type: str = Field(description="The type of question, e.g., 'yes_no', 'free_form', 'choice'")
    options: list[str] | None = Field(
        default=None,
        description="List of options for 'choice' type questions",
    )


class PlanResponseFormat(BaseModel):
    """Structured output from the planner LLM.

    Non-recursive so ``with_structured_output`` can generate a valid JSON schema.
    """

    tasks: list[PlanTask] | None = Field(
        default=None,
        description="List of tasks in the plan (present when plan is ready)",
    )
    questions: list[Question] = Field(
        default_factory=list,
        description="Clarifying questions for the user (present when more info needed)",
    )
    response: str | None = Field(
        default=None,
        description="Natural language response or explanation to the user",
    )


__all__ = [
    "PlanResponseFormat",
    "PlanStatus",
    "PlanTask",
    "Question",
]
