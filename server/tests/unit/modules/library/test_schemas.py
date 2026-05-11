"""tests/unit/modules/library/test_schemas.py

Unit tests for library module schemas.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from telaios.modules.library.schemas import (
    LibraryAgentCreate,
    LibraryAgentPage,
    LibraryAgentPatch,
    LibraryAgentRead,
    LibraryMcpCreate,
    LibraryMcpPage,
    LibraryMcpPatch,
    LibraryMcpRead,
    LibrarySkillCreate,
    LibrarySkillPage,
    LibrarySkillPatch,
    LibrarySkillRead,
    McpServer,
    McpToolConfig,
    SkillFileDto,
    SubAgentEntry,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _make_agent_obj(
    llm_api_key: str | None = None,
    system_prompt_mode: str = "append",
) -> MagicMock:
    obj = MagicMock()
    obj.id = uuid.uuid4()
    obj.name = "My Agent"
    obj.slug = "my-agent"
    obj.description = "A test agent"
    obj.agent_type = "custom"
    obj.role = "coder"
    obj.system_prompt = None
    obj.system_prompt_mode = system_prompt_mode
    obj.llm_provider = "openai"
    obj.llm_model = "gpt-4o"
    obj.llm_api_key = llm_api_key
    obj.llm_temperature = 0.7
    obj.llm_max_tokens = 4096
    obj.sub_agents = []
    obj.mcp_servers = []
    obj.skills = []
    obj.structured_output = None
    obj.tags = []
    obj.published_by = None
    obj.usage_count = 0
    obj.version = "1.0.0"
    obj.created_at = _now()
    obj.updated_at = _now()
    return obj


def _make_mcp_obj() -> MagicMock:
    obj = MagicMock()
    obj.id = uuid.uuid4()
    obj.name = "My MCP"
    obj.slug = "my-mcp"
    obj.description = None
    obj.transport = "stdio"
    obj.command = "npx"
    obj.args = ["@modelcontextprotocol/server-filesystem"]
    obj.env = {}
    obj.url = None
    obj.headers = {}
    obj.tags = ["tools"]
    obj.published_by = None
    obj.usage_count = 0
    obj.version = "1.0.0"
    obj.created_at = _now()
    obj.updated_at = _now()
    return obj


def _make_skill_obj(with_files: bool = False) -> MagicMock:
    obj = MagicMock()
    obj.id = uuid.uuid4()
    obj.name = "My Skill"
    obj.slug = "my-skill"
    obj.description = "A skill"
    obj.content = "# Instructions"
    obj.tags = []
    obj.published_by = None
    obj.usage_count = 0
    obj.version = "1.0.0"
    obj.license = None
    obj.compatibility = None
    obj.skill_metadata = None
    obj.created_at = _now()
    obj.updated_at = _now()
    if with_files:
        f = MagicMock()
        f.id = uuid.uuid4()
        f.path = "scripts/run.sh"
        f.content = "#!/bin/bash\necho hello"
        obj.files = [f]
    else:
        obj.files = []
    return obj


# ── McpToolConfig ─────────────────────────────────────────────────────────


class TestMcpToolConfig:
    def test_valid(self):
        t = McpToolConfig(name="read_file", allowed=True, description="reads a file")
        assert t.name == "read_file"
        assert t.allowed is True

    def test_optional_fields(self):
        t = McpToolConfig(name="write_file", allowed=False)
        assert t.description is None
        assert t.permissions is None

    def test_with_permissions(self):
        t = McpToolConfig(name="exec", allowed=True, permissions=["execute"])
        assert "execute" in t.permissions  # type: ignore[operator]


# ── McpServer ────────────────────────────────────────────────────────────


class TestMcpServer:
    def test_stdio_transport(self):
        s = McpServer(name="fs", transport="stdio", command="npx", args=["server-fs"])
        assert s.transport == "stdio"

    def test_http_transport(self):
        s = McpServer(name="remote", transport="streamable-http", url="https://mcp.example.com")
        assert s.url == "https://mcp.example.com"


# ── SubAgentEntry ─────────────────────────────────────────────────────────


class TestSubAgentEntry:
    def test_valid(self):
        aid = uuid.uuid4()
        e = SubAgentEntry(agent_id=aid, tool_name="coder", tool_description="writes code")
        assert e.agent_id == aid

    def test_empty_tool_name_raises(self):
        with pytest.raises(ValidationError):
            SubAgentEntry(agent_id=uuid.uuid4(), tool_name="", tool_description="x")

    def test_empty_tool_description_raises(self):
        with pytest.raises(ValidationError):
            SubAgentEntry(agent_id=uuid.uuid4(), tool_name="t", tool_description="")


# ── LibraryAgentRead.from_orm_sanitized ──────────────────────────────────


class TestLibraryAgentReadFromOrmSanitized:
    @patch("telaios.utils.crypto.decrypt", return_value=None)
    def test_no_api_key_has_llm_api_key_false(self, mock_decrypt):
        obj = _make_agent_obj(llm_api_key=None)
        read = LibraryAgentRead.from_orm_sanitized(obj)
        assert read.has_llm_api_key is False

    @patch("telaios.utils.crypto.decrypt", return_value="plaintext")
    def test_with_api_key_has_llm_api_key_true(self, mock_dec):
        obj = _make_agent_obj(llm_api_key="enc_key")
        read = LibraryAgentRead.from_orm_sanitized(obj)
        mock_dec.assert_called_once_with("enc_key")
        assert read.has_llm_api_key is True

    @patch("telaios.utils.crypto.decrypt", return_value="")
    def test_decrypt_empty_string_is_false(self, mock_decrypt):
        obj = _make_agent_obj(llm_api_key="enc")
        read = LibraryAgentRead.from_orm_sanitized(obj)
        assert read.has_llm_api_key is False

    @patch("telaios.utils.crypto.decrypt", return_value=None)
    def test_does_not_expose_raw_api_key(self, mock_decrypt):
        obj = _make_agent_obj(llm_api_key="enc_key")
        read = LibraryAgentRead.from_orm_sanitized(obj)
        assert not hasattr(read, "llm_api_key")

    @patch("telaios.utils.crypto.decrypt", return_value=None)
    def test_maps_scalar_fields(self, mock_decrypt):
        obj = _make_agent_obj()
        read = LibraryAgentRead.from_orm_sanitized(obj)
        assert read.name == "My Agent"
        assert read.slug == "my-agent"
        assert read.llm_provider == "openai"


# ── LibraryAgentCreate ────────────────────────────────────────────────────


class TestLibraryAgentCreate:
    def test_valid_minimal(self):
        dto = LibraryAgentCreate(name="Agent", slug="my-agent")
        assert dto.slug == "my-agent"
        assert dto.system_prompt_mode == "append"

    def test_slug_pattern_rejects_uppercase(self):
        with pytest.raises(ValidationError):
            LibraryAgentCreate(name="Agent", slug="My-Agent")

    def test_slug_pattern_rejects_spaces(self):
        with pytest.raises(ValidationError):
            LibraryAgentCreate(name="Agent", slug="my agent")

    def test_slug_allows_numbers_and_hyphens(self):
        dto = LibraryAgentCreate(name="A", slug="agent-123")
        assert dto.slug == "agent-123"

    def test_temperature_range(self):
        LibraryAgentCreate(name="A", slug="a", llm_temperature=0.0)
        LibraryAgentCreate(name="A", slug="a", llm_temperature=2.0)
        with pytest.raises(ValidationError):
            LibraryAgentCreate(name="A", slug="a", llm_temperature=2.1)

    def test_max_tokens_must_be_positive(self):
        with pytest.raises(ValidationError):
            LibraryAgentCreate(name="A", slug="a", llm_max_tokens=0)

    def test_name_empty_raises(self):
        with pytest.raises(ValidationError):
            LibraryAgentCreate(name="", slug="a")


# ── LibraryAgentPatch ─────────────────────────────────────────────────────


class TestLibraryAgentPatch:
    def test_all_none(self):
        dto = LibraryAgentPatch()
        assert dto.name is None
        assert dto.llm_api_key is None

    def test_name_empty_raises(self):
        with pytest.raises(ValidationError):
            LibraryAgentPatch(name="")


# ── LibraryMcpCreate ──────────────────────────────────────────────────────


class TestLibraryMcpCreate:
    def test_valid_minimal(self):
        dto = LibraryMcpCreate(name="FS MCP", slug="fs-mcp")
        assert dto.transport == "stdio"

    def test_slug_pattern(self):
        with pytest.raises(ValidationError):
            LibraryMcpCreate(name="FS", slug="FS-MCP")

    def test_http_transport(self):
        dto = LibraryMcpCreate(name="Remote", slug="remote-mcp", transport="streamable-http")
        assert dto.transport == "streamable-http"


# ── LibraryMcpPatch ───────────────────────────────────────────────────────


class TestLibraryMcpPatch:
    def test_all_none(self):
        dto = LibraryMcpPatch()
        assert dto.name is None
        assert dto.transport is None

    def test_name_empty_raises(self):
        with pytest.raises(ValidationError):
            LibraryMcpPatch(name="")


# ── LibraryMcpRead ────────────────────────────────────────────────────────


class TestLibraryMcpRead:
    def test_from_attributes(self):
        obj = _make_mcp_obj()
        read = LibraryMcpRead.model_validate(obj, from_attributes=True)
        assert read.name == "My MCP"
        assert read.transport == "stdio"
        assert isinstance(read.args, list)


# ── SkillFileDto ──────────────────────────────────────────────────────────


class TestSkillFileDto:
    def test_valid(self):
        f = SkillFileDto(path="scripts/run.sh", content="#!/bin/bash")
        assert f.path == "scripts/run.sh"

    def test_empty_path_raises(self):
        with pytest.raises(ValidationError):
            SkillFileDto(path="", content="x")

    def test_path_too_long_raises(self):
        with pytest.raises(ValidationError):
            SkillFileDto(path="a" * 256, content="x")


# ── LibrarySkillCreate ────────────────────────────────────────────────────


class TestLibrarySkillCreate:
    def test_valid(self):
        dto = LibrarySkillCreate(name="My Skill", slug="my-skill", content="# Hello")
        assert dto.content == "# Hello"

    def test_content_empty_raises(self):
        with pytest.raises(ValidationError):
            LibrarySkillCreate(name="S", slug="s", content="")

    def test_slug_pattern(self):
        with pytest.raises(ValidationError):
            LibrarySkillCreate(name="S", slug="My Skill", content="x")


# ── LibrarySkillPatch ─────────────────────────────────────────────────────


class TestLibrarySkillPatch:
    def test_all_none(self):
        dto = LibrarySkillPatch()
        assert dto.name is None
        assert dto.content is None

    def test_empty_content_raises(self):
        with pytest.raises(ValidationError):
            LibrarySkillPatch(content="")


# ── LibrarySkillRead ──────────────────────────────────────────────────────


class TestLibrarySkillRead:
    def test_from_attributes(self):
        obj = _make_skill_obj()
        read = LibrarySkillRead.model_validate(obj, from_attributes=True)
        assert read.name == "My Skill"
        assert read.content == "# Instructions"


# ── Page schemas ─────────────────────────────────────────────────────────


class TestPageSchemas:
    @patch("telaios.utils.crypto.decrypt", return_value=None)
    def test_library_agent_page(self, mock_decrypt):
        obj = _make_agent_obj()
        item = LibraryAgentRead.from_orm_sanitized(obj)
        page = LibraryAgentPage(items=[item], total=1, page=1, limit=20)
        assert page.total == 1
        assert len(page.items) == 1

    def test_library_mcp_page(self):
        obj = _make_mcp_obj()
        item = LibraryMcpRead.model_validate(obj, from_attributes=True)
        page = LibraryMcpPage(items=[item], total=5, page=1, limit=20)
        assert page.total == 5

    def test_library_skill_page(self):
        obj = _make_skill_obj()
        item = LibrarySkillRead.model_validate(obj, from_attributes=True)
        page = LibrarySkillPage(items=[item], total=3, page=1, limit=20)
        assert page.total == 3
