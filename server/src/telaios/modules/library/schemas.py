"""Library module schemas.

Ported from:
  ``data-api/src/schemas/libraryAgent.schema.ts``
  ``data-api/src/schemas/libraryMcp.schema.ts``
  ``data-api/src/schemas/librarySkill.schema.ts``
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# ── Shared sub-objects ────────────────────────────────────────────────────────

McpTransport = Literal["stdio", "streamable-http"]
McpToolPermission = Literal["read", "write", "execute", "require-confirmation"]

SystemPromptMode = Literal["append", "override"]


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
    tool_name: str = Field(min_length=1)
    tool_description: str = Field(min_length=1)


# ── LibraryAgent ──────────────────────────────────────────────────────────────


class LibraryAgentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    agent_type: str
    role: str | None
    system_prompt: str | None
    system_prompt_mode: SystemPromptMode
    llm_provider: str | None
    llm_model: str | None
    has_llm_api_key: bool
    llm_temperature: float | None
    llm_max_tokens: int | None
    sub_agents: list[dict[str, Any]]
    mcp_servers: list[dict[str, Any]]
    skills: list[dict[str, Any]]
    structured_output: dict[str, Any] | None
    tags: list[str]
    published_by: str | None
    usage_count: int
    version: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_sanitized(cls, obj: object) -> LibraryAgentRead:
        from telaios.utils.crypto import decrypt

        raw_key = getattr(obj, "llm_api_key", None)
        has_key = bool(raw_key and decrypt(raw_key))
        data = {
            col: getattr(obj, col)
            for col in (
                "id",
                "name",
                "slug",
                "description",
                "agent_type",
                "role",
                "system_prompt",
                "system_prompt_mode",
                "llm_provider",
                "llm_model",
                "llm_temperature",
                "llm_max_tokens",
                "sub_agents",
                "mcp_servers",
                "skills",
                "structured_output",
                "tags",
                "published_by",
                "usage_count",
                "version",
                "created_at",
                "updated_at",
            )
        }
        data["has_llm_api_key"] = has_key
        return cls.model_validate(data)


class LibraryAgentCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    role: str | None = None
    system_prompt: str | None = None
    system_prompt_mode: SystemPromptMode = "append"
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None
    llm_temperature: float | None = Field(default=None, ge=0, le=2)
    llm_max_tokens: int | None = Field(default=None, gt=0)
    sub_agents: list[SubAgentEntry] | None = None
    mcp_servers: list[McpServer] | None = None
    skills: list[InlineSkill] | None = None
    structured_output: dict[str, Any] | None = None
    tags: list[str] | None = None
    version: str | None = None


class LibraryAgentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    role: str | None = None
    system_prompt: str | None = None
    system_prompt_mode: SystemPromptMode | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None
    llm_temperature: float | None = Field(default=None, ge=0, le=2)
    llm_max_tokens: int | None = Field(default=None, gt=0)
    sub_agents: list[SubAgentEntry] | None = None
    mcp_servers: list[McpServer] | None = None
    skills: list[InlineSkill] | None = None
    structured_output: dict[str, Any] | None = None
    tags: list[str] | None = None
    version: str | None = None


class LibraryAgentQuery(BaseModel):
    q: str | None = None
    role: str | None = None
    tags: str | None = None  # comma-separated
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)


class LibraryAgentPage(BaseModel):
    items: list[LibraryAgentRead]
    total: int
    page: int
    limit: int


# ── LibraryMCP ────────────────────────────────────────────────────────────────


class LibraryMcpRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    transport: McpTransport
    command: str | None
    args: list[str]
    env: dict[str, str]
    url: str | None
    headers: dict[str, str]
    tags: list[str]
    published_by: str | None
    usage_count: int
    version: str
    created_at: datetime
    updated_at: datetime


class LibraryMcpCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    transport: McpTransport = "stdio"
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    tags: list[str] | None = None
    version: str | None = None


class LibraryMcpPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    transport: McpTransport | None = None
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    tags: list[str] | None = None
    version: str | None = None


class LibraryMcpQuery(BaseModel):
    q: str | None = None
    tags: str | None = None
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)


class LibraryMcpPage(BaseModel):
    items: list[LibraryMcpRead]
    total: int
    page: int
    limit: int


# ── LibrarySkill ──────────────────────────────────────────────────────────────


class SkillFileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    path: str
    content: str


class SkillFileDto(BaseModel):
    path: str = Field(min_length=1, max_length=255)
    content: str


class LibrarySkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    content: str
    tags: list[str]
    published_by: str | None
    usage_count: int
    version: str
    license: str | None
    compatibility: str | None
    skill_metadata: dict[str, str] | None
    files: list[SkillFileRead] | None = None
    created_at: datetime
    updated_at: datetime


class LibrarySkillCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    content: str = Field(min_length=1)
    tags: list[str] | None = None
    version: str | None = None
    license: str | None = None
    compatibility: str | None = None
    skill_metadata: dict[str, str] | None = None
    files: list[SkillFileDto] | None = None


class LibrarySkillPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    content: str | None = Field(default=None, min_length=1)
    tags: list[str] | None = None
    version: str | None = None
    license: str | None = None
    compatibility: str | None = None
    skill_metadata: dict[str, str] | None = None
    files: list[SkillFileDto] | None = None


class LibrarySkillQuery(BaseModel):
    q: str | None = None
    tags: str | None = None
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)


class LibrarySkillPage(BaseModel):
    items: list[LibrarySkillRead]
    total: int
    page: int
    limit: int


__all__ = [
    "InlineSkill",
    "LibraryAgentCreate",
    "LibraryAgentPage",
    "LibraryAgentPatch",
    "LibraryAgentQuery",
    "LibraryAgentRead",
    "LibraryMcpCreate",
    "LibraryMcpPage",
    "LibraryMcpPatch",
    "LibraryMcpQuery",
    "LibraryMcpRead",
    "LibrarySkillCreate",
    "LibrarySkillPage",
    "LibrarySkillPatch",
    "LibrarySkillQuery",
    "LibrarySkillRead",
    "McpServer",
    "McpToolConfig",
    "SkillFileDto",
    "SkillFileRead",
    "SubAgentEntry",
]
