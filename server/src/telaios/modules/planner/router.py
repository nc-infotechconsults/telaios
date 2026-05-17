"""
modules/planner/router.py — FastAPI router for the planner agent.

Endpoints:
  POST   /planner/threads                    Create a new planning thread
  POST   /planner/threads/{id}/messages      Send a turn; SSE stream
  POST   /planner/threads/{id}/confirm       Confirm the ready plan
  POST   /planner/threads/{id}/refuse        Refuse with feedback; SSE stream
  GET    /planner/threads/{id}               Get current thread state
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from telaios.auth.dependencies import CurrentPrincipal
from telaios.modules.planner.schemas import (
    CreateThreadResponse,
    PlannerThreadState,
    RefuseRequest,
    SendMessageRequest,
    SSEEvent,
)
from telaios.modules.planner.service import PlannerService

logger = logging.getLogger(__name__)

planner_router = APIRouter(prefix="/planner", tags=["planner"])


# ---------------------------------------------------------------------------
# Dependency: resolve PlannerService
# ---------------------------------------------------------------------------


async def get_planner_service() -> PlannerService:
    """FastAPI dependency that returns the production PlannerService singleton."""
    return await PlannerService.get_or_create()


# ---------------------------------------------------------------------------
# SSE formatting helper
# ---------------------------------------------------------------------------


def _sse_format(event: SSEEvent) -> str:
    """Format a single SSEEvent as a server-sent event string."""
    data_dict = event.data.model_dump()
    return f"event: {event.event}\ndata: {json.dumps(data_dict)}\n\n"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@planner_router.post("/threads", status_code=201, response_model=CreateThreadResponse)
async def create_thread(
    principal: CurrentPrincipal,
    service: PlannerService = Depends(get_planner_service),
) -> CreateThreadResponse:
    """Create a new planning thread and return its ID."""
    thread_id = await service.create_thread(principal.id)
    return CreateThreadResponse(thread_id=thread_id)


@planner_router.post("/threads/{thread_id}/messages")
async def send_message(
    thread_id: str,
    body: SendMessageRequest,
    principal: CurrentPrincipal,
    service: PlannerService = Depends(get_planner_service),
) -> StreamingResponse:
    """Send a message and receive SSE-streamed planner events."""

    async def event_generator() -> AsyncIterator[str]:
        try:
            stream = await service.send(thread_id, principal.id, body.content)
            async for sse_event in stream:
                yield _sse_format(sse_event)
        except Exception as exc:
            logger.exception("Error in planner SSE stream")
            error_payload = json.dumps({"message": str(exc)})
            yield f"event: error\ndata: {error_payload}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@planner_router.post("/threads/{thread_id}/confirm", status_code=204)
async def confirm_plan(
    thread_id: str,
    principal: CurrentPrincipal,
    service: PlannerService = Depends(get_planner_service),
) -> None:
    """Confirm the ready plan; transitions thread to ACCEPTED."""
    await service.confirm(thread_id, principal.id)


@planner_router.post("/threads/{thread_id}/refuse")
async def refuse_plan(
    thread_id: str,
    body: RefuseRequest,
    principal: CurrentPrincipal,
    service: PlannerService = Depends(get_planner_service),
) -> StreamingResponse:
    """Refuse the plan with feedback; streams re-planning SSE events."""

    async def event_generator() -> AsyncIterator[str]:
        try:
            stream = await service.refuse(thread_id, principal.id, body.reason)
            async for sse_event in stream:
                yield _sse_format(sse_event)
        except Exception as exc:
            logger.exception("Error in planner refuse SSE stream")
            error_payload = json.dumps({"message": str(exc)})
            yield f"event: error\ndata: {error_payload}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@planner_router.get("/threads/{thread_id}", response_model=PlannerThreadState)
async def get_thread_state(
    thread_id: str,
    principal: CurrentPrincipal,
    service: PlannerService = Depends(get_planner_service),
) -> PlannerThreadState:
    """Return the current state of a planning thread."""
    return await service.get_state(thread_id, principal.id)
