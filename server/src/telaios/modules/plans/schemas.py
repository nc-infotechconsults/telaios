"""Plan Pydantic schemas (request / response)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from telaios.domain.enums import PlanStatus

# ── Request DTOs ──────────────────────────────────────────────────────────────


class PlanCreate(BaseModel):
    title: str | None = None
    status: PlanStatus = PlanStatus.DRAFT


class PlanPatch(BaseModel):
    title: str | None = None
    status: PlanStatus | None = None
    confirmed_at: datetime | None = None
    failure_reason: str | None = None


# ── Response ──────────────────────────────────────────────────────────────────


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str | None
    status: PlanStatus
    confirmed_at: datetime | None
    failure_reason: str | None
    created_at: datetime


# ── Resume ────────────────────────────────────────────────────────────────────


class ResumeResponse(BaseModel):
    status: str
    plan_id: uuid.UUID


__all__ = ["PlanCreate", "PlanPatch", "PlanRead", "PlanStatus", "ResumeResponse"]
