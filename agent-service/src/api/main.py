"""
api/main.py
-----------
FastAPI application entrypoint.

Imports only from ``domain/``, ``tools/``, ``infra/``, and ``api/``.

Usage::

    uvicorn api.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from api.routers.chat import router as chat_router
from api.routers.document_copilot import router as document_copilot_router
from api.routers.documents import router as documents_router
from api.routers.health import router as health_router
from api.routers.plans import router as plans_router
from api.routers.skills import router as skills_router
from api.routers.v2 import router as v2_router
from infra.settings import config

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
    from core.providers.langchain.checkpoint import PostgresCheckpointer
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    async with AsyncPostgresSaver.from_conn_string(config.DATABASE_URL) as checkpointer:
        await checkpointer.setup()
        plan_checkpointer = PostgresCheckpointer(checkpointer)
        logger.info("LangGraph plan checkpointer ready.")

        from domain.planning import set_checkpointer as set_plan_checkpointer

        set_plan_checkpointer(plan_checkpointer)
        logger.info("Planning service ready.")

        from domain.agents.document_chat import set_checkpointer as set_doc_checkpointer

        set_doc_checkpointer(plan_checkpointer)
        logger.info("Document copilot v2 ready.")

        # ── Load skills from filesystem ───────────────────────────────────
        if config.SKILLS_AUTOLOAD:
            from tools.skill.loader import SkillDirectoryScanner
            from tools.skill.registry import SkillRegistry
            from tools.skill.validator import validate_skill_manifest

            skill_registry = SkillRegistry()

            directories = [config.SKILLS_DIRECTORY]
            if config.SKILLS_EXTRA_PATHS:
                directories.extend(
                    p.strip() for p in config.SKILLS_EXTRA_PATHS.split(",") if p.strip()
                )

            total_loaded = 0
            for directory in directories:
                if not Path(directory).exists():
                    logger.warning("Skills directory not found: %s", directory)
                    continue

                try:
                    manifests = SkillDirectoryScanner.scan(directory)
                    for manifest in manifests:
                        validation = validate_skill_manifest(manifest)
                        if validation.is_valid:
                            skill_registry.add(manifest)
                            total_loaded += 1
                        else:
                            logger.warning(
                                "Skill '%s' validation failed: %s",
                                manifest.name,
                                validation.errors,
                            )
                except Exception as exc:
                    logger.error("Failed to load skills from %s: %s", directory, exc)

            logger.info("Loaded %d skills from %d directories", total_loaded, len(directories))
            app.state.skill_registry = skill_registry

        yield

        logger.info("Agent Service shutting down.")
        from infra.events import get_agent_event_bus

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
        title="TelaiOS — Agent Service",
        version="1.0.0",
        description="LLM-driven planning, multi-agent execution, document processing, SSE streaming.",
        lifespan=lifespan,
    )

    app.add_middleware(LimitBodySizeMiddleware)

    # Restrict CORS to the configured frontend origin.
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
    app.include_router(skills_router)
    app.include_router(v2_router)

    return app


app = create_app()
