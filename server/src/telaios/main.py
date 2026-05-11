"""FastAPI application entrypoint.

``create_app()`` accepts an optional ``modules`` iterable to support slim
deployments (see SPEC-MIGRATION.md §4); module loading is wired in Phase 4+.

Phase 1 wires foundational concerns:
* structured logging (``configure_logging``)
* uniform error envelope (``install_exception_handlers``)
* CORS from settings
* lifespan teardown for DB engine and Redis client

Phase 4 adds:
* ``auth_router``     — POST /auth/register, /auth/login, GET /auth/me
* ``users_router``    — admin CRUD on /users
* ``project_workspaces_router`` — project-scoped workspace CRUD
* ``workspace_router``          — item-scoped workspace CRUD
* ``set_user_loader`` registration so JWTs are validated against the DB

Phase 5 adds:
* ``projects_router`` / ``members_router`` / ``agents_router`` — project CRUD
* ``repositories_router`` — repository CRUD + test endpoint
* ``environments_router`` — environment CRUD + helm + resource inspection
* ``settings_router``     — admin app settings
* ``library_router``      — library agents / MCPs / skills
* ``agent_profiles_router`` — agent profile CRUD
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Iterable
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from telaios.auth.dependencies import set_user_loader
from telaios.config.logging import configure_logging
from telaios.config.settings import get_settings
from telaios.db.session import dispose_engine
from telaios.infra.redis import close_redis
from telaios.modules.agent_profiles import agent_profiles_router
from telaios.modules.analytics import analytics_router
from telaios.modules.chat import chat_router
from telaios.modules.containers import containers_router
from telaios.modules.docker_shell import docker_shell_router
from telaios.modules.document_copilot import copilot_router
from telaios.modules.document_extraction import extraction_router, jobs_router
from telaios.modules.documents import (
    document_activities_router,
    document_comments_router,
    document_favorites_router,
    document_router,
    document_tags_router,
    document_versions_router,
    project_activities_router,
    project_documents_router,
    project_favorites_router,
    project_folders_router,
    project_tags_router,
    project_templates_router,
    templates_router,
)
from telaios.modules.environments import environments_router
from telaios.modules.health import health_router
from telaios.modules.internal import internal_router
from telaios.modules.library import library_router
from telaios.modules.messages import messages_router
from telaios.modules.plans import plan_router, project_plans_router
from telaios.modules.projects import agents_router, members_router, projects_router
from telaios.modules.repositories import repositories_router
from telaios.modules.settings import settings_router
from telaios.modules.skills import skills_router
from telaios.modules.tasks import plan_tasks_router, task_router
from telaios.modules.users import UserService, auth_router, users_router
from telaios.modules.workspaces import project_workspaces_router, workspace_router
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

    # ─── Routers ──────────────────────────────────────────────────────────
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(project_workspaces_router)
    app.include_router(workspace_router)
    app.include_router(projects_router)
    app.include_router(members_router)
    app.include_router(agents_router)
    app.include_router(repositories_router)
    app.include_router(environments_router)
    app.include_router(settings_router)
    app.include_router(library_router)
    app.include_router(agent_profiles_router)
    app.include_router(project_plans_router)
    app.include_router(plan_router)
    app.include_router(plan_tasks_router)
    app.include_router(task_router)
    app.include_router(messages_router)
    app.include_router(chat_router)
    app.include_router(project_documents_router)
    app.include_router(document_router)
    app.include_router(project_folders_router)
    app.include_router(project_tags_router)
    app.include_router(document_tags_router)
    app.include_router(document_versions_router)
    app.include_router(document_comments_router)
    app.include_router(document_activities_router)
    app.include_router(project_activities_router)
    app.include_router(project_favorites_router)
    app.include_router(document_favorites_router)
    app.include_router(templates_router)
    app.include_router(project_templates_router)
    app.include_router(extraction_router)
    app.include_router(jobs_router)
    app.include_router(copilot_router)
    app.include_router(skills_router)
    # ─── Phase 8 routers ──────────────────────────────────────────────────
    app.include_router(health_router)
    app.include_router(analytics_router)
    app.include_router(internal_router)
    app.include_router(containers_router)
    app.include_router(docker_shell_router)

    # ─── Auth user-loader ─────────────────────────────────────────────────
    # Enables DB-backed validation of JWT subjects (is_active check, fresh
    # role reload).  Tests can override this by calling set_user_loader(None).
    set_user_loader(UserService.load_principal)

    _ = modules

    return app


# Default ASGI app for `uvicorn telaios.main:app`.
app = create_app()
