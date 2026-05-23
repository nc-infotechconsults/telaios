"""Environments module schemas.

Ported from ``data-api/src/schemas/environment.schema.ts``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from telaios.domain.enums import EnvironmentStatus, EnvironmentType, HelmReleaseStatus


class HelmReleaseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    environment_id: uuid.UUID
    project_id: uuid.UUID
    name: str
    chart_repo_url: str | None
    chart_name: str
    chart_version: str | None
    namespace: str | None
    values_override: dict[str, Any] | None
    status: HelmReleaseStatus
    release_notes: str | None
    deployed_by: uuid.UUID | None
    deployed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class EnvironmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    type: EnvironmentType
    status: EnvironmentStatus
    connection_config: str | None
    namespace: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    helm_releases: list[HelmReleaseRead] | None = None


class EnvironmentCreate(BaseModel):
    name: str = Field(min_length=1)
    type: EnvironmentType = EnvironmentType.KUBERNETES
    namespace: str | None = None
    connection_config: dict[str, Any] | None = None


class EnvironmentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    type: EnvironmentType | None = None
    status: EnvironmentStatus | None = None
    namespace: str | None = None
    connection_config: dict[str, Any] | None = None


class InstallHelmChartDto(BaseModel):
    release_name: str = Field(min_length=1)
    chart_name: str = Field(min_length=1)
    chart_repo_url: str | None = None
    chart_version: str | None = None
    namespace: str | None = None
    values_override: dict[str, Any] | None = None


class UpgradeHelmChartDto(BaseModel):
    chart_name: str | None = None
    chart_repo_url: str | None = None
    chart_version: str | None = None
    namespace: str | None = None
    values_override: dict[str, Any] | None = None


class ConnectionTestResult(BaseModel):
    ok: bool
    message: str | None = None


__all__ = [
    "ConnectionTestResult",
    "EnvironmentCreate",
    "EnvironmentPatch",
    "EnvironmentRead",
    "EnvironmentStatus",
    "EnvironmentType",
    "HelmReleaseRead",
    "HelmReleaseStatus",
    "InstallHelmChartDto",
    "UpgradeHelmChartDto",
]
