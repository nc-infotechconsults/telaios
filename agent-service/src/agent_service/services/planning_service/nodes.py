from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.prebuilt import create_react_agent
from langgraph.types import Command, interrupt

from agent_service.services import data_client, sse_manager

from .llm_factory import _build_llm
from .persistence import (
    _build_plan_payload,
    _parse_planner_response,
    _save_draft_tasks,
    _stream_message_chunks,
)
from .prompts import _build_greeting, _build_interview_system, _build_review_system
from .state import PlannedTask, PlannerState
from .tools import _build_repo_tools

logger = logging.getLogger(__name__)


async def prepare_node(state: PlannerState) -> Dict[str, Any]:
    """Load plan context from DB (once) and send greeting on first visit."""
    plan_id = state.get("plan_id")
    if not plan_id:
        logger.error("prepare_node: plan_id missing from state — graph started without initial state")
        return {}

    if state.get("project_id"):
        # Already initialized — reconnect, nothing to do.
        return {}

    try:
        plan = await data_client.get_plan(plan_id)
    except Exception as exc:
        logger.error("prepare_node: could not load plan %s: %s", plan_id, exc)
        return {}

    project_id = plan["project_id"]
    plan_title = plan.get("title")

    from .context import _gather_project_context

    repos, project_context, project_agents_raw = await asyncio.gather(
        data_client.get_project_repositories(project_id),
        _gather_project_context(project_id, plan_id),
        data_client.get_project_agents_raw(project_id),
    )

    planner_agent = next(
        (pa for pa in project_agents_raw if pa.get("role") == "planner"), None
    )

    greeting = _build_greeting(plan_title)

    asyncio.create_task(
        data_client.save_message({
            "project_id": project_id,
            "plan_id": plan_id,
            "role": "assistant",
            "content": greeting,
        })
    )

    await asyncio.sleep(0.15)
    sse_manager.broadcast(plan_id, {"type": "chat_token", "content": greeting})
    sse_manager.broadcast(plan_id, {"type": "chat_end"})

    return {
        "project_id": project_id,
        "plan_title": plan_title,
        "repos": repos,
        "project_context": project_context,
        "planner_agent": planner_agent,
        "phase": "interview",
        "messages": [AIMessage(content=greeting)],
    }


async def interview_wait_node(state: PlannerState) -> Dict[str, Any]:
    """Interrupt: wait for user message during interview phase."""
    plan_id = state["plan_id"]
    project_id = state["project_id"]

    user_content: str = interrupt("Waiting for user message")
    trimmed = user_content.strip()

    asyncio.create_task(
        data_client.save_message({
            "project_id": project_id,
            "plan_id": plan_id,
            "role": "user",
            "content": trimmed,
        })
    )
    sse_manager.broadcast(plan_id, {"type": "chat_thinking"})

    return {"messages": [HumanMessage(content=trimmed)]}


async def react_planner_node(state: PlannerState) -> Dict[str, Any]:
    """Run a create_react_agent sub-execution for one planner turn.

    Uses no checkpointer (ephemeral) — the outer graph already persists state
    via AsyncPostgresSaver.  Only the new messages produced during this turn
    are returned so the outer add_messages reducer appends them correctly.
    """
    plan_id = state["plan_id"]
    project_id = state["project_id"]

    settings = await data_client.get_settings()
    planner_agent = state.get("planner_agent")
    repos = state.get("repos", [])
    tools = _build_repo_tools(repos, project_id)

    llm = _build_llm(settings, planner_agent)
    system_content = _build_interview_system(state, planner_agent, tools)

    sub_graph = create_react_agent(llm, tools, prompt=system_content)

    old_count = len(state["messages"])
    # Pass the accumulated conversation to the sub-agent.
    result = await sub_graph.ainvoke({"messages": list(state["messages"])})

    new_messages = result["messages"][old_count:]

    # Broadcast SSE events for tool use and the final text reply.
    await _broadcast_new_messages(plan_id, project_id, new_messages)

    return {"messages": new_messages}


async def _broadcast_new_messages(
    plan_id: str,
    project_id: str,
    messages: List[Any],
) -> None:
    """Emit SSE events and persist assistant messages for a list of new messages."""
    for msg in messages:
        if isinstance(msg, AIMessage):
            tool_calls = getattr(msg, "tool_calls", []) or []
            if tool_calls:
                for tc in tool_calls:
                    sse_manager.broadcast(plan_id, {
                        "type": "chat_tool_use",
                        "tool": tc["name"],
                        "input": tc.get("args", {}),
                    })
            else:
                text = msg.content if isinstance(msg.content, str) else json.dumps(msg.content)
                parsed = _parse_planner_response(text)
                msg_text = parsed["message"] if parsed else text

                asyncio.create_task(
                    data_client.save_message({
                        "project_id": project_id,
                        "plan_id": plan_id,
                        "role": "assistant",
                        "content": msg_text,
                    })
                )
                await _stream_message_chunks(plan_id, msg_text)

                if not (parsed and parsed.get("ready_for_plan") and parsed.get("plan")):
                    sse_manager.broadcast(plan_id, {"type": "chat_end"})


async def save_draft_node(state: PlannerState) -> Dict[str, Any]:
    """Parse plan from the last AI message, save draft tasks, and broadcast plan_draft."""
    plan_id = state["plan_id"]

    last_ai = next(
        (m for m in reversed(state["messages"]) if isinstance(m, AIMessage) and not getattr(m, "tool_calls", None)),
        None,
    )

    saved_tasks: List[Dict[str, Any]] = []

    if last_ai:
        text = last_ai.content if isinstance(last_ai.content, str) else ""
        parsed = _parse_planner_response(text)
        if parsed and parsed.get("plan"):
            planned_tasks = [PlannedTask(t) for t in parsed["plan"].get("tasks", [])]
            saved_tasks = await _save_draft_tasks(plan_id, planned_tasks)

    sse_manager.broadcast(plan_id, {
        "type": "plan_draft",
        "plan": _build_plan_payload(plan_id, state, saved_tasks),
    })
    sse_manager.broadcast(plan_id, {"type": "chat_end"})

    return {
        "phase": "review",
        "plan_draft": {"tasks": saved_tasks},
    }


async def review_wait_node(state: PlannerState) -> Dict[str, Any]:
    """Interrupt: wait for user message during review phase."""
    plan_id = state["plan_id"]
    project_id = state["project_id"]

    user_content: str = interrupt("Waiting for review response")
    trimmed = user_content.strip()

    asyncio.create_task(
        data_client.save_message({
            "project_id": project_id,
            "plan_id": plan_id,
            "role": "user",
            "content": trimmed,
        })
    )
    sse_manager.broadcast(plan_id, {"type": "chat_thinking"})

    return {"messages": [HumanMessage(content=trimmed)]}


async def confirm_node(state: PlannerState) -> Dict[str, Any]:
    """Confirm plan, mark root tasks as ready, and trigger execution."""
    from agent_service.services.execution_service import start_execution

    plan_id = state["plan_id"]
    project_id = state["project_id"]

    plan = await data_client.update_plan(
        plan_id,
        {"status": "confirmed", "confirmed_at": datetime.now(timezone.utc).isoformat()},
    )

    tasks = await data_client.get_plan_tasks(plan_id)
    await asyncio.gather(
        *[
            data_client.update_task(t["id"], {"status": "ready"})
            for t in tasks
            if not t.get("depends_on_task_ids")
        ]
    )

    confirm_msg = "✅ Plan confirmed and saved! Execution will begin shortly."
    asyncio.create_task(
        data_client.save_message({
            "project_id": project_id,
            "plan_id": plan_id,
            "role": "assistant",
            "content": confirm_msg,
        })
    )
    await _stream_message_chunks(plan_id, confirm_msg)
    sse_manager.broadcast(plan_id, {"type": "plan_confirmed", "plan_id": plan["id"]})

    asyncio.create_task(start_execution(project_id, plan["id"]))

    return {"messages": [AIMessage(content=confirm_msg)]}


async def refine_node(state: PlannerState) -> Dict[str, Any]:
    """Generate an updated plan based on user feedback, save and broadcast."""
    plan_id = state["plan_id"]
    project_id = state["project_id"]

    settings = await data_client.get_settings()
    planner_agent = state.get("planner_agent")

    llm = _build_llm(settings, planner_agent)
    system_content = _build_review_system(state, planner_agent)
    messages = [SystemMessage(content=system_content)] + list(state["messages"])

    response = await llm.ainvoke(messages)
    text = response.content if isinstance(response.content, str) else json.dumps(response.content)

    parsed = _parse_planner_response(text)

    if not parsed or not parsed.get("plan"):
        err = "Sorry, I couldn't parse the updated plan. Please try describing your changes again."
        sse_manager.broadcast(plan_id, {"type": "chat_token", "content": err})
        sse_manager.broadcast(plan_id, {"type": "chat_end"})
        asyncio.create_task(
            data_client.save_message({
                "project_id": project_id,
                "plan_id": plan_id,
                "role": "assistant",
                "content": err,
            })
        )
        return {"messages": [AIMessage(content=err)]}

    planned_tasks = [PlannedTask(t) for t in parsed["plan"].get("tasks", [])]
    saved_tasks = await _save_draft_tasks(plan_id, planned_tasks)
    msg_text = parsed["message"]

    asyncio.create_task(
        data_client.save_message({
            "project_id": project_id,
            "plan_id": plan_id,
            "role": "assistant",
            "content": msg_text,
        })
    )
    await _stream_message_chunks(plan_id, msg_text)

    sse_manager.broadcast(plan_id, {
        "type": "plan_draft",
        "plan": _build_plan_payload(plan_id, state, saved_tasks),
    })
    sse_manager.broadcast(plan_id, {"type": "chat_end"})

    return {
        "messages": [AIMessage(content=msg_text)],
        "plan_draft": {"tasks": saved_tasks},
    }


# ── Routing ───────────────────────────────────────────────────────────────────


def route_after_planner(state: PlannerState) -> str:
    last = state["messages"][-1]

    # react_planner_node handles its own tool loop — we only see the final AIMessage.
    # If it contains a ready_for_plan signal, go to save_draft; otherwise loop back.
    text = last.content if isinstance(last.content, str) else ""
    parsed = _parse_planner_response(text)
    if parsed and parsed.get("ready_for_plan") and parsed.get("plan"):
        return "save_draft_node"

    return "interview_wait_node"


def route_after_review(state: PlannerState) -> str:
    last = state["messages"][-1]
    if isinstance(last, HumanMessage):
        lower = last.content.lower().strip()
        if (
            lower in ("confirm", "yes")
            or lower.startswith("confirm")
            or "looks good" in lower
            or "start execution" in lower
            or "approve" in lower
        ):
            return "confirm_node"
    return "refine_node"
