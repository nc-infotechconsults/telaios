from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


def create_app() -> FastAPI:
    app = FastAPI(
        title="SWE AI Platform — Agent Service",
        version="1.0.0",
        description="LLM-driven planning, multi-agent execution, document processing, SSE streaming.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(chat_router)
    app.include_router(documents_router)
    app.include_router(document_copilot_router)
    app.include_router(plans_router)

    @app.on_event("startup")
    async def startup() -> None:
        logger.info("Agent Service starting on port %d", config.PORT)

    @app.on_event("shutdown")
    async def shutdown() -> None:
        logger.info("Agent Service shutting down.")
        from agent_service.core.agent_framework.event_bus import get_agent_event_bus
        await get_agent_event_bus().close()

    return app


app = create_app()
