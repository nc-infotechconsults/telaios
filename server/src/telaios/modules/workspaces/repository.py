"""Workspace repository — thin CRUD wrapper around the ``workspaces`` table."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.workspaces import Workspace


class WorkspaceRepository:
    """Async CRUD for :class:`~telaios.db.models.workspaces.Workspace`."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def find_by_project(self, project_id: uuid.UUID) -> list[Workspace]:
        """Return all non-deleted workspaces for ``project_id``, newest first."""
        result = await self._session.execute(
            select(Workspace)
            .where(Workspace.project_id == project_id, Workspace.deleted_at.is_(None))
            .order_by(Workspace.created_at.desc())
        )
        return list(result.scalars().all())

    async def find_by_id(self, workspace_id: uuid.UUID) -> Workspace | None:
        """Return a non-deleted workspace or ``None``."""
        result = await self._session.execute(
            select(Workspace).where(Workspace.id == workspace_id, Workspace.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def find_by_id_with_deleted(self, workspace_id: uuid.UUID) -> Workspace | None:
        """Return workspace including soft-deleted rows (used for RBAC resolution)."""
        result = await self._session.execute(select(Workspace).where(Workspace.id == workspace_id))
        return result.scalar_one_or_none()

    async def create(
        self,
        project_id: uuid.UUID,
        name: str,
        config: dict[str, object],
        created_by: uuid.UUID | None,
    ) -> Workspace:
        workspace = Workspace(
            project_id=project_id,
            name=name,
            config=config,
            created_by=created_by,
        )
        self._session.add(workspace)
        await self._session.flush()
        await self._session.refresh(workspace)
        return workspace

    async def update(self, workspace: Workspace, **kwargs: object) -> Workspace:
        for key, value in kwargs.items():
            setattr(workspace, key, value)
        await self._session.flush()
        await self._session.refresh(workspace)
        return workspace

    async def soft_delete(self, workspace: Workspace) -> None:
        workspace.deleted_at = datetime.now(UTC)
        await self._session.flush()


__all__ = ["WorkspaceRepository"]
