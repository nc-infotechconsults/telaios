"""Settings schemas.

Ported from ``data-api/src/schemas/settings.schema.ts``.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    llm_provider: str | None
    llm_model: str | None
    llm_base_url: str | None
    llm_temperature: float | None
    llm_max_tokens: int | None
    llm_top_p: float | None
    llm_frequency_penalty: float | None
    llm_presence_penalty: float | None
    has_api_key: bool
    updated_at: datetime


class PatchSettingsDto(BaseModel):
    llm_provider: str | None = None
    llm_model: str | None = None
    # plaintext key; service encrypts before persisting
    llm_api_key_raw: str | None = None
    llm_base_url: str | None = None
    llm_temperature: float | None = Field(default=None, ge=0, le=2)
    llm_max_tokens: int | None = Field(default=None, gt=0)
    llm_top_p: float | None = Field(default=None, ge=0, le=1)
    llm_frequency_penalty: float | None = Field(default=None, ge=-2, le=2)
    llm_presence_penalty: float | None = Field(default=None, ge=-2, le=2)


__all__ = ["PatchSettingsDto", "SettingsRead"]
