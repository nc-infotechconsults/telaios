"""tests/unit/modules/agent_profiles/test_schemas.py

Unit tests for agent_profiles module schemas.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from telaios.modules.agent_profiles.schemas import (
    AgentProfileMcpServer,
    AgentProfileRead,
    AgentProfileSkill,
    CreateAgentProfileDto,
    PatchAgentProfileDto,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _make_read(**kwargs) -> AgentProfileRead:
    defaults = {
        "id": uuid.uuid4(),
        "name": "Test Agent",
        "description": "A test agent",
        "agent_type": "custom",
        "llm_provider": None,
        "llm_model": None,
        "has_llm_api_key": False,
        "has_github_token": False,
        "llm_temperature": None,
        "llm_max_tokens": None,
        "system_prompt": None,
        "system_prompt_mode": "override",
        "sub_agent_ids": [],
        "structured_output": None,
        "mcp_servers": [],
        "skills": [],
        "created_at": _now(),
        "updated_at": _now(),
    }
    defaults.update(kwargs)
    return AgentProfileRead(**defaults)


# ── AgentProfileMcpServer ─────────────────────────────────────────────────


class TestAgentProfileMcpServer:
    def test_valid_stdio(self):
        s = AgentProfileMcpServer(name="fs", transport="stdio", command="npx")
        assert s.transport == "stdio"

    def test_valid_http(self):
        s = AgentProfileMcpServer(
            name="remote", transport="streamable-http", url="https://mcp.example.com"
        )
        assert s.url == "https://mcp.example.com"

    def test_optional_fields_none(self):
        s = AgentProfileMcpServer(name="fs", transport="stdio")
        assert s.command is None
        assert s.args is None
        assert s.env is None
        assert s.tools is None


# ── AgentProfileSkill ─────────────────────────────────────────────────────


class TestAgentProfileSkill:
    def test_valid(self):
        s = AgentProfileSkill(name="coder", description="writes code", instructions="# Do X")
        assert s.name == "coder"
        assert s.instructions == "# Do X"


# ── AgentProfileRead ──────────────────────────────────────────────────────


class TestAgentProfileRead:
    def test_valid_full(self):
        read = _make_read()
        assert read.name == "Test Agent"
        assert read.has_llm_api_key is False
        assert read.has_github_token is False
        assert read.system_prompt_mode == "override"

    def test_extend_mode_valid(self):
        read = _make_read(system_prompt_mode="extend")
        assert read.system_prompt_mode == "extend"

    def test_invalid_mode_raises(self):
        with pytest.raises(ValidationError):
            _make_read(system_prompt_mode="append")  # type: ignore[arg-type]

    def test_sub_agent_ids_list_of_uuids(self):
        ids = [uuid.uuid4(), uuid.uuid4()]
        read = _make_read(sub_agent_ids=ids)
        assert len(read.sub_agent_ids) == 2

    def test_does_not_expose_raw_api_key(self):
        read = _make_read()
        assert not hasattr(read, "llm_api_key")


# ── CreateAgentProfileDto ─────────────────────────────────────────────────


class TestCreateAgentProfileDto:
    def test_valid_minimal(self):
        dto = CreateAgentProfileDto(name="My Agent")
        assert dto.name == "My Agent"
        assert dto.llm_api_key is None

    def test_name_empty_raises(self):
        with pytest.raises(ValidationError):
            CreateAgentProfileDto(name="")

    def test_temperature_range(self):
        CreateAgentProfileDto(name="A", llm_temperature=0.0)
        CreateAgentProfileDto(name="A", llm_temperature=2.0)
        with pytest.raises(ValidationError):
            CreateAgentProfileDto(name="A", llm_temperature=2.1)

    def test_max_tokens_positive(self):
        with pytest.raises(ValidationError):
            CreateAgentProfileDto(name="A", llm_max_tokens=0)

    def test_top_p_range(self):
        CreateAgentProfileDto(name="A", llm_top_p=0.0)
        CreateAgentProfileDto(name="A", llm_top_p=1.0)
        with pytest.raises(ValidationError):
            CreateAgentProfileDto(name="A", llm_top_p=1.1)

    def test_frequency_penalty_range(self):
        CreateAgentProfileDto(name="A", llm_frequency_penalty=-2.0)
        CreateAgentProfileDto(name="A", llm_frequency_penalty=2.0)
        with pytest.raises(ValidationError):
            CreateAgentProfileDto(name="A", llm_frequency_penalty=2.1)

    def test_presence_penalty_range(self):
        CreateAgentProfileDto(name="A", llm_presence_penalty=-2.0)
        CreateAgentProfileDto(name="A", llm_presence_penalty=2.0)
        with pytest.raises(ValidationError):
            CreateAgentProfileDto(name="A", llm_presence_penalty=-2.1)

    def test_system_prompt_mode_override(self):
        dto = CreateAgentProfileDto(name="A", system_prompt_mode="override")
        assert dto.system_prompt_mode == "override"

    def test_system_prompt_mode_extend(self):
        dto = CreateAgentProfileDto(name="A", system_prompt_mode="extend")
        assert dto.system_prompt_mode == "extend"

    def test_sub_agent_ids(self):
        ids = [uuid.uuid4(), uuid.uuid4()]
        dto = CreateAgentProfileDto(name="A", sub_agent_ids=ids)
        assert len(dto.sub_agent_ids) == 2  # type: ignore[arg-type]

    def test_mcp_servers_list(self):
        dto = CreateAgentProfileDto(
            name="A",
            mcp_servers=[AgentProfileMcpServer(name="fs", transport="stdio")],
        )
        assert len(dto.mcp_servers) == 1  # type: ignore[arg-type]


# ── PatchAgentProfileDto ──────────────────────────────────────────────────


class TestPatchAgentProfileDto:
    def test_all_none_default(self):
        dto = PatchAgentProfileDto()
        assert dto.name is None
        assert dto.llm_api_key is None
        assert dto.system_prompt_mode is None

    def test_name_empty_raises(self):
        with pytest.raises(ValidationError):
            PatchAgentProfileDto(name="")

    def test_temperature_validation(self):
        with pytest.raises(ValidationError):
            PatchAgentProfileDto(llm_temperature=-0.1)

    def test_partial_patch(self):
        dto = PatchAgentProfileDto(name="Updated", llm_model="claude-3")
        assert dto.name == "Updated"
        assert dto.llm_model == "claude-3"
        assert dto.llm_temperature is None
