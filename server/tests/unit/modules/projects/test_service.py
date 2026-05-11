"""tests/unit/modules/projects/test_service.py

Unit tests for ProjectService, MemberService, and AgentService.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from telaios.modules.projects.agents.service import AgentService, _maybe_encrypt, _sanitize
from telaios.modules.projects.members.service import MemberService
from telaios.modules.projects.schemas import (
    CreateAgent,
    PatchAgent,
    ProjectCreate,
    ProjectPatch,
    ProjectQuery,
)
from telaios.modules.projects.service import ProjectService
from telaios.utils.errors import NotFoundError

# ─── Helpers ──────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(UTC)


def _make_project_row(
    uid: uuid.UUID | None = None,
    name: str = "Test Project",
    status: str = "planning",
) -> MagicMock:
    row = MagicMock()
    row.id = uid or uuid.uuid4()
    row.name = name
    row.description = None
    row.status = status
    row.created_at = _now()
    return row


def _make_member_row(
    user_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    role: str = "viewer",
) -> MagicMock:
    row = MagicMock()
    row.user_id = user_id or uuid.uuid4()
    row.project_id = project_id or uuid.uuid4()
    row.role = role
    row.joined_at = _now()
    row.user = None
    return row


def _make_agent_row(
    uid: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    name: str = "Coder",
    llm_api_key: str | None = None,
) -> MagicMock:
    row = MagicMock()
    row.id = uid or uuid.uuid4()
    row.project_id = project_id or uuid.uuid4()
    row.library_agent_id = None
    row.name = name
    row.role = "coder"
    row.system_prompt = None
    row.system_prompt_mode = "override"
    row.llm_provider = None
    row.llm_model = None
    row.llm_api_key = llm_api_key
    row.llm_base_url = None
    row.llm_temperature = None
    row.llm_max_tokens = None
    row.sub_agents = []
    row.mcp_servers = []
    row.skills = []
    row.structured_output = None
    row.scope = None
    row.created_at = _now()
    row.updated_at = _now()
    return row


def _make_project_service() -> tuple[ProjectService, AsyncMock]:
    session = AsyncMock()
    svc = ProjectService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


def _make_member_service() -> tuple[MemberService, AsyncMock]:
    session = AsyncMock()
    svc = MemberService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


def _make_agent_service() -> tuple[AgentService, AsyncMock]:
    session = AsyncMock()
    svc = AgentService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ─── _sanitize (agent helper) ─────────────────────────────────────────────


class TestSanitize:
    def test_has_key_true_when_key_set(self):
        row = _make_agent_row(llm_api_key="some-encrypted-value")
        result = _sanitize(row)
        assert result.has_llm_api_key is True

    def test_has_key_false_when_no_key(self):
        row = _make_agent_row(llm_api_key=None)
        result = _sanitize(row)
        assert result.has_llm_api_key is False

    def test_has_key_false_when_empty_string(self):
        row = _make_agent_row(llm_api_key="")
        result = _sanitize(row)
        assert result.has_llm_api_key is False

    def test_strips_llm_api_key_from_output(self):
        row = _make_agent_row(llm_api_key="secret")
        result = _sanitize(row)
        # AgentRead schema has no llm_api_key field — confirm it's absent
        assert not hasattr(result, "llm_api_key")


# ─── _maybe_encrypt ───────────────────────────────────────────────────────


class TestMaybeEncrypt:
    def test_encrypts_key_when_present(self):
        data = {"llm_api_key": "plain-key", "name": "agent"}
        with patch("telaios.modules.projects.agents.service.encrypt", return_value="encrypted"):
            result = _maybe_encrypt(data)
        assert result["llm_api_key"] == "encrypted"

    def test_leaves_data_unchanged_when_no_key(self):
        data = {"name": "agent"}
        result = _maybe_encrypt(data)
        assert result == {"name": "agent"}

    def test_leaves_data_unchanged_when_key_is_none(self):
        data = {"llm_api_key": None, "name": "agent"}
        result = _maybe_encrypt(data)
        assert result["llm_api_key"] is None

    def test_original_dict_not_mutated(self):
        original = {"llm_api_key": "plain", "name": "agent"}
        with patch("telaios.modules.projects.agents.service.encrypt", return_value="enc"):
            result = _maybe_encrypt(original)
        assert original["llm_api_key"] == "plain"
        assert result["llm_api_key"] == "enc"


# ─── ProjectService ───────────────────────────────────────────────────────


class TestProjectServiceList:
    @pytest.mark.asyncio
    async def test_list_returns_paginated_response(self):
        svc, repo = _make_project_service()
        pid1, pid2 = uuid.uuid4(), uuid.uuid4()
        rows = [_make_project_row(uid=pid1), _make_project_row(uid=pid2)]
        repo.list.return_value = (rows, 2)

        result = await svc.list_projects(ProjectQuery(page=1, limit=20))

        assert result.total == 2
        assert result.page == 1
        assert result.limit == 20
        assert len(result.items) == 2

    @pytest.mark.asyncio
    async def test_list_empty(self):
        svc, repo = _make_project_service()
        repo.list.return_value = ([], 0)

        result = await svc.list_projects(ProjectQuery())
        assert result.items == []
        assert result.total == 0


class TestProjectServiceCreate:
    @pytest.mark.asyncio
    async def test_create_without_creator(self):
        svc, repo = _make_project_service()
        row = _make_project_row(name="New")
        repo.create.return_value = row

        result = await svc.create_project(ProjectCreate(name="New"))
        repo.create.assert_awaited_once()
        assert result.name == "New"

    @pytest.mark.asyncio
    async def test_create_adds_creator_as_owner(self):
        svc, repo = _make_project_service()
        creator_id = uuid.uuid4()
        row = _make_project_row(name="P")
        repo.create.return_value = row

        mock_member_svc = AsyncMock()
        with patch(
            "telaios.modules.projects.members.service.MemberService",
            return_value=mock_member_svc,
        ):
            await svc.create_project(ProjectCreate(name="P"), creator_id=creator_id)

        mock_member_svc.add_member.assert_awaited_once_with(row.id, creator_id, role="owner")

    @pytest.mark.asyncio
    async def test_create_with_status(self):
        svc, repo = _make_project_service()
        row = _make_project_row(status="executing")
        repo.create.return_value = row

        await svc.create_project(ProjectCreate(name="P", status="executing"))
        _, kwargs = repo.create.call_args
        assert kwargs["status"] == "executing"


class TestProjectServiceGet:
    @pytest.mark.asyncio
    async def test_get_found(self):
        svc, repo = _make_project_service()
        uid = uuid.uuid4()
        row = _make_project_row(uid=uid)
        repo.find_by_id.return_value = row

        result = await svc.get_project(uid)
        assert result.id == uid

    @pytest.mark.asyncio
    async def test_get_not_found_raises(self):
        svc, repo = _make_project_service()
        repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get_project(uuid.uuid4())


class TestProjectServicePatch:
    @pytest.mark.asyncio
    async def test_patch_name(self):
        svc, repo = _make_project_service()
        uid = uuid.uuid4()
        before = _make_project_row(uid=uid, name="Old")
        after = _make_project_row(uid=uid, name="New")
        repo.find_by_id.return_value = before
        repo.update.return_value = after

        result = await svc.patch_project(uid, ProjectPatch(name="New"))
        assert result.name == "New"
        repo.update.assert_awaited_once_with(before, name="New")

    @pytest.mark.asyncio
    async def test_patch_not_found_raises(self):
        svc, repo = _make_project_service()
        repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await svc.patch_project(uuid.uuid4(), ProjectPatch(name="X"))

    @pytest.mark.asyncio
    async def test_patch_no_fields_skips_update_keys(self):
        """Empty patch still calls repo.update with empty kwargs."""
        svc, repo = _make_project_service()
        uid = uuid.uuid4()
        row = _make_project_row(uid=uid)
        repo.find_by_id.return_value = row
        repo.update.return_value = row

        await svc.patch_project(uid, ProjectPatch())
        _, kwargs = repo.update.call_args
        # No extra fields passed
        assert kwargs == {}


class TestProjectServiceDelete:
    @pytest.mark.asyncio
    async def test_delete_calls_soft_delete(self):
        svc, repo = _make_project_service()
        uid = uuid.uuid4()
        row = _make_project_row(uid=uid)
        repo.find_by_id.return_value = row

        await svc.delete_project(uid)
        repo.soft_delete.assert_awaited_once_with(row)

    @pytest.mark.asyncio
    async def test_delete_not_found_raises(self):
        svc, repo = _make_project_service()
        repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await svc.delete_project(uuid.uuid4())


# ─── MemberService ────────────────────────────────────────────────────────


class TestMemberServiceList:
    @pytest.mark.asyncio
    async def test_list_members(self):
        svc, repo = _make_member_service()
        pid = uuid.uuid4()
        rows = [_make_member_row(project_id=pid), _make_member_row(project_id=pid)]
        repo.list.return_value = rows

        result = await svc.list_members(pid)
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_empty_list(self):
        svc, repo = _make_member_service()
        repo.list.return_value = []
        result = await svc.list_members(uuid.uuid4())
        assert result == []


class TestMemberServiceAdd:
    @pytest.mark.asyncio
    async def test_add_member_upserts_and_returns(self):
        svc, repo = _make_member_service()
        pid, uid = uuid.uuid4(), uuid.uuid4()
        member_row = _make_member_row(user_id=uid, project_id=pid, role="editor")
        repo.find_with_user.return_value = member_row

        result = await svc.add_member(pid, uid, role="editor")
        repo.upsert.assert_awaited_once_with(pid, uid, "editor")
        assert result.role == "editor"

    @pytest.mark.asyncio
    async def test_add_member_not_found_after_upsert_raises(self):
        svc, repo = _make_member_service()
        repo.find_with_user.return_value = None

        with pytest.raises(NotFoundError):
            await svc.add_member(uuid.uuid4(), uuid.uuid4())


class TestMemberServicePatch:
    @pytest.mark.asyncio
    async def test_patch_existing_member(self):
        svc, repo = _make_member_service()
        pid, uid = uuid.uuid4(), uuid.uuid4()
        existing = _make_member_row(user_id=uid, project_id=pid, role="viewer")
        updated = _make_member_row(user_id=uid, project_id=pid, role="editor")
        repo.find.return_value = existing
        repo.find_with_user.return_value = updated

        result = await svc.patch_member(pid, uid, role="editor")
        repo.upsert.assert_awaited_once_with(pid, uid, "editor")
        assert result.role == "editor"

    @pytest.mark.asyncio
    async def test_patch_not_found_raises(self):
        svc, repo = _make_member_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.patch_member(uuid.uuid4(), uuid.uuid4(), role="owner")


class TestMemberServiceRemove:
    @pytest.mark.asyncio
    async def test_remove_calls_delete(self):
        svc, repo = _make_member_service()
        pid, uid = uuid.uuid4(), uuid.uuid4()

        await svc.remove_member(pid, uid)
        repo.delete.assert_awaited_once_with(pid, uid)


# ─── AgentService ─────────────────────────────────────────────────────────


class TestAgentServiceList:
    @pytest.mark.asyncio
    async def test_list_sanitizes_all(self):
        svc, repo = _make_agent_service()
        pid = uuid.uuid4()
        rows = [_make_agent_row(project_id=pid), _make_agent_row(project_id=pid)]
        repo.list.return_value = rows

        result = await svc.list_agents(pid)
        assert len(result) == 2
        for r in result:
            assert r.has_llm_api_key is False


class TestAgentServiceCreate:
    @pytest.mark.asyncio
    async def test_create_agent(self):
        svc, repo = _make_agent_service()
        pid = uuid.uuid4()
        row = _make_agent_row(project_id=pid, name="Bot")
        repo.create.return_value = row

        dto = CreateAgent(name="Bot", role="coder")
        result = await svc.create_agent(pid, dto)
        repo.create.assert_awaited_once()
        assert result.name == "Bot"

    @pytest.mark.asyncio
    async def test_create_agent_encrypts_api_key(self):
        svc, repo = _make_agent_service()
        pid = uuid.uuid4()
        row = _make_agent_row(project_id=pid, llm_api_key="encrypted")
        repo.create.return_value = row

        dto = CreateAgent(name="Bot", role="coder", llm_api_key="my-secret")
        with patch(
            "telaios.modules.projects.agents.service.encrypt", return_value="encrypted"
        ) as mock_enc:
            await svc.create_agent(pid, dto)

        mock_enc.assert_called_once_with("my-secret")


class TestAgentServicePatch:
    @pytest.mark.asyncio
    async def test_patch_agent(self):
        svc, repo = _make_agent_service()
        pid, aid = uuid.uuid4(), uuid.uuid4()
        before = _make_agent_row(uid=aid, project_id=pid, name="Old")
        after = _make_agent_row(uid=aid, project_id=pid, name="New")
        repo.find.return_value = before
        repo.save.return_value = after

        result = await svc.patch_agent(pid, aid, PatchAgent(name="New"))
        assert result.name == "New"

    @pytest.mark.asyncio
    async def test_patch_agent_not_found_raises(self):
        svc, repo = _make_agent_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.patch_agent(uuid.uuid4(), uuid.uuid4(), PatchAgent(name="X"))


class TestAgentServiceDelete:
    @pytest.mark.asyncio
    async def test_delete_calls_repo_delete(self):
        svc, repo = _make_agent_service()
        pid, aid = uuid.uuid4(), uuid.uuid4()

        await svc.delete_agent(pid, aid)
        repo.delete.assert_awaited_once_with(pid, aid)
