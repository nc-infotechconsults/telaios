from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from agent_service.api.chat import router as chat_router
from agent_service.api.documents import router as documents_router
from agent_service.api.document_copilot import router as document_copilot_router
from agent_service.api.health import router as health_router
from agent_service.api.plans import router as plans_router
from agent_service.config import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Module-level checkpointer — initialised in lifespan, used by planning_service.
plan_checkpointer = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global plan_checkpointer
    logger.info("Agent Service starting on port %d", config.PORT)

    # Set up LangGraph AsyncPostgresSaver for plan-level checkpointing.
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    async with AsyncPostgresSaver.from_conn_string(config.DATABASE_URL) as checkpointer:
        await checkpointer.setup()
        plan_checkpointer = checkpointer
        logger.info("LangGraph plan checkpointer ready.")

        from agent_service.services.planning_service import (
            set_checkpointer as set_plan_checkpointer,
        )

        set_plan_checkpointer(plan_checkpointer)
        logger.info("Planning service graph compiled.")

        yield

        logger.info("Agent Service shutting down.")
        from agent_service.core.agent_framework.event_bus import get_agent_event_bus

        await get_agent_event_bus().close()


MAX_BODY_SIZE = 50 * 1024 * 1024  # 50 MB


class LimitBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_BODY_SIZE:
            return JSONResponse(
                status_code=413, content={"error": "Request entity too large"}
            )
        return await call_next(request)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Telaios — Agent Service",
        version="1.0.0",
        description="LLM-driven planning, multi-agent execution, document processing, SSE streaming.",
        lifespan=lifespan,
    )

    app.add_middleware(LimitBodySizeMiddleware)

    # Restrict CORS to the configured frontend origin.
    # allow_credentials=True requires an explicit origin list (not wildcard).
    allowed_origins = [
        o.strip() for o in config.ALLOWED_ORIGINS.split(",") if o.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=bool(allowed_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(chat_router)
    app.include_router(documents_router)
    app.include_router(document_copilot_router)
    app.include_router(plans_router)

    return app


app = create_app()
