"""Pydantic schemas for the projects module (projects, members, agents).

Ported from:
  - ``data-api/src/schemas/project.schema.ts``
  - ``data-api/src/schemas/projectMember.schema.ts``
  - ``data-api/src/schemas/projectAgent.schema.ts``
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# ─── Shared agent JSONB sub-schemas ──────────────────────────────────────────
from telaios.domain.enums import (
    AgentRole,
    McpToolPermission,
    McpTransport,
    ProjectRole,
    ProjectStatus,
)


class McpToolConfig(BaseModel):
    name: str
    description: str | None = None
    allowed: bool
    permissions: list[McpToolPermission] | None = None


class McpServer(BaseModel):
    name: str
    transport: McpTransport
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    tools: list[McpToolConfig] | None = None


class InlineSkill(BaseModel):
    name: str
    description: str
    content: str


class SubAgentEntry(BaseModel):
    agent_id: uuid.UUID
    tool_name: str = Field(default="")
    tool_description: str = Field(default="")


class JsonSchemaObject(BaseModel):
    type: Literal["object"]
    properties: dict[str, Any] | None = None
    required: list[str] | None = None


# ─── Project ─────────────────────────────────────────────────────────────────


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    status: ProjectStatus | None = None


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    status: ProjectStatus | None = None


class ProjectQuery(BaseModel):
    q: str | None = None
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)


class ProjectListResponse(BaseModel):
    items: list[ProjectRead]
    total: int
    page: int
    limit: int


# ─── Member ───────────────────────────────────────────────────────────────────


class MemberUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    system_role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    project_id: uuid.UUID
    role: ProjectRole
    joined_at: datetime
    user: MemberUserRead | None = None


class AddMember(BaseModel):
    user_id: uuid.UUID
    role: ProjectRole = ProjectRole.VIEWER


class PatchMember(BaseModel):
    role: ProjectRole


# ─── Project Agent ────────────────────────────────────────────────────────────


class AgentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    library_agent_id: str | None
    name: str
    role: AgentRole
    system_prompt: str | None
    system_prompt_mode: str
    llm_provider: str | None
    llm_model: str | None
    has_llm_api_key: bool
    llm_base_url: str | None
    llm_temperature: float | None
    llm_max_tokens: int | None
    sub_agents: list[dict[str, Any]]
    mcp_servers: list[dict[str, Any]]
    skills: list[dict[str, Any]]
    structured_output: dict[str, Any] | None
    scope: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class CreateAgent(BaseModel):
    name: str = Field(min_length=1)
    role: AgentRole
    system_prompt: str | None = None
    system_prompt_mode: Literal["append", "override"] | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_temperature: float | None = Field(default=None, ge=0, le=2)
    llm_max_tokens: int | None = Field(default=None, ge=1)
    sub_agents: list[SubAgentEntry] | None = None
    mcp_servers: list[McpServer] | None = None
    skills: list[InlineSkill] | None = None
    structured_output: JsonSchemaObject | None = None
    scope: dict[str, Any] | None = None


class PatchAgent(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    role: AgentRole | None = None
    system_prompt: str | None = None
    system_prompt_mode: Literal["append", "override"] | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_temperature: float | None = Field(default=None, ge=0, le=2)
    llm_max_tokens: int | None = Field(default=None, ge=1)
    sub_agents: list[SubAgentEntry] | None = None
    mcp_servers: list[McpServer] | None = None
    skills: list[InlineSkill] | None = None
    structured_output: JsonSchemaObject | None = None
    scope: dict[str, Any] | None = None


__all__ = [
    "AddMember",
    "AgentRead",
    "AgentRole",
    "CreateAgent",
    "InlineSkill",
    "McpServer",
    "MemberRead",
    "MemberUserRead",
    "PatchAgent",
    "PatchMember",
    "ProjectCreate",
    "ProjectListResponse",
    "ProjectPatch",
    "ProjectQuery",
    "ProjectRead",
    "ProjectRole",
    "ProjectStatus",
    "SubAgentEntry",
]
