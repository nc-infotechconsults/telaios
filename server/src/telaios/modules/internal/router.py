"""Internal API router — endpoints consumed by agent-service, never exposed to users.

All routes require the internal API key header: ``X-Internal-Api-Key``.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.internal_api_key import is_internal_api_key
from telaios.db.session import get_session
from telaios.modules.documents.chunks.service import ChunkService
from telaios.modules.documents.service import DocumentService
from telaios.modules.internal.schemas import (
    BulkArtifactsBody,
    CancelPlanTasksResponse,
    PatchDocumentStatusBody,
    SearchChunksBody,
    SkipDependentResponse,
    StoreChunksBody,
    StoreChunksResponse,
    UpdatePlanStatusBody,
    UpdatePlanStatusFailed,
    UpdateUserRoleBody,
)
from telaios.modules.library.service import LibraryAgentService
from telaios.modules.plans.schemas import PlanPatch, PlanRead
from telaios.modules.plans.service import PlanService
from telaios.modules.projects.agents.service import AgentService
from telaios.modules.tasks.artifacts.schemas import ArtifactCreate, ArtifactRead
from telaios.modules.tasks.artifacts.service import ArtifactService
from telaios.modules.tasks.service import TaskService
from telaios.utils.errors import NotFoundError

internal_router = APIRouter(prefix="/internal", tags=["internal"])


def _require_internal_key(
    x_internal_api_key: Annotated[str | None, Header()] = None,
) -> None:
    if not x_internal_api_key or not is_internal_api_key(x_internal_api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


_Guard = Depends(_require_internal_key)


# ── Document status ────────────────────────────────────────────────────────────


@internal_router.patch(
    "/documents/{document_id}/status",
    dependencies=[_Guard],
)
async def update_document_status(
    document_id: uuid.UUID,
    body: PatchDocumentStatusBody,
    session: AsyncSession = Depends(get_session),
) -> Any:
    svc = DocumentService(session)
    from telaios.modules.documents.schemas import DocumentPatch

    patch = DocumentPatch(status=body.status, error_message=body.error_message)
    return await svc.patch(document_id, patch)


# ── Chunk storage ──────────────────────────────────────────────────────────────


@internal_router.post(
    "/documents/{document_id}/chunks",
    response_model=StoreChunksResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_Guard],
)
async def store_document_chunks(
    document_id: uuid.UUID,
    body: StoreChunksBody,
    session: AsyncSession = Depends(get_session),
) -> StoreChunksResponse:
    svc = ChunkService(session)
    chunks_data = [c.model_dump() for c in body.chunks]
    stored = await svc.store(document_id, chunks_data)
    return StoreChunksResponse(stored=stored)


# ── Similarity search ──────────────────────────────────────────────────────────


@internal_router.post(
    "/documents/chunks/search",
    dependencies=[_Guard],
)
async def search_document_chunks(
    body: SearchChunksBody,
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    svc = ChunkService(session)
    return await svc.search_by_embedding(body.project_id, body.embedding, body.limit)


# ── Plan lifecycle ─────────────────────────────────────────────────────────────


@internal_router.patch(
    "/plans/{plan_id}/status",
    response_model=PlanRead,
    dependencies=[_Guard],
)
async def update_plan_status(
    plan_id: uuid.UUID,
    body: UpdatePlanStatusBody,
    session: AsyncSession = Depends(get_session),
) -> PlanRead:
    svc = PlanService(session)
    patch_data: dict[str, Any] = {"status": body.status}
    if isinstance(body, UpdatePlanStatusFailed) and body.failure_reason is not None:
        patch_data["failure_reason"] = body.failure_reason
    try:
        return await svc.patch(plan_id, PlanPatch(**patch_data))
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


# ── Task propagation ───────────────────────────────────────────────────────────


@internal_router.post(
    "/tasks/{task_id}/skip-dependents",
    response_model=SkipDependentResponse,
    dependencies=[_Guard],
)
async def skip_dependent_tasks(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> SkipDependentResponse:
    svc = TaskService(session)
    skipped = await svc.skip_dependent_tasks(task_id)
    return SkipDependentResponse(skipped=skipped)


@internal_router.post(
    "/plans/{plan_id}/cancel-tasks",
    response_model=CancelPlanTasksResponse,
    dependencies=[_Guard],
)
async def cancel_plan_tasks(
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> CancelPlanTasksResponse:
    svc = TaskService(session)
    cancelled = await svc.cancel_by_plan(plan_id)
    return CancelPlanTasksResponse(cancelled=cancelled)


# ── Task artifacts ─────────────────────────────────────────────────────────────


@internal_router.post(
    "/tasks/{task_id}/artifacts/bulk",
    status_code=status.HTTP_201_CREATED,
    dependencies=[_Guard],
)
async def create_task_artifacts(
    task_id: uuid.UUID,
    body: BulkArtifactsBody,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    svc = ArtifactService(session)
    dtos = [
        ArtifactCreate(
            type=a.artifact_type,
            title=a.artifact_type,
            content=a.content,
            content_type=a.content_type,
        )
        for a in body.artifacts
    ]
    created: list[ArtifactRead] = await svc.create_bulk(task_id, dtos)
    return {"created": len(created), "artifacts": [a.model_dump() for a in created]}


# ── Project agents (raw, for agent-service) ────────────────────────────────────


@internal_router.get(
    "/projects/{project_id}/agents/raw",
    dependencies=[_Guard],
)
async def list_project_agents_raw(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    svc = AgentService(session)
    return await svc.list_agents_raw(project_id)


# ── Library agent usage_count ──────────────────────────────────────────────────


@internal_router.post(
    "/library/agents/{agent_id}/increment-usage",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_Guard],
)
async def increment_library_agent_usage(
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    svc = LibraryAgentService(session)
    ok = await svc.increment_usage(agent_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library agent not found")


# ── User role management (test/admin tooling) ──────────────────────────────────


@internal_router.patch(
    "/users/{user_id}/role",
    dependencies=[_Guard],
)
async def update_user_role(
    user_id: uuid.UUID,
    body: UpdateUserRoleBody,
    session: AsyncSession = Depends(get_session),
) -> Any:
    """Promote or demote a user's system_role. Intended for CI seed scripts."""
    from telaios.modules.users.schemas import UserUpdate
    from telaios.modules.users.service import UserService

    svc = UserService(session)
    try:
        return await svc.patch_user(user_id, UserUpdate(system_role=body.system_role))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
