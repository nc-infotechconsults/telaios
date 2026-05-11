"""Settings service — singleton get/patch."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.settings.repository import SettingsRepository
from telaios.modules.settings.schemas import PatchSettingsDto, SettingsRead
from telaios.utils.crypto import decrypt, encrypt


def _sanitize(obj: object) -> SettingsRead:
    raw_key = getattr(obj, "llm_api_key", None)
    has_api_key = bool(raw_key and decrypt(raw_key))
    data = {
        col: getattr(obj, col)
        for col in (
            "id",
            "llm_provider",
            "llm_model",
            "llm_base_url",
            "llm_temperature",
            "llm_max_tokens",
            "llm_top_p",
            "llm_frequency_penalty",
            "llm_presence_penalty",
            "updated_at",
        )
    }
    data["has_api_key"] = has_api_key
    return SettingsRead.model_validate(data)


class SettingsService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = SettingsRepository(session)

    async def get_settings(self) -> SettingsRead:
        obj = await self._repo.get_or_create()
        return _sanitize(obj)

    async def patch_settings(self, dto: PatchSettingsDto) -> SettingsRead:
        obj = await self._repo.get_or_create()
        updates = dto.model_dump(exclude_unset=True)

        llm_api_key_raw = updates.pop("llm_api_key_raw", None)
        for field, val in updates.items():
            setattr(obj, field, val)
        if llm_api_key_raw:
            obj.llm_api_key = encrypt(llm_api_key_raw)

        obj = await self._repo.save(obj)
        return _sanitize(obj)
