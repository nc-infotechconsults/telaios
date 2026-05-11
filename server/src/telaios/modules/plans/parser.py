"""
domain/planning/parser.py  (ported into modules/plans/)
-------------------------
Parse plan text into structured format.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ── Data models ───────────────────────────────────────────────────────────────


class PlanTask(BaseModel):
    """A single task in a parsed plan."""

    id: str
    description: str
    depends_on: list[str] = []
    agent: str = "default"


class ParsedPlan(BaseModel):
    """A structured plan with ordered tasks."""

    tasks: list[PlanTask]


# ── Public API ────────────────────────────────────────────────────────────────


def parse_planner_response(text: str) -> dict[str, Any] | None:
    """Extract the JSON payload from a planner's response text."""
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        parsed = json.loads(m.group(0))
        if not isinstance(parsed.get("message"), str):
            return None
        return {
            "message": parsed["message"],
            "ready_for_plan": bool(parsed.get("ready_for_plan", False)),
            "plan": parsed.get("plan"),
        }
    except Exception:
        return None


def parse_plan_from_json(plan_data: dict[str, Any]) -> ParsedPlan:
    """Parse a plan dict into a ParsedPlan."""
    tasks_raw = plan_data.get("tasks", [])
    tasks: list[PlanTask] = []

    for i, t in enumerate(tasks_raw):
        task_id = t.get("id", f"task-{i}")
        tasks.append(
            PlanTask(
                id=task_id,
                description=t.get("description", t.get("title", "")),
                depends_on=t.get("depends_on", []),
                agent=t.get("agent", "default"),
            )
        )

    return ParsedPlan(tasks=tasks)


async def parse_plan(
    plan_text: str,
    llm: Any = None,
) -> ParsedPlan:
    """Parse raw plan text into a structured ParsedPlan."""
    response_data = parse_planner_response(plan_text)
    if response_data and response_data.get("plan"):
        return parse_plan_from_json(response_data["plan"])

    if llm is not None:
        from telaios.modules.plans.prompts import compose_parser_prompt

        try:
            from telaios.core.types import Message, MessageRole

            prompt = compose_parser_prompt(plan_text)
            response = await llm.invoke(
                [
                    Message(
                        role=MessageRole.SYSTEM,
                        content="You are a JSON parser. Return only valid JSON.",
                    ),
                    Message(role=MessageRole.HUMAN, content=prompt),
                ]
            )
            content = response.content if hasattr(response, "content") else str(response)
            data = json.loads(content)
            if "tasks" in data:
                return ParsedPlan(**data)
        except Exception as exc:
            logger.warning("LLM re-parse failed: %s", exc)

    try:
        data = json.loads(plan_text)
        if "tasks" in data:
            return ParsedPlan(**data)
    except Exception:
        pass

    logger.warning("Could not parse plan text, returning empty plan")
    return ParsedPlan(tasks=[])
