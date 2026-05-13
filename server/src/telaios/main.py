"""FastAPI application entrypoint.

``create_app()`` accepts an optional ``modules`` iterable to support slim
deployments (see SPEC-MIGRATION.md §4).  When ``modules`` is ``None`` the
function reads the ``TELAIOS_MODULES`` environment variable (CSV of module
names); if that variable is also empty every registered module is loaded.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Iterable
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from telaios.auth.dependencies import set_user_loader
from telaios.config.logging import configure_logging
from telaios.config.settings import get_settings
from telaios.db.session import dispose_engine
from telaios.infra.redis import close_redis
from telaios.infra.s3 import ensure_bucket_exists
from telaios.modules.agent_profiles import agent_profiles_router
from telaios.modules.analytics import analytics_router
from telaios.modules.chat import chat_router
from telaios.modules.containers import containers_router
from telaios.modules.design_chat import design_sessions_router, project_design_sessions_router
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
from telaios.modules.settings import llm_router, settings_router
from telaios.modules.skills import skills_router
from telaios.modules.tasks import plan_tasks_router, task_router
from telaios.modules.users import UserService, auth_router, users_router
from telaios.modules.workspaces import project_workspaces_router, workspace_router
from telaios.utils.errors import install_exception_handlers

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module registry
# ---------------------------------------------------------------------------
# Maps a stable module name to the list of APIRouters it contributes.
# ``create_app()`` iterates this dict in insertion order so the URL ordering
# in the OpenAPI spec is stable.
# ---------------------------------------------------------------------------

_MODULES: dict[str, list[APIRouter]] = {
    "users": [auth_router, users_router],
    "workspaces": [project_workspaces_router, workspace_router],
    "projects": [projects_router, members_router, agents_router],
    "repositories": [repositories_router],
    "environments": [environments_router],
    "settings": [settings_router, llm_router],
    "library": [library_router],
    "agent_profiles": [agent_profiles_router],
    "plans": [project_plans_router, plan_router],
    "tasks": [plan_tasks_router, task_router],
    "messages": [messages_router],
    "chat": [chat_router],
    "design_chat": [project_design_sessions_router, design_sessions_router],
    "documents": [
        project_documents_router,
        document_router,
        project_folders_router,
        project_tags_router,
        document_tags_router,
        document_versions_router,
        document_comments_router,
        document_activities_router,
        project_activities_router,
        project_favorites_router,
        document_favorites_router,
        templates_router,
        project_templates_router,
    ],
    "document_extraction": [extraction_router, jobs_router],
    "document_copilot": [copilot_router],
    "skills": [skills_router],
    "health": [health_router],
    "analytics": [analytics_router],
    "internal": [internal_router],
    "containers": [containers_router],
    "docker_shell": [docker_shell_router],
}


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    logger.info("telaios starting")
    await ensure_bucket_exists()
    try:
        yield
    finally:
        await close_redis()
        await dispose_engine()
        logger.info("telaios stopped")


def create_app(modules: Iterable[str] | None = None) -> FastAPI:
    """Build the FastAPI app.

    Args:
        modules: Optional list of module names to mount.  ``None`` means
            "read from the ``TELAIOS_MODULES`` env var; if that is empty,
            load all modules".  Slim deploys can restrict the loaded set by
            passing a subset or by setting the env var.

    Raises:
        ValueError: If any requested module name is not in the registry.
    """
    settings = get_settings()

    # Resolve the module set -------------------------------------------------
    if modules is None:
        env_value = settings.TELAIOS_MODULES.strip()
        if env_value:
            modules = [m.strip() for m in env_value.split(",") if m.strip()]
        else:
            modules = list(_MODULES.keys())

    selected: list[str] = list(modules)

    unknown = set(selected) - _MODULES.keys()
    if unknown:
        raise ValueError(f"Unknown module(s) requested: {sorted(unknown)}")

    logger.debug("loading modules: %s", selected)

    # Build the app ----------------------------------------------------------
    app = FastAPI(
        title="telaios",
        version="0.1.0",
        description="Telaios monolith API.",
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

    # Mount routers for each selected module in registry order ---------------
    for name in _MODULES:
        if name in selected:
            for router in _MODULES[name]:
                app.include_router(router)

    # Auth user-loader -------------------------------------------------------
    # Enables DB-backed validation of JWT subjects (is_active check, fresh
    # role reload).  Tests can override this by calling set_user_loader(None).
    set_user_loader(UserService.load_principal)

    return app


# Default ASGI app for `uvicorn telaios.main:app`.
app = create_app()
