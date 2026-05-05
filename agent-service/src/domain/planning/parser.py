"""
domain/planning/parser.py
-------------------------
Parse plan text into structured format.

Uses the LLM to extract structured task data from the planner's JSON response.

Usage::

    from domain.planning.parser import parse_plan, ParsedPlan

    plan = await parse_plan(plan_json_text, llm)
    for task in plan.tasks:
        print(task.id, task.description)
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
    """
    Extract the JSON payload from a planner's response text.

    The planner returns JSON embedded in its response. This function
    finds and parses it.

    Returns:
        A dict with keys ``message``, ``ready_for_plan``, ``plan`` — or
        ``None`` if parsing fails.
    """
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
    """
    Parse a plan dict (from the planner's JSON response) into a ParsedPlan.

    Args:
        plan_data: The ``plan`` portion of the planner response, containing
                   a ``tasks`` list.

    Returns:
        A ParsedPlan with structured tasks.
    """
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
    """
    Parse raw plan text into a structured ParsedPlan.

    If *llm* is provided, uses it to re-parse ambiguous input. Otherwise
    falls back to direct JSON extraction.

    Args:
        plan_text: The raw plan text (JSON string from the planner).
        llm: Optional LLM instance for re-parsing.

    Returns:
        A ParsedPlan with structured tasks.
    """
    # Try direct JSON extraction first
    response_data = parse_planner_response(plan_text)
    if response_data and response_data.get("plan"):
        return parse_plan_from_json(response_data["plan"])

    # If we have an LLM, try re-parsing
    if llm is not None:
        from domain.planning.prompts import compose_parser_prompt

        try:
            from core.types import Message, MessageRole

            prompt = compose_parser_prompt(plan_text)
            response = await llm.invoke([
                Message(role=MessageRole.SYSTEM, content="You are a JSON parser. Return only valid JSON."),
                Message(role=MessageRole.HUMAN, content=prompt),
            ])
            content = response.content if hasattr(response, "content") else str(response)
            data = json.loads(content)
            if "tasks" in data:
                return ParsedPlan(**data)
        except Exception as exc:
            logger.warning("LLM re-parse failed: %s", exc)

    # Last resort: try parsing the raw text as JSON
    try:
        data = json.loads(plan_text)
        if "tasks" in data:
            return ParsedPlan(**data)
    except Exception:
        pass

    # Return empty plan if nothing works
    logger.warning("Could not parse plan text, returning empty plan")
    return ParsedPlan(tasks=[])
