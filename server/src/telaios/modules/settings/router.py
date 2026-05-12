"""Settings router.

Endpoints:
  GET    /settings          — get current UI settings (admin only)
  PATCH  /settings          — update UI settings (admin only)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import require_admin
from telaios.db.session import get_session
from telaios.modules.settings.schemas import PatchSettingsDto, SettingsRead
from telaios.modules.settings.service import SettingsService

settings_router = APIRouter(prefix="/settings", tags=["settings"])


@settings_router.get("", response_model=SettingsRead)
async def get_settings(
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin),
) -> SettingsRead:
    return await SettingsService(session).get_settings()


@settings_router.patch("", response_model=SettingsRead)
async def patch_settings(
    body: PatchSettingsDto,
    session: AsyncSession = Depends(get_session),
    _admin: None = Depends(require_admin),
) -> SettingsRead:
    return await SettingsService(session).patch_settings(body)
