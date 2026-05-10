"""
domain/planning/prompts.py
--------------------------
Single source for all planning prompts.

Consolidates the 5× prompt variants from the old planning service into
two composable functions: ``compose_planning_prompt`` for interview/review
and ``compose_parser_prompt`` for structured plan extraction.

Usage::

    from domain.planning.prompts import compose_planning_prompt

    prompt = compose_planning_prompt(
        user_request="Build a REST API for user management",
        context={"project_name": "my-app", "repos": [...]},
    )
"""

from __future__ import annotations

from typing import Any

# ── Constants ─────────────────────────────────────────────────────────────────

BASE_SYSTEM = (
    "You are an expert software project planning assistant. "
    "Your job is to interview the user to understand what they want to build, "
    "then produce a detailed, dependency-ordered execution plan."
)

TASK_SCHEMA = (
    '{"title":"string","description":"string","type":"code|test|review|general",'
    '"execution_order":0,"depends_on_task_indices":[],'
    '"repository_ids":["repo_uuid"]}'
)

STRUCTURED_OUTPUT_INSTRUCTIONS = (
    "\n\nCRITICAL: Always respond with ONLY valid JSON — no markdown, no extra text:\n"
    '{"message":"<natural language reply>","ready_for_plan":false,"plan":null}\n\n'
    "When you have gathered enough information to build a complete plan, set ready_for_plan to true "
    "and include the full plan in the same response:\n"
    f'{{"message":"<brief plan summary for the user>","ready_for_plan":true,"plan":{{"tasks":[{TASK_SCHEMA}]}}}}\n\n'
    "Plan rules:\n"
    "- depends_on_task_indices are 0-based indices into the tasks array\n"
    "- execution_order starts at 0 and increases"
)

PLAN_PARSER_PROMPT = (
    "Parse the following plan JSON response into a clean structured format.\n"
    "Return ONLY valid JSON with this schema:\n"
    '{"tasks": ['
    '{"id": "string", "description": "string", "depends_on": ["task_id"], "agent": "agent_name"}'
    "]}\n\n"
    "Source JSON:\n"
)


# ── Public API ────────────────────────────────────────────────────────────────


def compose_greeting(plan_title: str | None = None) -> str:
    """Build the initial greeting message for a planning session."""
    if plan_title:
        return (
            f"Hello! I'm your AI planning assistant. I'll help you build a detailed execution plan for **{plan_title}**.\n\n"
            "Describe what you want to achieve, any constraints, and technical requirements."
        )
    return (
        "Hello! I'm your AI planning assistant. I'll help you break down "
        "this feature into an actionable execution plan.\n\n"
        "Tell me: **what are you building?** You can describe it at any level of detail — we'll refine together."
    )


def compose_planning_prompt(
    user_request: str,
    context: dict[str, Any] | None = None,
    phase: str = "interview",
    plan_draft: dict[str, Any] | None = None,
    system_prompt_override: str | None = None,
    system_prompt_mode: str = "append",
) -> str:
    """
    Compose the full planning prompt from user request and optional context.

    Replaces the old ``_build_interview_system`` and ``_build_review_system``
    with a single composable function.

    Args:
        user_request: The user's planning request or message.
        context: Optional dict with keys like ``project_name``, ``repos``,
                 ``project_context``, ``plan_title``.
        phase: ``"interview"`` or ``"review"``.
        plan_draft: Current plan draft (used in review phase).
        system_prompt_override: Optional custom system prompt.
        system_prompt_mode: ``"append"`` (default) or ``"override"``.

    Returns:
        The composed system prompt string.
    """
    ctx = context or {}

    if system_prompt_override and system_prompt_mode == "override":
        return system_prompt_override + STRUCTURED_OUTPUT_INSTRUCTIONS

    parts: list[str] = [BASE_SYSTEM]

    # Project context block
    if ctx.get("project_context"):
        parts.append("\n\n## Project Context\n" + _format_project_context(ctx["project_context"], ctx.get("plan_title")))

    # Repos
    repos = ctx.get("repos", [])
    if repos:
        repos_text = "\n".join(
            f"- id:{r.get('id', 'unknown')} name:{r.get('name', 'unknown')} url:{r.get('remote_url', '(local)')}"
            for r in repos
        )
        parts.append(f"\n\nProject repositories (use these IDs in task repository_ids):\n{repos_text}")

    # Tools note
    if ctx.get("has_tools"):
        parts.append(
            "\n\nYou have tools to explore the repository filesystem (list_directory, read_file, search_code). "
            "Use them proactively to understand the codebase structure, dependencies, and conventions BEFORE asking the user questions. "
            "Only ask the user what you cannot discover from the code."
        )

    # Phase-specific content
    if phase == "interview":
        parts.append(
            "\n\nUse the project context above to ask targeted follow-up questions and avoid duplicating existing work. "
            "Ask ONE focused follow-up question at a time. "
            "Set ready_for_plan to true only when you have enough information for a complete plan."
        )
    elif phase == "review":
        parts.append("\n\nThe user wants to revise the current plan.")
        if plan_draft:
            import json

            parts.append(f"\n\nCurrent plan:\n{json.dumps(plan_draft, indent=2, default=str)}")
        parts.append("\n\nApply the user's requested changes and return the updated plan. Always set ready_for_plan to true.")

    parts.append(STRUCTURED_OUTPUT_INSTRUCTIONS)

    if system_prompt_override and system_prompt_mode == "append":
        parts.append("\n\n" + system_prompt_override)

    return "".join(parts)


def compose_parser_prompt(plan_text: str) -> str:
    """Compose the prompt for parsing plan text into structured format."""
    return f"{PLAN_PARSER_PROMPT}\n\n{plan_text}"


# ── Internal helpers ──────────────────────────────────────────────────────────


def _format_project_context(ctx: dict[str, Any], plan_title: str | None = None) -> str:
    """Format a project context dict into a readable markdown string."""
    lines: list[str] = []
    lines.append(f"Project: {ctx.get('name', 'Unknown')}")
    if ctx.get("description"):
        lines.append(f"Description: {ctx['description']}")

    if ctx.get("existingPlans"):
        lines.append("\nExisting plans for this project (do NOT duplicate their scope):")
        for p in ctx["existingPlans"]:
            lines.append(f'  - "{p.get("title") or "(untitled)"}" [{p.get("status", "unknown")}]')

    if plan_title:
        lines.append(f'\nThis plan is titled: "{plan_title}"')

    if ctx.get("repoStructures"):
        lines.append("\nRepository file structure(s):")
        for r in ctx["repoStructures"]:
            lines.append(f"\n### {r.get('name', 'unknown')}\n```\n{r.get('structure', '(not scanned)')}\n```")

    docs = ctx.get("documents", [])
    if docs:
        lines.append(
            "\nProject documents (already uploaded and indexed — "
            "reference them in task descriptions when relevant):"
        )
        for d in docs:
            size_kb = round(d.get("size_bytes", 0) / 1024, 1)
            lines.append(f"  - {d.get('name', '')} ({d.get('file_type', 'unknown')}, {size_kb} KB)")

    return "\n".join(lines)
