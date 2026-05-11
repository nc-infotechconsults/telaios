"""User service — register, login, CRUD.

Ported from:
  - ``data-api/src/services/auth.service.ts``
  - ``data-api/src/services/user.service.ts``
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import Principal
from telaios.auth.jwt import issue_token
from telaios.auth.password import hash_password, verify_password
from telaios.db.session import get_sessionmaker
from telaios.modules.users.repository import UserRepository
from telaios.modules.users.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserRead,
    UserUpdate,
)
from telaios.utils.errors import ConflictError, NotFoundError, UnauthorizedError


class UserService:
    """Business logic for users and authentication."""

    def __init__(self, session: AsyncSession) -> None:
        self._repo = UserRepository(session)

    # ─── Auth ─────────────────────────────────────────────────────────────

    async def register(self, req: RegisterRequest) -> TokenResponse:
        """Register a new user. The first user ever becomes ``admin``."""
        email = req.email.lower()
        existing = await self._repo.find_by_email(email)
        if existing is not None:
            raise ConflictError("Email already registered")

        count = await self._repo.count()
        system_role = "admin" if count == 0 else "member"

        user = await self._repo.create(
            email=email,
            password_hash=hash_password(req.password),
            display_name=req.display_name,
            system_role=system_role,
        )
        token = issue_token(user_id=str(user.id), email=user.email, system_role=user.system_role)
        return TokenResponse(token=token, user=UserRead.model_validate(user))

    async def login(self, req: LoginRequest) -> TokenResponse:
        """Authenticate with email + password. Returns JWT on success."""
        email = req.email.lower()
        user = await self._repo.find_by_email(email)
        if user is None or not user.is_active:
            raise UnauthorizedError("Invalid credentials")
        if not verify_password(req.password, user.password_hash):
            raise UnauthorizedError("Invalid credentials")
        token = issue_token(user_id=str(user.id), email=user.email, system_role=user.system_role)
        return TokenResponse(token=token, user=UserRead.model_validate(user))

    # ─── CRUD ─────────────────────────────────────────────────────────────

    async def list_users(self) -> list[UserRead]:
        users = await self._repo.find_all()
        return [UserRead.model_validate(u) for u in users]

    async def get_user(self, user_id: uuid.UUID) -> UserRead:
        user = await self._repo.find_by_id(user_id)
        if user is None:
            raise NotFoundError("User not found")
        return UserRead.model_validate(user)

    async def patch_user(self, user_id: uuid.UUID, dto: UserUpdate) -> UserRead:
        user = await self._repo.find_by_id(user_id)
        if user is None:
            raise NotFoundError("User not found")
        updates = dto.model_dump(exclude_none=True)
        if updates:
            user = await self._repo.update(user, **updates)
        return UserRead.model_validate(user)

    async def delete_user(self, user_id: uuid.UUID) -> None:
        user = await self._repo.find_by_id(user_id)
        if user is None:
            raise NotFoundError("User not found")
        await self._repo.soft_delete(user)

    # ─── User-loader hook ─────────────────────────────────────────────────

    @staticmethod
    async def load_principal(user_id: str) -> Principal | None:
        """Resolve a JWT ``sub`` to a :class:`Principal` with fresh DB data.

        Registered via :func:`~telaios.auth.dependencies.set_user_loader` in
        ``main.py`` during Phase 4.  Returns ``None`` if the user is inactive
        or not found (causes ``current_principal`` to raise 401).
        """
        sm = get_sessionmaker()
        async with sm() as session:
            repo = UserRepository(session)
            try:
                uid = uuid.UUID(user_id)
            except ValueError:
                return None
            user = await repo.find_by_id(uid)
            if user is None or not user.is_active:
                return None
            return Principal(
                id=str(user.id),
                email=user.email,
                system_role=user.system_role,
            )


__all__ = ["UserService"]
