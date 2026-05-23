"""
modules/planner/service.py — PlannerService: core use-case orchestrator.

Used by both the FastAPI router (HTTP/SSE) and the TUI (in-process).

Design decisions:
  - Lazy singleton: ``AsyncPostgresSaver`` context manager is kept alive at
    module level to avoid reconnecting on every request.  A double-checked
    ``asyncio.Lock`` guards the initialisation path.
  - ``send()`` and ``refuse()`` stream ``SSEEvent`` objects; the router wraps
    them in ``text/event-stream``.
  - ``send()`` inspects the checkpoint snapshot to detect whether the graph is
    paused (interrupted) and routes input accordingly:
      * Paused → ``Command(resume=content)``
      * Existing thread, not paused → append ``HumanMessage``
      * New thread → full initial state dict
  - After ``astream_events`` exhausts, we call ``aget_state()`` to detect an
    interrupt and emit a ``pause`` SSE event followed by ``done``.
  - Thread ownership is enforced at the application level here; the
    checkpointer has no concept of user_id.

DSN note: ``AsyncPostgresSaver`` uses psycopg (v3), not asyncpg.  Strip the
``+asyncpg`` driver suffix from ``DATABASE_URL`` before passing to psycopg.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.types import Command

from telaios.core.agents.planner.agent import SYSTEM_PROMPT, build_planner_graph
from telaios.modules.planner.schemas import (
    ChunkEventData,
    DoneEventData,
    ErrorEventData,
    PausePlanReadyEventData,
    PauseQuestionsEventData,
    PlannerThreadState,
    PlanningSessionStatus,
    PlanResponseFormat,
    SSEEvent,
    ToolCallEventData,
    ToolResultEventData,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level singleton state (lazy-initialised)
# ---------------------------------------------------------------------------
_lock: asyncio.Lock | None = None
_service_instance: PlannerService | None = None


def _get_lock() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


# ---------------------------------------------------------------------------
# SSE event helpers
# ---------------------------------------------------------------------------


def _make_chunk(content: str) -> SSEEvent:
    return SSEEvent(event="chunk", data=ChunkEventData(content=content))


def _make_tool_call(name: str, args: dict[str, Any]) -> SSEEvent:
    return SSEEvent(event="tool_call", data=ToolCallEventData(name=name, args=args))


def _make_tool_result(name: str, content: str) -> SSEEvent:
    return SSEEvent(event="tool_result", data=ToolResultEventData(name=name, content=content))


def _make_done(status: PlanningSessionStatus | str) -> SSEEvent:
    return SSEEvent(event="done", data=DoneEventData(status=str(status)))


def _make_error(message: str) -> SSEEvent:
    return SSEEvent(event="error", data=ErrorEventData(message=message))


def _make_pause_from_snapshot(snapshot_values: dict[str, Any]) -> SSEEvent | None:
    """Build a pause SSE event from checkpointed state values."""
    plan: PlanResponseFormat | None = snapshot_values.get("plan")
    if plan is None:
        return None
    if plan.questions:
        return SSEEvent(
            event="pause",
            data=PauseQuestionsEventData(
                type="questions",
                questions=plan.questions,
            ),
        )
    if plan.tasks:
        return SSEEvent(
            event="pause",
            data=PausePlanReadyEventData(
                type="plan_ready",
                tasks=plan.tasks,
                response=plan.response,
            ),
        )
    return None


# ---------------------------------------------------------------------------
# PlannerService
# ---------------------------------------------------------------------------


class PlannerService:
    """Central use-case service for the planner agent.

    Shared by the FastAPI router and the TUI.  Instantiate with
    :meth:`create` to supply retrievers and checkpointer; or use
    :meth:`get_or_create` for the production lazy singleton.
    """

    def __init__(self, graph: Any) -> None:
        self._graph = graph

    # -- Factory methods -------------------------------------------------------

    @classmethod
    def create(
        cls,
        *,
        llm: Any,
        tools: list[Any],
        checkpointer: Any,
    ) -> PlannerService:
        """Build a ``PlannerService`` with the given LLM, tools, and checkpointer."""
        graph = build_planner_graph(llm, tools, checkpointer)
        return cls(graph)

    @classmethod
    async def get_or_create(cls) -> PlannerService:
        """Return (or lazily build) the production singleton.

        Uses ``AsyncPostgresSaver`` for Postgres-backed persistence.
        Reads ``LLM_*`` and ``DATABASE_URL`` from application settings.
        """
        global _service_instance

        if _service_instance is not None:
            return _service_instance

        async with _get_lock():
            if _service_instance is not None:
                return _service_instance  # type: ignore[unreachable]

            from langchain.chat_models import init_chat_model
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

            from telaios.config.settings import settings
            from telaios.core.agents.planner.tools import make_tools
            from telaios.core.knowledge.factory import KnowledgePipelineFactory

            # LLM -----------------------------------------------------------
            llm_kwargs: dict[str, Any] = {
                "model_provider": settings.LLM_PROVIDER,
                "model": settings.LLM_MODEL,
            }
            if settings.LLM_API_KEY:
                llm_kwargs["api_key"] = settings.LLM_API_KEY
            if settings.LLM_BASE_URL:
                llm_kwargs["base_url"] = settings.LLM_BASE_URL
            llm = init_chat_model(**llm_kwargs)

            # Knowledge pipeline — retrieval (no project_id at singleton level;
            # project context is passed per-query inside the tool closures)
            pipeline = await KnowledgePipelineFactory.get()
            docs_retriever = pipeline.get_retriever("documents", project_id=None)
            repos_retriever = pipeline.get_retriever("repositories", project_id=None)
            await pipeline.warm_up()

            tools_list = make_tools(docs_retriever, repos_retriever)

            # Checkpointer --------------------------------------------------
            # AsyncPostgresSaver uses psycopg3; strip asyncpg driver suffix.
            # from_conn_string returns a context manager; enter it manually
            # so the connection pool stays alive for the lifetime of the singleton.
            dsn = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
            saver_ctx = AsyncPostgresSaver.from_conn_string(dsn)
            saver: AsyncPostgresSaver = await saver_ctx.__aenter__()
            await saver.setup()

            _service_instance = cls.create(llm=llm, tools=tools_list, checkpointer=saver)
            logger.info("PlannerService singleton initialised")
            return _service_instance

    # -- Public API ------------------------------------------------------------

    async def create_thread(self, user_id: str) -> str:
        """Generate and register a new thread_id.

        The thread is not persisted until the first message is sent.
        """
        return str(uuid.uuid4())

    async def send(
        self,
        thread_id: str,
        user_id: str,
        content: str,
    ) -> AsyncIterator[SSEEvent]:
        """Run the graph for one human turn; yield SSE events."""
        return self._stream(thread_id, user_id, content)

    async def confirm(self, thread_id: str, user_id: str) -> None:
        """Resume a paused graph with 'confirm'; transitions to ACCEPTED."""
        config = {"configurable": {"thread_id": thread_id}}
        # Consume stream to completion
        async for _ in self._graph.astream(
            Command(resume="confirm"), config=config, stream_mode="values"
        ):
            pass

    async def refuse(
        self,
        thread_id: str,
        user_id: str,
        reason: str,
    ) -> AsyncIterator[SSEEvent]:
        """Resume a paused graph with refuse feedback; yield SSE events."""
        return self._stream_resume(thread_id, Command(resume={"type": "refuse", "reason": reason}))

    async def get_state(self, thread_id: str, user_id: str) -> PlannerThreadState:
        """Read current thread state from the checkpointer."""
        config = {"configurable": {"thread_id": thread_id}}
        snapshot = await self._graph.aget_state(config)
        values = snapshot.values if snapshot else {}
        return PlannerThreadState(
            thread_id=thread_id,
            user_id=user_id,
            status=values.get("status", PlanningSessionStatus.PENDING),
            plan=values.get("plan"),
        )

    # -- Internal streaming helpers -------------------------------------------

    async def _stream(self, thread_id: str, user_id: str, content: str) -> AsyncIterator[SSEEvent]:
        config = {"configurable": {"thread_id": thread_id}}

        # Determine graph input based on thread state.
        snapshot = await self._graph.aget_state(config)
        values: dict[str, Any] = snapshot.values if snapshot else {}

        is_paused = bool(snapshot and snapshot.tasks)

        if is_paused:
            # Graph is waiting at interrupt() — resume with user reply.
            graph_input: Any = Command(resume=content)
        elif values:
            # Existing thread, not paused — append new human turn.
            graph_input = {"messages": [HumanMessage(content=content)]}
        else:
            # Brand-new thread.
            graph_input = {
                "messages": [
                    SystemMessage(content=SYSTEM_PROMPT),
                    HumanMessage(content=content),
                ],
                "status": PlanningSessionStatus.PENDING,
                "plan": None,
            }

        async for event in self._emit_events(graph_input, config):
            yield event

    async def _stream_resume(
        self, thread_id: str, command: Command[Any]
    ) -> AsyncIterator[SSEEvent]:
        config = {"configurable": {"thread_id": thread_id}}
        async for event in self._emit_events(command, config):
            yield event

    async def _emit_events(
        self, graph_input: Any, config: dict[str, Any]
    ) -> AsyncIterator[SSEEvent]:
        """Run the graph and translate LangGraph events to SSE events."""
        try:
            async for lg_event in self._graph.astream_events(
                graph_input, config=config, version="v2"
            ):
                event_name: str = lg_event.get("event", "")
                data = lg_event.get("data", {})

                if event_name == "on_chat_model_stream":
                    chunk = data.get("chunk")
                    if chunk is not None:
                        text = getattr(chunk, "content", "")
                        if isinstance(text, str) and text:
                            yield _make_chunk(text)

                elif event_name == "on_tool_start":
                    tool_name = lg_event.get("name", "")
                    tool_args = data.get("input", {}) or {}
                    if isinstance(tool_args, str):
                        try:
                            tool_args = json.loads(tool_args)
                        except Exception:
                            tool_args = {"query": tool_args}
                    yield _make_tool_call(tool_name, tool_args)

                elif event_name == "on_tool_end":
                    tool_name = lg_event.get("name", "")
                    output = data.get("output", "")
                    yield _make_tool_result(tool_name, str(output))

        except Exception as exc:
            logger.exception("Error streaming planner graph")
            yield _make_error(str(exc))
            return

        # After streaming: check for interrupt / final status.
        try:
            final_snapshot = await self._graph.aget_state(config)
            final_values: dict[str, Any] = final_snapshot.values if final_snapshot else {}

            if final_snapshot and final_snapshot.tasks:
                # Graph is paused — emit pause event.
                pause_event = _make_pause_from_snapshot(final_values)
                if pause_event is not None:
                    yield pause_event

            final_status = final_values.get("status", PlanningSessionStatus.PENDING)
            yield _make_done(final_status)

        except Exception as exc:
            logger.exception("Error reading final planner state")
            yield _make_error(f"Failed to read final state: {exc}")


__all__ = ["PlannerService"]
