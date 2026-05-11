"""tests/unit/modules/projects/test_schemas.py

Unit tests for projects module Pydantic schemas.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from telaios.modules.projects.schemas import (
    AddMember,
    AgentRead,
    CreateAgent,
    JsonSchemaObject,
    McpServer,
    McpToolConfig,
    PatchAgent,
    PatchMember,
    ProjectCreate,
    ProjectListResponse,
    ProjectPatch,
    ProjectQuery,
    ProjectRead,
    SubAgentEntry,
)

# ─── ProjectCreate ────────────────────────────────────────────────────────


class TestProjectCreate:
    def test_valid_minimal(self):
        pc = ProjectCreate(name="My Project")
        assert pc.name == "My Project"
        assert pc.description is None
        assert pc.status is None

    def test_valid_with_all_fields(self):
        pc = ProjectCreate(name="proj", description="desc", status="planning")
        assert pc.status == "planning"

    def test_empty_name_raises(self):
        with pytest.raises(ValidationError):
            ProjectCreate(name="")

    def test_invalid_status_raises(self):
        with pytest.raises(ValidationError):
            ProjectCreate(name="proj", status="unknown")  # type: ignore[arg-type]


# ─── ProjectPatch ─────────────────────────────────────────────────────────


class TestProjectPatch:
    def test_all_none_valid(self):
        pp = ProjectPatch()
        assert pp.name is None
        assert pp.status is None

    def test_valid_patch(self):
        pp = ProjectPatch(name="new", status="done")
        assert pp.name == "new"
        assert pp.status == "done"

    def test_empty_name_raises(self):
        with pytest.raises(ValidationError):
            ProjectPatch(name="")

    def test_invalid_status_raises(self):
        with pytest.raises(ValidationError):
            ProjectPatch(status="invalid")  # type: ignore[arg-type]


# ─── ProjectQuery ─────────────────────────────────────────────────────────


class TestProjectQuery:
    def test_defaults(self):
        pq = ProjectQuery()
        assert pq.page == 1
        assert pq.limit == 20
        assert pq.q is None

    def test_custom_values(self):
        pq = ProjectQuery(q="search", page=3, limit=50)
        assert pq.q == "search"
        assert pq.page == 3
        assert pq.limit == 50

    def test_page_ge_1(self):
        with pytest.raises(ValidationError):
            ProjectQuery(page=0)

    def test_limit_capped_at_100(self):
        with pytest.raises(ValidationError):
            ProjectQuery(limit=101)


# ─── ProjectRead ──────────────────────────────────────────────────────────


class TestProjectRead:
    def _make(self, **kwargs) -> ProjectRead:
        defaults = dict(
            id=uuid.uuid4(),
            name="proj",
            description=None,
            status="planning",
            created_at=datetime.now(UTC),
        )
        defaults.update(kwargs)
        return ProjectRead(**defaults)

    def test_valid_minimal(self):
        pr = self._make()
        assert pr.status == "planning"
        assert pr.description is None

    def test_from_attributes(self):
        class FakeRow:
            id = uuid.uuid4()
            name = "row-proj"
            description = "d"
            status = "executing"
            created_at = datetime.now(UTC)

        pr = ProjectRead.model_validate(FakeRow())
        assert pr.name == "row-proj"
        assert pr.status == "executing"


# ─── ProjectListResponse ──────────────────────────────────────────────────


class TestProjectListResponse:
    def test_valid(self):
        resp = ProjectListResponse(items=[], total=0, page=1, limit=20)
        assert resp.total == 0
        assert resp.items == []


# ─── McpToolConfig ────────────────────────────────────────────────────────


class TestMcpToolConfig:
    def test_minimal(self):
        cfg = McpToolConfig(name="tool", allowed=True)
        assert cfg.name == "tool"
        assert cfg.permissions is None

    def test_with_permissions(self):
        cfg = McpToolConfig(name="tool", allowed=True, permissions=["read", "write"])
        assert "read" in cfg.permissions  # type: ignore[operator]


# ─── McpServer ────────────────────────────────────────────────────────────


class TestMcpServer:
    def test_stdio(self):
        srv = McpServer(name="srv", transport="stdio", command="python", args=["-m", "mcp"])
        assert srv.transport == "stdio"
        assert srv.url is None

    def test_http(self):
        srv = McpServer(name="srv", transport="streamable-http", url="https://mcp.example.com")
        assert srv.url == "https://mcp.example.com"


# ─── SubAgentEntry ────────────────────────────────────────────────────────


class TestSubAgentEntry:
    def test_valid(self):
        aid = uuid.uuid4()
        entry = SubAgentEntry(agent_id=aid, tool_name="search", tool_description="Searches docs")
        assert entry.agent_id == aid

    def test_empty_tool_name_raises(self):
        with pytest.raises(ValidationError):
            SubAgentEntry(agent_id=uuid.uuid4(), tool_name="", tool_description="desc")

    def test_empty_tool_description_raises(self):
        with pytest.raises(ValidationError):
            SubAgentEntry(agent_id=uuid.uuid4(), tool_name="name", tool_description="")


# ─── JsonSchemaObject ─────────────────────────────────────────────────────


class TestJsonSchemaObject:
    def test_valid_minimal(self):
        jso = JsonSchemaObject(type="object")
        assert jso.type == "object"
        assert jso.properties is None

    def test_with_properties(self):
        jso = JsonSchemaObject(type="object", properties={"name": {"type": "string"}})
        assert "name" in (jso.properties or {})


# ─── CreateAgent ──────────────────────────────────────────────────────────


class TestCreateAgent:
    def test_valid_minimal(self):
        ca = CreateAgent(name="agent", role="coder")
        assert ca.name == "agent"
        assert ca.role == "coder"
        assert ca.llm_api_key is None

    def test_empty_name_raises(self):
        with pytest.raises(ValidationError):
            CreateAgent(name="", role="coder")

    def test_llm_temperature_bounds(self):
        # valid bounds
        ca = CreateAgent(name="a", role="coder", llm_temperature=0.0)
        assert ca.llm_temperature == 0.0
        ca2 = CreateAgent(name="a", role="coder", llm_temperature=2.0)
        assert ca2.llm_temperature == 2.0

    def test_llm_temperature_out_of_range_raises(self):
        with pytest.raises(ValidationError):
            CreateAgent(name="a", role="coder", llm_temperature=2.1)

    def test_llm_max_tokens_ge_1(self):
        with pytest.raises(ValidationError):
            CreateAgent(name="a", role="coder", llm_max_tokens=0)


# ─── PatchAgent ───────────────────────────────────────────────────────────


class TestPatchAgent:
    def test_all_none_valid(self):
        pa = PatchAgent()
        assert pa.name is None
        assert pa.role is None

    def test_valid_patch(self):
        pa = PatchAgent(name="new-name", role="reviewer")
        assert pa.name == "new-name"

    def test_empty_name_raises(self):
        with pytest.raises(ValidationError):
            PatchAgent(name="")


# ─── AgentRead ────────────────────────────────────────────────────────────


class TestAgentRead:
    def _make(self, **kwargs) -> AgentRead:
        now = datetime.now(UTC)
        defaults: dict = dict(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            library_agent_id=None,
            name="agent",
            role="coder",
            system_prompt=None,
            system_prompt_mode="override",
            llm_provider=None,
            llm_model=None,
            has_llm_api_key=False,
            llm_base_url=None,
            llm_temperature=None,
            llm_max_tokens=None,
            sub_agents=[],
            mcp_servers=[],
            skills=[],
            structured_output=None,
            scope=None,
            created_at=now,
            updated_at=now,
        )
        defaults.update(kwargs)
        return AgentRead(**defaults)

    def test_valid(self):
        ar = self._make(has_llm_api_key=True)
        assert ar.has_llm_api_key is True

    def test_no_api_key_by_default(self):
        ar = self._make()
        assert ar.has_llm_api_key is False


# ─── AddMember ────────────────────────────────────────────────────────────


class TestAddMember:
    def test_defaults_to_viewer(self):
        am = AddMember(user_id=uuid.uuid4())
        assert am.role == "viewer"

    def test_custom_role(self):
        am = AddMember(user_id=uuid.uuid4(), role="editor")
        assert am.role == "editor"

    def test_invalid_role_raises(self):
        with pytest.raises(ValidationError):
            AddMember(user_id=uuid.uuid4(), role="admin")  # type: ignore[arg-type]


# ─── PatchMember ──────────────────────────────────────────────────────────


class TestPatchMember:
    def test_valid_roles(self):
        for role in ("owner", "editor", "viewer"):
            pm = PatchMember(role=role)  # type: ignore[arg-type]
            assert pm.role == role

    def test_invalid_role_raises(self):
        with pytest.raises(ValidationError):
            PatchMember(role="superuser")  # type: ignore[arg-type]
