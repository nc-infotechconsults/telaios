from __future__ import annotations

import asyncio
import logging
from typing import Any

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

from .nodes import (
    confirm_node,
    interview_wait_node,
    prepare_node,
    react_planner_node,
    refine_node,
    review_wait_node,
    route_after_planner,
    route_after_review,
    save_draft_node,
)
from .state import PlannerState

logger = logging.getLogger(__name__)

_checkpointer: Any = None
_graph: Any = None


def _get_checkpointer() -> Any:
    return _checkpointer


def _build_graph() -> Any:
    checkpointer = _get_checkpointer()
    builder = StateGraph(PlannerState)

    builder.add_node("prepare_node", prepare_node)
    builder.add_node("interview_wait_node", interview_wait_node)
    builder.add_node("react_planner_node", react_planner_node)
    builder.add_node("save_draft_node", save_draft_node)
    builder.add_node("review_wait_node", review_wait_node)
    builder.add_node("confirm_node", confirm_node)
    builder.add_node("refine_node", refine_node)

    builder.add_edge(START, "prepare_node")
    builder.add_edge("prepare_node", "interview_wait_node")
    builder.add_edge("interview_wait_node", "react_planner_node")
    builder.add_conditional_edges(
        "react_planner_node",
        route_after_planner,
        {
            "save_draft_node": "save_draft_node",
            "interview_wait_node": "interview_wait_node",
        },
    )
    builder.add_edge("save_draft_node", "review_wait_node")
    builder.add_conditional_edges(
        "review_wait_node",
        route_after_review,
        {
            "confirm_node": "confirm_node",
            "refine_node": "refine_node",
        },
    )
    builder.add_edge("confirm_node", END)
    builder.add_edge("refine_node", "review_wait_node")

    return builder.compile(checkpointer=checkpointer)


def set_checkpointer(c: Any) -> None:
    global _checkpointer, _graph
    _checkpointer = c
    _graph = _build_graph()
    logger.info("Planning service: checkpointer set and graph compiled.")


async def init_session(plan_id: str) -> None:
    """
    Initialize a planning session for the given plan_id.

    If a LangGraph checkpoint already exists (browser reconnect), returns
    immediately — the graph is already paused at an interrupt.

    Otherwise, starts the graph in the background so the SSE event_stream
    queue is created before the greeting is broadcast.
    """
    checkpointer = _get_checkpointer()
    if checkpointer is None:
        logger.warning("init_session: checkpointer not ready for plan %s — skipping", plan_id)
        return

    graph = _graph
    if graph is None:
        logger.error("init_session: graph not built for plan %s", plan_id)
        return

    thread_config = {"configurable": {"thread_id": plan_id}}

    try:
        checkpoint = await checkpointer.aget(thread_config)
        if checkpoint is not None:
            logger.debug("init_session: checkpoint found for %s — reconnecting", plan_id)
            return
    except Exception as exc:
        logger.warning("init_session: could not check checkpoint for %s: %s", plan_id, exc)

    initial_state: PlannerState = {
        "messages": [],
        "plan_id": plan_id,
        "project_id": "",
        "plan_title": None,
        "project_context": None,
        "repos": [],
        "planner_agent": None,
        "phase": "interview",
        "plan_draft": None,
    }

    async def _run() -> None:
        try:
            await graph.ainvoke(initial_state, thread_config)
        except Exception as exc:
            logger.exception("init_session: graph error for plan %s: %s", plan_id, exc)

    asyncio.create_task(_run())


async def handle_user_message(plan_id: str, content: str) -> None:
    """
    Resume the planning graph with the user's message.

    Called as an asyncio background task from the chat API.
    """
    graph = _graph
    if graph is None:
        logger.error("handle_user_message: graph not built for plan %s", plan_id)
        return

    checkpointer = _get_checkpointer()
    thread_config = {"configurable": {"thread_id": plan_id}}

    # Guard: refuse to resume if no checkpoint exists. Without a checkpoint
    # LangGraph starts a fresh run with an empty state, which crashes prepare_node.
    if checkpointer is not None:
        try:
            checkpoint = await checkpointer.aget(thread_config)
            if checkpoint is None:
                logger.error(
                    "handle_user_message: no checkpoint for plan %s — session not "
                    "initialised (SSE stream may not have been opened yet)",
                    plan_id,
                )
                return
        except Exception as exc:
            logger.warning(
                "handle_user_message: could not verify checkpoint for %s: %s", plan_id, exc
            )

    try:
        await graph.ainvoke(Command(resume=content), thread_config)
    except Exception as exc:
        logger.exception("handle_user_message: graph error for plan %s: %s", plan_id, exc)
