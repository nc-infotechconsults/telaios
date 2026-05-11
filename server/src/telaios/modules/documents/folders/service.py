"""Document folders business-logic service."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.documents.folders.repository import FolderRepository
from telaios.modules.documents.folders.schemas import FolderCreate, FolderPatch, FolderRead
from telaios.utils.errors import NotFoundError


def _build_path(parent_path: str | None, name: str) -> str:
    if parent_path:
        return f"{parent_path}/{name}"
    return f"/{name}"


class FolderService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = FolderRepository(session)

    async def list_by_project(self, project_id: uuid.UUID) -> list[FolderRead]:
        folders = await self._repo.list_by_project(project_id)
        return [FolderRead.model_validate(f) for f in folders]

    async def get(self, folder_id: uuid.UUID) -> FolderRead:
        folder = await self._repo.find(folder_id)
        if folder is None:
            raise NotFoundError("Folder not found")
        return FolderRead.model_validate(folder)

    async def create(
        self,
        project_id: uuid.UUID,
        dto: FolderCreate,
        created_by: uuid.UUID | None = None,
    ) -> FolderRead:
        parent_path: str | None = None
        if dto.parent_folder_id is not None:
            parent = await self._repo.find(dto.parent_folder_id)
            if parent is None:
                raise NotFoundError("Parent folder not found")
            parent_path = parent.path

        folder = await self._repo.create(
            project_id,
            name=dto.name,
            parent_folder_id=dto.parent_folder_id,
            path=_build_path(parent_path, dto.name),
            created_by=created_by,
        )
        return FolderRead.model_validate(folder)

    async def patch(self, folder_id: uuid.UUID, dto: FolderPatch) -> FolderRead:
        folder = await self._repo.find(folder_id)
        if folder is None:
            raise NotFoundError("Folder not found")

        update = dto.model_dump(exclude_unset=True)
        if "name" in update:
            # Recompute path based on parent
            parent_path: str | None = None
            if folder.parent_folder_id is not None:
                parent = await self._repo.find(folder.parent_folder_id)
                if parent is not None:
                    parent_path = parent.path
            folder.path = _build_path(parent_path, update["name"])

        for key, value in update.items():
            setattr(folder, key, value)

        folder = await self._repo.save(folder)
        return FolderRead.model_validate(folder)

    async def delete(self, folder_id: uuid.UUID) -> None:
        folder = await self._repo.find(folder_id)
        if folder is None:
            raise NotFoundError("Folder not found")
        await self._repo.soft_delete(folder)


__all__ = ["FolderService"]
