"""Workspace service.

Ported from ``data-api/src/services/workspace.service.ts``.
The ``launch_workspace`` method calls an external IDE server via httpx.
"""

from __future__ import annotations

import uuid
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.workspaces.repository import WorkspaceRepository
from telaios.modules.workspaces.schemas import (
    WorkspaceCreate,
    WorkspaceRead,
    WorkspaceUpdate,
)
from telaios.utils.errors import ExternalServiceError, NotFoundError


class WorkspaceService:
    """Business logic for workspaces."""

    def __init__(self, session: AsyncSession) -> None:
        self._repo = WorkspaceRepository(session)

    async def list_by_project(self, project_id: uuid.UUID) -> list[WorkspaceRead]:
        workspaces = await self._repo.find_by_project(project_id)
        return [WorkspaceRead.model_validate(w) for w in workspaces]

    async def create(
        self,
        project_id: uuid.UUID,
        dto: WorkspaceCreate,
        created_by: uuid.UUID | None,
    ) -> WorkspaceRead:
        config: dict[str, Any] = dto.config.model_dump(exclude_none=True) if dto.config else {}
        workspace = await self._repo.create(
            project_id=project_id,
            name=dto.name,
            config=config,
            created_by=created_by,
        )
        return WorkspaceRead.model_validate(workspace)

    async def get(self, workspace_id: uuid.UUID) -> WorkspaceRead:
        workspace = await self._repo.find_by_id(workspace_id)
        if workspace is None:
            raise NotFoundError("Workspace not found")
        return WorkspaceRead.model_validate(workspace)

    async def patch(self, workspace_id: uuid.UUID, dto: WorkspaceUpdate) -> WorkspaceRead:
        workspace = await self._repo.find_by_id(workspace_id)
        if workspace is None:
            raise NotFoundError("Workspace not found")
        updates: dict[str, Any] = {}
        for field, value in dto.model_dump(exclude_none=True).items():
            if field == "config":
                updates["config"] = dto.config.model_dump(exclude_none=True) if dto.config else {}
            else:
                updates[field] = value
        if updates:
            workspace = await self._repo.update(workspace, **updates)
        return WorkspaceRead.model_validate(workspace)

    async def delete(self, workspace_id: uuid.UUID) -> None:
        workspace = await self._repo.find_by_id(workspace_id)
        if workspace is None:
            raise NotFoundError("Workspace not found")
        await self._repo.soft_delete(workspace)

    async def launch(
        self,
        workspace_id: uuid.UUID,
        ide_server_url: str,
        platform_api_url: str,
        token: str,
    ) -> WorkspaceRead:
        """Call the IDE server to start this workspace and store the returned IDs."""
        workspace = await self._repo.find_by_id(workspace_id)
        if workspace is None:
            raise NotFoundError("Workspace not found")

        payload = {
            "project_id": str(workspace.project_id),
            "workspace_id": str(workspace.id),
            "workspace_name": workspace.name,
            "config": workspace.config,
            "platform_api_url": platform_api_url,
            "token": token,
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{ide_server_url}/api/workspaces/from-project",
                    json=payload,
                )
                response.raise_for_status()
                data: dict[str, Any] = response.json()
        except httpx.HTTPError as exc:
            raise ExternalServiceError(f"IDE server error: {exc}") from exc

        ide_workspace_id: str = data["ide_workspace_id"]
        ide_url: str = data["ide_url"]
        workspace = await self._repo.update(
            workspace,
            ide_workspace_id=ide_workspace_id,
            ide_url=ide_url,
            status="starting",
        )
        return WorkspaceRead.model_validate(workspace)


__all__ = ["WorkspaceService"]
