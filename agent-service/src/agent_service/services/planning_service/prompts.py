from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from langchain_core.tools import StructuredTool

from .context import _build_project_context_text
from .state import PlannerState

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


def _build_greeting(title: Optional[str]) -> str:
    if title:
        return (
            f"Hello! I'm your AI planning assistant. I'll help you build a detailed execution plan for **{title}**.\n\n"
            "Describe what you want to achieve, any constraints, and technical requirements."
        )
    return (
        "Hello! I'm your AI planning assistant. I'll help you break down "
        "this feature into an actionable execution plan.\n\n"
        "Tell me: **what are you building?** You can describe it at any level of detail — we'll refine together."
    )


def _build_interview_system(
    state: PlannerState,
    planner_agent: Optional[Dict[str, Any]],
    tools: List[StructuredTool],
) -> str:
    repos = state.get("repos", [])
    repos_text = (
        "\n".join(f"- id:{r['id']} name:{r['name']} url:{r.get('remote_url', '(local)')}" for r in repos)
        or "None configured yet."
    )

    context_block = ""
    if state.get("project_context"):
        context_block = "\n\n## Project Context\n" + _build_project_context_text(
            state["project_context"], state.get("plan_title")
        )

    tools_note = (
        "\n\nYou have tools to explore the repository filesystem (list_directory, read_file, search_code). "
        "Use them proactively to understand the codebase structure, dependencies, and conventions BEFORE asking the user questions. "
        "Only ask the user what you cannot discover from the code."
        if tools
        else ""
    )

    base_content = (
        BASE_SYSTEM
        + context_block
        + f"\n\nProject repositories (use these IDs in task repository_ids):\n{repos_text}"
        + tools_note
        + "\n\nUse the project context above to ask targeted follow-up questions and avoid duplicating existing work. "
        "Ask ONE focused follow-up question at a time. "
        "Set ready_for_plan to true only when you have enough information for a complete plan."
        + STRUCTURED_OUTPUT_INSTRUCTIONS
    )

    if planner_agent and planner_agent.get("system_prompt"):
        custom = planner_agent["system_prompt"]
        mode = planner_agent.get("system_prompt_mode") or "override"
        if mode == "override":
            return custom + STRUCTURED_OUTPUT_INSTRUCTIONS
        return base_content + "\n\n" + custom

    return base_content


def _build_review_system(
    state: PlannerState, planner_agent: Optional[Dict[str, Any]]
) -> str:
    repos = state.get("repos", [])
    repos_text = "\n".join(f"- id:{r['id']} name:{r['name']}" for r in repos) or "none"

    context_block = ""
    if state.get("project_context"):
        context_block = "\n\n## Project Context\n" + _build_project_context_text(
            state["project_context"], state.get("plan_title")
        )

    base_system = (
        BASE_SYSTEM
        + context_block
        + "\n\nThe user wants to revise the current plan."
        + f"\n\nCurrent plan:\n{json.dumps(state.get('plan_draft'), indent=2, default=str)}"
        + f"\n\nAvailable repositories (use these IDs in task repository_ids):\n{repos_text}"
        + "\n\nApply the user's requested changes and return the updated plan. Always set ready_for_plan to true."
        + STRUCTURED_OUTPUT_INSTRUCTIONS
    )

    if planner_agent and planner_agent.get("system_prompt"):
        custom = planner_agent["system_prompt"]
        mode = planner_agent.get("system_prompt_mode") or "override"
        if mode == "override":
            return custom + STRUCTURED_OUTPUT_INSTRUCTIONS
        return base_system + "\n\n" + custom

    return base_system
