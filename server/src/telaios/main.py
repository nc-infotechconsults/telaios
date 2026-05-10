"""FastAPI application entrypoint.

``create_app()`` accepts an optional ``modules`` iterable to support slim
deployments (see SPEC-MIGRATION.md §4); module loading is wired in Phase 4+.

Phase 1 wires foundational concerns:
* structured logging (``configure_logging``)
* uniform error envelope (``install_exception_handlers``)
* CORS from settings
* lifespan teardown for DB engine and Redis client
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Iterable
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from telaios.config.logging import configure_logging
from telaios.config.settings import get_settings
from telaios.db.session import dispose_engine
from telaios.infra.redis import close_redis
from telaios.utils.errors import install_exception_handlers

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    logger.info("telaios starting")
    try:
        yield
    finally:
        await close_redis()
        await dispose_engine()
        logger.info("telaios stopped")


def create_app(modules: Iterable[str] | None = None) -> FastAPI:
    """Build the FastAPI app.

    Args:
        modules: Optional list of module names to mount. ``None`` means "all
            modules registered in the module registry". Slim deploys can pass
            a subset (also configurable via ``TELAIOS_MODULES`` env var).
    """
    settings = get_settings()

    app = FastAPI(
        title="telaios",
        version="0.1.0",
        description=("Telaios monolith API. See SPEC-MIGRATION.md for the migration design."),
        lifespan=_lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    install_exception_handlers(app)

    # Module loading lands in Phase 4+.
    _ = modules

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        """Liveness probe (placeholder until modules.health lands in Phase 8)."""
        return {"status": "ok"}

    return app


# Default ASGI app for `uvicorn telaios.main:app`.
app = create_app()
