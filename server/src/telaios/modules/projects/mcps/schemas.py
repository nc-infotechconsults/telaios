"""Project MCPs Pydantic schemas."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from telaios.domain.enums import McpTransport


class ProjectMcpCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    transport: McpTransport = McpTransport.STDIO
    command: str | None = None
    args: list[str] = []
    env: dict[str, str] = {}
    url: str | None = None
    headers: dict[str, str] = {}


class ProjectMcpPatch(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    transport: McpTransport | None = None
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    headers: dict[str, str] | None = None


class ProjectMcpRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    cloned_from_library_mcp_id: uuid.UUID | None
    name: str
    slug: str
    description: str | None
    transport: McpTransport
    command: str | None
    args: list[str]
    env: dict[str, str]
    url: str | None
    headers: dict[str, str]
    created_at: datetime
    updated_at: datetime


class CloneMcpFromLibraryBody(BaseModel):
    library_mcp_id: uuid.UUID
