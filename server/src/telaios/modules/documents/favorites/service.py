"""Document favorites business-logic service."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.documents.favorites.repository import FavoriteRepository
from telaios.modules.documents.favorites.schemas import FavoriteRead
from telaios.utils.errors import ConflictError, NotFoundError


class FavoriteService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = FavoriteRepository(session)

    async def list_by_user_in_project(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> list[FavoriteRead]:
        favs = await self._repo.list_by_user_in_project(user_id, project_id)
        return [FavoriteRead.model_validate(f) for f in favs]

    async def add(self, document_id: uuid.UUID, user_id: uuid.UUID) -> FavoriteRead:
        existing = await self._repo.find(document_id, user_id)
        if existing is not None:
            raise ConflictError("Document already favorited")
        fav = await self._repo.create(document_id, user_id)
        return FavoriteRead.model_validate(fav)

    async def remove(self, document_id: uuid.UUID, user_id: uuid.UUID) -> None:
        fav = await self._repo.find(document_id, user_id)
        if fav is None:
            raise NotFoundError("Favorite not found")
        await self._repo.delete_favorite(fav)


__all__ = ["FavoriteService"]
