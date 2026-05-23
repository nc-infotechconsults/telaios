"""Pydantic schemas for the workspaces module.

Ported from ``data-api/src/schemas/workspace.schema.ts``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from telaios.domain.enums import WorkspaceStatus


class WorkspaceConfig(BaseModel):
    """Flexible workspace configuration stored as JSONB.

    Extra fields are allowed so future schema evolution doesn't break existing
    records.
    """

    model_config = ConfigDict(extra="allow")

    repositories: dict[str, dict[str, Any]] | None = None
    env_vars: dict[str, str] | None = None
    devcontainer_overrides: dict[str, Any] | None = None
    default_open_files: list[str] | None = None
    agent_profile_id: str | None = None


class WorkspaceCreate(BaseModel):
    """Payload for POST /projects/{project_id}/workspaces."""

    name: str = Field(min_length=1)
    config: WorkspaceConfig | None = None


class WorkspaceUpdate(BaseModel):
    """Payload for PATCH /workspaces/{id} — all fields optional."""

    name: str | None = Field(default=None, min_length=1)
    status: WorkspaceStatus | None = None
    container_id: str | None = None
    container_image: str | None = None
    ide_url: str | None = None
    ide_workspace_id: str | None = None
    config: WorkspaceConfig | None = None


class WorkspaceRead(BaseModel):
    """Serialised workspace row."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    status: WorkspaceStatus
    container_id: str | None = None
    container_image: str | None = None
    ide_url: str | None = None
    ide_workspace_id: str | None = None
    config: dict[str, Any]
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


__all__ = [
    "WorkspaceConfig",
    "WorkspaceCreate",
    "WorkspaceRead",
    "WorkspaceStatus",
    "WorkspaceUpdate",
]
