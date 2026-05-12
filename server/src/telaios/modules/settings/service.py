"""Settings service — singleton get/patch for UI customisation."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.settings.repository import SettingsRepository
from telaios.modules.settings.schemas import PatchSettingsDto, SettingsRead


class SettingsService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = SettingsRepository(session)

    async def get_settings(self) -> SettingsRead:
        obj = await self._repo.get_or_create()
        return SettingsRead.model_validate(obj)

    async def patch_settings(self, dto: PatchSettingsDto) -> SettingsRead:
        obj = await self._repo.get_or_create()
        for field, val in dto.model_dump(exclude_unset=True).items():
            setattr(obj, field, val)
        obj = await self._repo.save(obj)
        return SettingsRead.model_validate(obj)
