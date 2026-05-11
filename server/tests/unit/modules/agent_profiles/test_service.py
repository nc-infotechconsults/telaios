"""tests/unit/modules/agent_profiles/test_service.py

Unit tests for AgentProfileService and _sanitize helper.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from telaios.modules.agent_profiles.schemas import (
    AgentProfileSkill,
    CreateAgentProfileDto,
    PatchAgentProfileDto,
)
from telaios.modules.agent_profiles.service import AgentProfileService, _sanitize
from telaios.utils.errors import NotFoundError


def _now() -> datetime:
    return datetime.now(UTC)


def _make_agent_obj(
    uid: uuid.UUID | None = None,
    name: str = "Test Agent",
    agent_type: str = "custom",
    system_prompt_mode: str = "override",
    llm_api_key: str | None = None,
    sub_agents: list | None = None,
) -> MagicMock:
    obj = MagicMock(
        spec=[
            "id",
            "name",
            "description",
            "agent_type",
            "llm_provider",
            "llm_model",
            "llm_api_key",
            "llm_temperature",
            "llm_max_tokens",
            "system_prompt",
            "system_prompt_mode",
            "sub_agents",
            "structured_output",
            "mcp_servers",
            "skills",
            "created_at",
            "updated_at",
        ]
    )
    obj.id = uid or uuid.uuid4()
    obj.name = name
    obj.description = "A test agent"
    obj.agent_type = agent_type
    obj.llm_provider = None
    obj.llm_model = None
    obj.llm_api_key = llm_api_key
    obj.llm_temperature = None
    obj.llm_max_tokens = None
    obj.system_prompt = None
    obj.system_prompt_mode = system_prompt_mode
    obj.sub_agents = sub_agents if sub_agents is not None else []
    obj.structured_output = None
    obj.mcp_servers = []
    obj.skills = []
    obj.created_at = _now()
    obj.updated_at = _now()
    return obj


def _make_service() -> tuple[AgentProfileService, AsyncMock]:
    session = AsyncMock()
    svc = AgentProfileService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ── _sanitize ─────────────────────────────────────────────────────────────


class TestSanitize:
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    def test_no_api_key_has_llm_api_key_false(self, mock_decrypt):
        obj = _make_agent_obj()
        result = _sanitize(obj)
        assert result.has_llm_api_key is False

    @patch("telaios.modules.agent_profiles.service.decrypt", return_value="raw-key")
    def test_with_api_key_has_llm_api_key_true(self, mock_dec):
        obj = _make_agent_obj(llm_api_key="enc_key")
        result = _sanitize(obj)
        mock_dec.assert_called_once_with("enc_key")
        assert result.has_llm_api_key is True

    @patch("telaios.modules.agent_profiles.service.decrypt", return_value="")
    def test_empty_decrypt_is_false(self, mock_decrypt):
        obj = _make_agent_obj(llm_api_key="enc")
        result = _sanitize(obj)
        assert result.has_llm_api_key is False

    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    def test_mode_append_maps_to_extend(self, mock_decrypt):
        obj = _make_agent_obj(system_prompt_mode="append")
        result = _sanitize(obj)
        assert result.system_prompt_mode == "extend"

    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    def test_mode_override_stays_override(self, mock_decrypt):
        obj = _make_agent_obj(system_prompt_mode="override")
        result = _sanitize(obj)
        assert result.system_prompt_mode == "override"

    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    def test_has_github_token_always_false(self, mock_decrypt):
        obj = _make_agent_obj()
        result = _sanitize(obj)
        assert result.has_github_token is False

    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    def test_sub_agents_ids_extracted(self, mock_decrypt):
        aid1 = uuid.uuid4()
        aid2 = uuid.uuid4()
        obj = _make_agent_obj(
            sub_agents=[
                {"agent_id": str(aid1), "tool_name": "t1", "tool_description": "d1"},
                {"agent_id": str(aid2), "tool_name": "t2", "tool_description": "d2"},
            ]
        )
        result = _sanitize(obj)
        assert len(result.sub_agent_ids) == 2
        assert aid1 in result.sub_agent_ids
        assert aid2 in result.sub_agent_ids

    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    def test_sub_agent_missing_agent_id_skipped(self, mock_decrypt):
        obj = _make_agent_obj(sub_agents=[{"tool_name": "t", "tool_description": "d"}])
        result = _sanitize(obj)
        assert result.sub_agent_ids == []

    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    def test_does_not_expose_raw_api_key(self, mock_decrypt):
        obj = _make_agent_obj(llm_api_key="enc")
        result = _sanitize(obj)
        assert not hasattr(result, "llm_api_key")


# ── AgentProfileService.get ───────────────────────────────────────────────


class TestAgentProfileServiceGet:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get(uuid.uuid4())

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_found_returns_sanitized(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj(name="Agent X")
        repo.find.return_value = obj

        result = await svc.get(obj.id)
        assert result.name == "Agent X"
        assert result.has_github_token is False


# ── AgentProfileService.create ────────────────────────────────────────────


class TestAgentProfileServiceCreate:
    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_creates_with_slug(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj(name="New Agent")
        repo.create.return_value = obj

        dto = CreateAgentProfileDto(name="New Agent")
        await svc.create(dto)

        call_kwargs = repo.create.call_args[1]
        assert "slug" in call_kwargs
        assert "new-agent" in call_kwargs["slug"]  # slug includes name

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.encrypt", return_value="enc_key")
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_encrypts_api_key(self, mock_decrypt, mock_enc):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.create.return_value = obj

        dto = CreateAgentProfileDto(name="Agent", llm_api_key="sk-raw")
        await svc.create(dto)

        mock_enc.assert_called_once_with("sk-raw")
        call_kwargs = repo.create.call_args[1]
        assert call_kwargs["llm_api_key"] == "enc_key"

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_sets_agent_type_custom(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.create.return_value = obj

        await svc.create(CreateAgentProfileDto(name="Agent"))

        call_kwargs = repo.create.call_args[1]
        assert call_kwargs["agent_type"] == "custom"

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_mode_extend_maps_to_append(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.create.return_value = obj

        dto = CreateAgentProfileDto(name="Agent", system_prompt_mode="extend")
        await svc.create(dto)

        call_kwargs = repo.create.call_args[1]
        assert call_kwargs["system_prompt_mode"] == "append"

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_mode_override_stays_override(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.create.return_value = obj

        dto = CreateAgentProfileDto(name="Agent", system_prompt_mode="override")
        await svc.create(dto)

        call_kwargs = repo.create.call_args[1]
        assert call_kwargs["system_prompt_mode"] == "override"

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_sub_agent_ids_converted(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.create.return_value = obj
        aid = uuid.uuid4()

        dto = CreateAgentProfileDto(name="Agent", sub_agent_ids=[aid])
        await svc.create(dto)

        call_kwargs = repo.create.call_args[1]
        sub_agents = call_kwargs["sub_agents"]
        assert len(sub_agents) == 1
        assert sub_agents[0]["agent_id"] == str(aid)

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_skills_mapped_to_dicts(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.create.return_value = obj

        dto = CreateAgentProfileDto(
            name="Agent",
            skills=[
                AgentProfileSkill(name="coder", description="writes code", instructions="# Do X")
            ],
        )
        await svc.create(dto)

        call_kwargs = repo.create.call_args[1]
        skills = call_kwargs["skills"]
        assert len(skills) == 1
        assert skills[0]["name"] == "coder"
        assert skills[0]["content"] == "# Do X"


# ── AgentProfileService.patch ─────────────────────────────────────────────


class TestAgentProfileServicePatch:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.patch(uuid.uuid4(), PatchAgentProfileDto(name="X"))

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_patches_name(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.find.return_value = obj
        repo.save.return_value = obj

        await svc.patch(obj.id, PatchAgentProfileDto(name="Updated"))
        assert obj.name == "Updated"

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.encrypt", return_value="enc")
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_encrypts_api_key_in_patch(self, mock_decrypt, mock_enc):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.find.return_value = obj
        repo.save.return_value = obj

        await svc.patch(obj.id, PatchAgentProfileDto(llm_api_key="new-raw"))
        mock_enc.assert_called_once_with("new-raw")

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_mode_extend_maps_to_append(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.find.return_value = obj
        repo.save.return_value = obj

        await svc.patch(obj.id, PatchAgentProfileDto(system_prompt_mode="extend"))
        assert obj.system_prompt_mode == "append"

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_mode_override_stays_override(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.find.return_value = obj
        repo.save.return_value = obj

        await svc.patch(obj.id, PatchAgentProfileDto(system_prompt_mode="override"))
        assert obj.system_prompt_mode == "override"

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_sub_agent_ids_converted(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.find.return_value = obj
        repo.save.return_value = obj
        aid = uuid.uuid4()

        await svc.patch(obj.id, PatchAgentProfileDto(sub_agent_ids=[aid]))
        assert obj.sub_agents == [{"agent_id": str(aid), "tool_name": "", "tool_description": ""}]

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_skills_mapped_in_patch(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.find.return_value = obj
        repo.save.return_value = obj

        await svc.patch(
            obj.id,
            PatchAgentProfileDto(
                skills=[
                    AgentProfileSkill(
                        name="coder", description="writes code", instructions="# Do X"
                    )
                ]
            ),
        )
        # model_dump() converts Pydantic objects to plain dicts; patch iterates
        # updates["skills"] which are already plain dicts, so the field stays
        # as "instructions" (the raw dict key from AgentProfileSkill.model_dump())
        skill = obj.skills[0]
        assert skill["name"] == "coder"
        assert skill["instructions"] == "# Do X"


# ── AgentProfileService.delete ────────────────────────────────────────────


class TestAgentProfileServiceDelete:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.delete(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_soft_delete_called(self):
        svc, repo = _make_service()
        obj = _make_agent_obj()
        repo.find.return_value = obj

        await svc.delete(obj.id)
        repo.soft_delete.assert_awaited_once_with(obj)


# ── AgentProfileService.list ──────────────────────────────────────────────


class TestAgentProfileServiceList:
    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_returns_list(self, mock_decrypt):
        svc, repo = _make_service()
        obj1 = _make_agent_obj(name="Alpha")
        obj2 = _make_agent_obj(name="Beta")

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [obj1, obj2]
        repo._s.execute = AsyncMock(return_value=mock_result)

        result = await svc.list()
        assert len(result) == 2
        assert result[0].name == "Alpha"
        assert result[1].name == "Beta"

    @pytest.mark.asyncio
    @patch("telaios.modules.agent_profiles.service.decrypt", return_value=None)
    async def test_empty_list(self, mock_decrypt):
        svc, repo = _make_service()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        repo._s.execute = AsyncMock(return_value=mock_result)

        result = await svc.list()
        assert result == []
