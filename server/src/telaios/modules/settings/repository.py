"""Settings repository — singleton CRUD for the ``settings`` table."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.app_settings import AppSettings


class SettingsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_or_create(self) -> AppSettings:
        result = await self._s.execute(select(AppSettings).where(AppSettings.id == 1))
        obj = result.scalar_one_or_none()
        if obj is None:
            obj = AppSettings(id=1)
            self._s.add(obj)
            await self._s.flush()
            await self._s.refresh(obj)
        return obj

    async def save(self, obj: AppSettings) -> AppSettings:
        await self._s.flush()
        await self._s.refresh(obj)
        return obj
