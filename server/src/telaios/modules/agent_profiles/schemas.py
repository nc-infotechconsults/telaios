"""Agent profiles schemas.

The ``/agent-profiles`` API delegates to the ``LibraryAgent`` table.  This
schema describes the legacy AgentProfile contract that the frontend uses.

Ported from ``data-api/src/schemas/agentProfile.schema.ts``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from telaios.domain.enums import SystemPromptMode


class AgentProfileMcpServer(BaseModel):
    name: str
    transport: Literal["stdio", "streamable-http"]
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    tools: list[dict[str, Any]] | None = None


class AgentProfileSkill(BaseModel):
    name: str
    description: str
    instructions: str


class AgentProfileRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    agent_type: str
    llm_provider: str | None
    llm_model: str | None
    has_llm_api_key: bool
    has_github_token: bool
    llm_temperature: float | None
    llm_max_tokens: int | None
    system_prompt: str | None
    system_prompt_mode: SystemPromptMode
    sub_agent_ids: list[uuid.UUID]
    structured_output: dict[str, Any] | None
    mcp_servers: list[dict[str, Any]]
    skills: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class CreateAgentProfileDto(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    agent_type: str | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    github_token: str | None = None
    mcp_servers: list[AgentProfileMcpServer] | None = None
    skills: list[AgentProfileSkill] | None = None
    system_prompt: str | None = None
    system_prompt_mode: SystemPromptMode | None = None
    llm_temperature: float | None = Field(default=None, ge=0, le=2)
    llm_max_tokens: int | None = Field(default=None, gt=0)
    llm_top_p: float | None = Field(default=None, ge=0, le=1)
    llm_frequency_penalty: float | None = Field(default=None, ge=-2, le=2)
    llm_presence_penalty: float | None = Field(default=None, ge=-2, le=2)
    sub_agent_ids: list[uuid.UUID] | None = None
    structured_output: dict[str, Any] | None = None


class PatchAgentProfileDto(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    agent_type: str | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    github_token: str | None = None
    mcp_servers: list[AgentProfileMcpServer] | None = None
    skills: list[AgentProfileSkill] | None = None
    system_prompt: str | None = None
    system_prompt_mode: SystemPromptMode | None = None
    llm_temperature: float | None = Field(default=None, ge=0, le=2)
    llm_max_tokens: int | None = Field(default=None, gt=0)
    llm_top_p: float | None = Field(default=None, ge=0, le=1)
    llm_frequency_penalty: float | None = Field(default=None, ge=-2, le=2)
    llm_presence_penalty: float | None = Field(default=None, ge=-2, le=2)
    sub_agent_ids: list[uuid.UUID] | None = None
    structured_output: dict[str, Any] | None = None


__all__ = [
    "AgentProfileMcpServer",
    "AgentProfileRead",
    "AgentProfileSkill",
    "CreateAgentProfileDto",
    "PatchAgentProfileDto",
    "SystemPromptMode",
]
