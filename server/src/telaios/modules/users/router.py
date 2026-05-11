"""Users + auth router.

Routes ported from:
  - ``data-api/src/routes/auth.route.ts``
  - ``data-api/src/routes/users.route.ts``

Endpoints:
  POST   /auth/register   — create account + return JWT
  POST   /auth/login      — authenticate + return JWT
  GET    /auth/me         — return current user profile

  GET    /users           — list all users (admin only)
  GET    /users/{id}      — get user by id (admin only)
  PATCH  /users/{id}      — update user fields (admin only)
  DELETE /users/{id}      — soft-delete user (admin only)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, require_admin
from telaios.db.session import get_session
from telaios.modules.users.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserRead,
    UserUpdate,
)
from telaios.modules.users.service import UserService

# ─── Auth sub-router ──────────────────────────────────────────────────────

auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/register", status_code=201, response_model=TokenResponse)
async def register(
    body: RegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    return await UserService(session).register(body)


@auth_router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    return await UserService(session).login(body)


@auth_router.get("/me", response_model=UserRead)
async def me(
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    return await UserService(session).get_user(uuid.UUID(principal.id))


# ─── Users sub-router ─────────────────────────────────────────────────────

users_router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(require_admin)],
)


@users_router.get("", response_model=list[UserRead])
async def list_users(
    session: AsyncSession = Depends(get_session),
) -> list[UserRead]:
    return await UserService(session).list_users()


@users_router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    return await UserService(session).get_user(user_id)


@users_router.patch("/{user_id}", response_model=UserRead)
async def patch_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    return await UserService(session).patch_user(user_id, body)


@users_router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    await UserService(session).delete_user(user_id)


__all__ = ["auth_router", "users_router"]
