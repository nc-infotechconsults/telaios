"""Schemas for agent base profiles and overrides."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict


class AgentBaseProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    name: str
    description: str | None
    dispatch: str | None
    system_prompt: str | None
    system_prompt_mode: str
    llm_provider: str | None
    llm_model: str | None
    llm_base_url: str | None
    llm_temperature: float | None
    llm_max_tokens: int | None
    llm_top_p: float | None
    llm_frequency_penalty: float | None
    llm_presence_penalty: float | None
    mcp_servers: list[dict[str, Any]]
    skills: list[dict[str, Any]]


class AgentOverrideRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    base_profile_id: uuid.UUID
    project_id: uuid.UUID | None
    system_prompt: str | None
    system_prompt_mode: str | None
    llm_provider: str | None
    llm_model: str | None
    llm_base_url: str | None
    llm_temperature: float | None
    llm_max_tokens: int | None
    llm_top_p: float | None
    llm_frequency_penalty: float | None
    llm_presence_penalty: float | None
    mcp_servers: list[dict[str, Any]] | None
    skills: list[dict[str, Any]] | None


class AgentOverrideUpsert(BaseModel):
    """Sparse delta — only set the fields you want to override."""

    system_prompt: str | None = None
    system_prompt_mode: str | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_base_url: str | None = None
    llm_temperature: float | None = None
    llm_max_tokens: int | None = None
    llm_top_p: float | None = None
    llm_frequency_penalty: float | None = None
    llm_presence_penalty: float | None = None
    mcp_servers: list[dict[str, Any]] | None = None
    skills: list[dict[str, Any]] | None = None


class ResolvedAgentProfile(AgentBaseProfileRead):
    """Base profile merged with workspace and/or project override."""

    overridden_fields: list[str]
    override_scope: str  # "base" | "workspace" | "project"
    override_id: uuid.UUID | None = None
