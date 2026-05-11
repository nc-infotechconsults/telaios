"""User repository — thin CRUD wrapper around the ``users`` table."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.users import User


class UserRepository:
    """Async CRUD for :class:`~telaios.db.models.users.User`."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def count(self) -> int:
        """Return the total number of non-deleted users."""
        result = await self._session.execute(
            select(func.count()).select_from(User).where(User.deleted_at.is_(None))
        )
        return result.scalar_one()

    async def find_by_email(self, email: str) -> User | None:
        result = await self._session.execute(
            select(User).where(User.email == email, User.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def find_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self._session.execute(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def find_all(self) -> list[User]:
        result = await self._session.execute(
            select(User).where(User.deleted_at.is_(None)).order_by(User.created_at.asc())
        )
        return list(result.scalars().all())

    async def create(self, **kwargs: object) -> User:
        user = User(**kwargs)
        self._session.add(user)
        await self._session.flush()
        await self._session.refresh(user)
        return user

    async def update(self, user: User, **kwargs: object) -> User:
        for key, value in kwargs.items():
            setattr(user, key, value)
        await self._session.flush()
        await self._session.refresh(user)
        return user

    async def soft_delete(self, user: User) -> None:
        user.deleted_at = datetime.now(UTC)
        await self._session.flush()


__all__ = ["UserRepository"]
