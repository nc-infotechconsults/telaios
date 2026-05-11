"""Pydantic schemas for the users + auth module.

Ported from:
  - ``data-api/src/schemas/auth.schema.ts``
  - ``data-api/src/schemas/user.schema.ts``
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

SystemRole = Literal["admin", "member"]


# ─── Auth ─────────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    """Payload for POST /auth/register."""

    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1)


class LoginRequest(BaseModel):
    """Payload for POST /auth/login."""

    email: EmailStr
    password: str = Field(min_length=1)


# ─── User read / write ────────────────────────────────────────────────────


class UserRead(BaseModel):
    """Serialised user — password_hash never included."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    system_role: SystemRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    """Payload for PATCH /users/:id — all fields optional."""

    display_name: str | None = Field(default=None, min_length=1)
    system_role: SystemRole | None = None
    is_active: bool | None = None


# ─── Token response ───────────────────────────────────────────────────────


class TokenResponse(BaseModel):
    """Response for register / login."""

    token: str
    user: UserRead


__all__ = [
    "LoginRequest",
    "RegisterRequest",
    "SystemRole",
    "TokenResponse",
    "UserRead",
    "UserUpdate",
]
