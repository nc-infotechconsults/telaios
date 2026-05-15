"""tests/unit/modules/library/test_service.py

Unit tests for LibraryAgentService, LibraryMcpService, LibrarySkillService.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from telaios.modules.library.schemas import (
    LibraryAgentCreate,
    LibraryAgentPatch,
    LibraryAgentQuery,
    LibraryMcpCreate,
    LibraryMcpPatch,
    LibraryMcpQuery,
    LibrarySkillCreate,
    LibrarySkillPatch,
    LibrarySkillQuery,
)
from telaios.modules.library.service import (
    LibraryAgentService,
    LibraryMcpService,
    LibrarySkillService,
    _build_frontmatter,
)
from telaios.utils.errors import ConflictError, NotFoundError


def _now() -> datetime:
    return datetime.now(UTC)


# ─── Row factories ────────────────────────────────────────────────────────


def _make_agent_obj(
    uid: uuid.UUID | None = None,
    slug: str = "my-agent",
    agent_type: str = "custom",
    llm_api_key: str | None = None,
) -> MagicMock:
    obj = MagicMock()
    obj.id = uid or uuid.uuid4()
    obj.name = "My Agent"
    obj.slug = slug
    obj.description = "test"
    obj.agent_type = agent_type
    obj.role = None
    obj.system_prompt = None
    obj.system_prompt_mode = "append"
    obj.llm_provider = None
    obj.llm_model = None
    obj.llm_api_key = llm_api_key
    obj.llm_temperature = None
    obj.llm_max_tokens = None
    obj.sub_agents = []
    obj.mcp_servers = []
    obj.skills = []
    obj.structured_output = None
    obj.tags = []
    obj.is_base = False
    obj.cloned_from_id = None
    obj.published_by = None
    obj.usage_count = 0
    obj.version = "1.0.0"
    obj.created_at = _now()
    obj.updated_at = _now()
    return obj


def _make_mcp_obj(uid: uuid.UUID | None = None, slug: str = "my-mcp") -> MagicMock:
    obj = MagicMock()
    obj.id = uid or uuid.uuid4()
    obj.name = "My MCP"
    obj.slug = slug
    obj.description = None
    obj.transport = "stdio"
    obj.command = "npx"
    obj.args = []
    obj.env = {}
    obj.url = None
    obj.headers = {}
    obj.tags = []
    obj.published_by = None
    obj.usage_count = 0
    obj.version = "1.0.0"
    obj.created_at = _now()
    obj.updated_at = _now()
    return obj


def _make_skill_obj(uid: uuid.UUID | None = None, slug: str = "my-skill") -> MagicMock:
    obj = MagicMock()
    obj.id = uid or uuid.uuid4()
    obj.name = "My Skill"
    obj.slug = slug
    obj.description = "A skill"
    obj.content = "# Instructions"
    obj.tags = []
    obj.published_by = None
    obj.usage_count = 0
    obj.version = "1.0.0"
    obj.license = None
    obj.compatibility = None
    obj.skill_metadata = None
    obj.files = []
    obj.created_at = _now()
    obj.updated_at = _now()
    return obj


def _make_skill_file_obj(skill_id: uuid.UUID, path: str = "scripts/run.sh") -> MagicMock:
    f = MagicMock()
    f.id = uuid.uuid4()
    f.path = path
    f.content = "#!/bin/bash\necho hello"
    return f


# ─── Service factories ────────────────────────────────────────────────────


def _make_agent_service() -> tuple[LibraryAgentService, AsyncMock]:
    session = AsyncMock()
    svc = LibraryAgentService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


def _make_mcp_service() -> tuple[LibraryMcpService, AsyncMock]:
    session = AsyncMock()
    svc = LibraryMcpService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


def _make_skill_service() -> tuple[LibrarySkillService, AsyncMock]:
    session = AsyncMock()
    svc = LibrarySkillService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ═══════════════════════════════════════════════════════════════════════════
# LibraryAgentService
# ═══════════════════════════════════════════════════════════════════════════


class TestLibraryAgentServiceList:
    @pytest.mark.asyncio
    @patch("telaios.utils.crypto.decrypt", return_value=None)
    async def test_returns_page(self, mock_decrypt):
        svc, repo = _make_agent_service()
        obj = _make_agent_obj()
        repo.list.return_value = ([obj], 1)

        query = LibraryAgentQuery()
        result = await svc.list(query)

        repo.list.assert_awaited_once_with(q=None, role=None, tags=None, page=1, limit=20)
        assert result.total == 1
        assert len(result.items) == 1
        assert result.page == 1
        assert result.limit == 20

    @pytest.mark.asyncio
    @patch("telaios.utils.crypto.decrypt", return_value=None)
    async def test_passes_query_params(self, mock_decrypt):
        svc, repo = _make_agent_service()
        repo.list.return_value = ([], 0)

        query = LibraryAgentQuery(q="coder", role="developer", tags="python", page=2, limit=5)
        await svc.list(query)

        repo.list.assert_awaited_once_with(
            q="coder", role="developer", tags="python", page=2, limit=5
        )


class TestLibraryAgentServiceGet:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_agent_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get(uuid.uuid4())

    @pytest.mark.asyncio
    @patch("telaios.utils.crypto.decrypt", return_value=None)
    async def test_found_returns_read(self, mock_decrypt):
        svc, repo = _make_agent_service()
        obj = _make_agent_obj()
        repo.find.return_value = obj

        result = await svc.get(obj.id)
        assert result.slug == "my-agent"


class TestLibraryAgentServiceGetBySlug:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_agent_service()
        repo.find_by_slug.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get_by_slug("missing-slug")

    @pytest.mark.asyncio
    @patch("telaios.utils.crypto.decrypt", return_value=None)
    async def test_found_returns_read(self, mock_decrypt):
        svc, repo = _make_agent_service()
        obj = _make_agent_obj(slug="target-slug")
        repo.find_by_slug.return_value = obj

        result = await svc.get_by_slug("target-slug")
        assert result.slug == "target-slug"


class TestLibraryAgentServiceCreate:
    @pytest.mark.asyncio
    async def test_conflict_on_duplicate_slug(self):
        svc, repo = _make_agent_service()
        repo.find_by_slug.return_value = _make_agent_obj()

        dto = LibraryAgentCreate(name="Agent", slug="my-agent")
        with pytest.raises(ConflictError):
            await svc.create(dto)

    @pytest.mark.asyncio
    @patch("telaios.utils.crypto.decrypt", return_value=None)
    @patch("telaios.modules.library.service.encrypt", return_value="enc_key")
    async def test_encrypts_api_key(self, mock_enc, mock_decrypt):
        svc, repo = _make_agent_service()
        repo.find_by_slug.return_value = None
        obj = _make_agent_obj()
        repo.create.return_value = obj

        dto = LibraryAgentCreate(name="Agent", slug="new-agent", llm_api_key="sk-raw")
        await svc.create(dto)

        mock_enc.assert_called_once_with("sk-raw")
        call_kwargs = repo.create.call_args[1]
        assert call_kwargs["llm_api_key"] == "enc_key"

    @pytest.mark.asyncio
    @patch("telaios.utils.crypto.decrypt", return_value=None)
    async def test_sets_agent_type_custom(self, mock_decrypt):
        svc, repo = _make_agent_service()
        repo.find_by_slug.return_value = None
        obj = _make_agent_obj()
        repo.create.return_value = obj

        dto = LibraryAgentCreate(name="Agent", slug="a-slug")
        await svc.create(dto)

        call_kwargs = repo.create.call_args[1]
        assert call_kwargs["agent_type"] == "custom"

    @pytest.mark.asyncio
    @patch("telaios.utils.crypto.decrypt", return_value=None)
    async def test_sets_published_by(self, mock_decrypt):
        svc, repo = _make_agent_service()
        repo.find_by_slug.return_value = None
        obj = _make_agent_obj()
        repo.create.return_value = obj

        dto = LibraryAgentCreate(name="Agent", slug="a-slug")
        await svc.create(dto, published_by="user@example.com")

        call_kwargs = repo.create.call_args[1]
        assert call_kwargs["published_by"] == "user@example.com"


class TestLibraryAgentServicePatch:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_agent_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.patch(uuid.uuid4(), LibraryAgentPatch(name="X"))

    @pytest.mark.asyncio
    @patch("telaios.utils.crypto.decrypt", return_value=None)
    async def test_system_agent_type_stays_system(self, mock_decrypt):
        svc, repo = _make_agent_service()
        obj = _make_agent_obj(agent_type="system")
        repo.find.return_value = obj
        repo.save.return_value = obj

        await svc.patch(obj.id, LibraryAgentPatch(name="Updated"))
        assert obj.agent_type == "system"

    @pytest.mark.asyncio
    @patch("telaios.utils.crypto.decrypt", return_value=None)
    @patch("telaios.modules.library.service.encrypt", return_value="enc_key")
    async def test_encrypts_api_key_in_patch(self, mock_enc, mock_decrypt):
        svc, repo = _make_agent_service()
        obj = _make_agent_obj()
        repo.find.return_value = obj
        repo.save.return_value = obj

        await svc.patch(obj.id, LibraryAgentPatch(llm_api_key="new-raw-key"))

        mock_enc.assert_called_once_with("new-raw-key")


class TestLibraryAgentServiceDelete:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_agent_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.delete(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_soft_delete_called(self):
        svc, repo = _make_agent_service()
        obj = _make_agent_obj()
        repo.find.return_value = obj

        await svc.delete(obj.id)
        repo.soft_delete.assert_awaited_once_with(obj)


class TestLibraryAgentServiceIncrementUsage:
    @pytest.mark.asyncio
    async def test_delegates_to_repo(self):
        svc, repo = _make_agent_service()
        repo.increment_usage.return_value = True
        aid = uuid.uuid4()

        result = await svc.increment_usage(aid)

        repo.increment_usage.assert_awaited_once_with(aid)
        assert result is True


# ═══════════════════════════════════════════════════════════════════════════
# LibraryMcpService
# ═══════════════════════════════════════════════════════════════════════════


class TestLibraryMcpServiceList:
    @pytest.mark.asyncio
    async def test_returns_page(self):
        svc, repo = _make_mcp_service()
        obj = _make_mcp_obj()
        repo.list.return_value = ([obj], 1)

        result = await svc.list(LibraryMcpQuery())
        assert result.total == 1
        assert result.page == 1

    @pytest.mark.asyncio
    async def test_passes_query_params(self):
        svc, repo = _make_mcp_service()
        repo.list.return_value = ([], 0)

        await svc.list(LibraryMcpQuery(q="filesystem", tags="tools", page=2, limit=10))
        repo.list.assert_awaited_once_with(q="filesystem", tags="tools", page=2, limit=10)


class TestLibraryMcpServiceGet:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_mcp_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_found_returns_read(self):
        svc, repo = _make_mcp_service()
        obj = _make_mcp_obj()
        repo.find.return_value = obj

        result = await svc.get(obj.id)
        assert result.slug == "my-mcp"


class TestLibraryMcpServiceCreate:
    @pytest.mark.asyncio
    async def test_conflict_on_duplicate_slug(self):
        svc, repo = _make_mcp_service()
        repo.find_by_slug.return_value = _make_mcp_obj()

        with pytest.raises(ConflictError):
            await svc.create(LibraryMcpCreate(name="MCP", slug="my-mcp"))

    @pytest.mark.asyncio
    async def test_creates_successfully(self):
        svc, repo = _make_mcp_service()
        repo.find_by_slug.return_value = None
        obj = _make_mcp_obj()
        repo.create.return_value = obj

        result = await svc.create(LibraryMcpCreate(name="MCP", slug="new-mcp"))
        assert result.slug == "my-mcp"

    @pytest.mark.asyncio
    async def test_sets_published_by(self):
        svc, repo = _make_mcp_service()
        repo.find_by_slug.return_value = None
        obj = _make_mcp_obj()
        repo.create.return_value = obj

        await svc.create(LibraryMcpCreate(name="MCP", slug="new-mcp"), published_by="admin")
        call_kwargs = repo.create.call_args[1]
        assert call_kwargs["published_by"] == "admin"


class TestLibraryMcpServicePatch:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_mcp_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.patch(uuid.uuid4(), LibraryMcpPatch(name="X"))

    @pytest.mark.asyncio
    async def test_patches_field(self):
        svc, repo = _make_mcp_service()
        obj = _make_mcp_obj()
        repo.find.return_value = obj
        repo.save.return_value = obj

        await svc.patch(obj.id, LibraryMcpPatch(name="Updated"))
        assert obj.name == "Updated"


class TestLibraryMcpServiceDelete:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_mcp_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.delete(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_soft_delete_called(self):
        svc, repo = _make_mcp_service()
        obj = _make_mcp_obj()
        repo.find.return_value = obj

        await svc.delete(obj.id)
        repo.soft_delete.assert_awaited_once_with(obj)


# ═══════════════════════════════════════════════════════════════════════════
# LibrarySkillService
# ═══════════════════════════════════════════════════════════════════════════


class TestLibrarySkillServiceList:
    @pytest.mark.asyncio
    async def test_returns_page(self):
        svc, repo = _make_skill_service()
        obj = _make_skill_obj()
        repo.paginate.return_value = ([obj], 1)

        result = await svc.list(LibrarySkillQuery())
        assert result.total == 1
        assert result.items[0].slug == "my-skill"

    @pytest.mark.asyncio
    async def test_passes_query_params(self):
        svc, repo = _make_skill_service()
        repo.paginate.return_value = ([], 0)

        await svc.list(LibrarySkillQuery(q="data", tags="etl", page=3, limit=5))
        repo.paginate.assert_awaited_once_with(q="data", tags="etl", page=3, limit=5)


class TestLibrarySkillServiceGet:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_skill_service()
        repo.find_with_files.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_found_includes_files(self):
        svc, repo = _make_skill_service()
        skill_id = uuid.uuid4()
        obj = _make_skill_obj(uid=skill_id)
        fobj = _make_skill_file_obj(skill_id)
        obj.files = [fobj]
        repo.find_with_files.return_value = obj

        result = await svc.get(skill_id)
        assert result.files is not None
        assert len(result.files) == 1
        assert result.files[0].path == "scripts/run.sh"


class TestLibrarySkillServiceCreate:
    @pytest.mark.asyncio
    async def test_conflict_on_duplicate_slug(self):
        svc, repo = _make_skill_service()
        repo.find_by_slug.return_value = _make_skill_obj()

        with pytest.raises(ConflictError):
            await svc.create(
                LibrarySkillCreate(name="Skill", slug="my-skill", content="# Instructions")
            )

    @pytest.mark.asyncio
    async def test_creates_without_files(self):
        svc, repo = _make_skill_service()
        repo.find_by_slug.return_value = None
        obj = _make_skill_obj()
        repo.create.return_value = obj
        repo.find_with_files.return_value = obj

        result = await svc.create(
            LibrarySkillCreate(name="Skill", slug="new-skill", content="# Instructions")
        )
        assert result.slug == "my-skill"
        repo.find_with_files.assert_awaited()

    @pytest.mark.asyncio
    async def test_creates_with_files(self):
        svc, repo = _make_skill_service()
        repo.find_by_slug.return_value = None
        skill_id = uuid.uuid4()
        obj = _make_skill_obj(uid=skill_id)
        fobj = _make_skill_file_obj(skill_id)
        obj.files = [fobj]
        repo.create.return_value = obj
        repo.find_with_files.return_value = obj
        repo.list_active_files.return_value = []

        from telaios.modules.library.schemas import SkillFileDto

        dto = LibrarySkillCreate(
            name="Skill",
            slug="new-skill",
            content="# Instructions",
            files=[SkillFileDto(path="scripts/run.sh", content="#!/bin/bash")],
        )
        await svc.create(dto)
        repo.create_file.assert_awaited_once()


class TestLibrarySkillServicePatch:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_skill_service()
        repo.find_with_files.return_value = None

        with pytest.raises(NotFoundError):
            await svc.patch(uuid.uuid4(), LibrarySkillPatch(name="X"))

    @pytest.mark.asyncio
    async def test_patches_field(self):
        svc, repo = _make_skill_service()
        obj = _make_skill_obj()
        repo.find_with_files.return_value = obj
        repo.save.return_value = obj

        await svc.patch(obj.id, LibrarySkillPatch(name="Updated"))
        assert obj.name == "Updated"


class TestLibrarySkillServiceDelete:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_skill_service()
        repo.find_with_files.return_value = None

        with pytest.raises(NotFoundError):
            await svc.delete(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_soft_delete_called(self):
        svc, repo = _make_skill_service()
        obj = _make_skill_obj()
        repo.find_with_files.return_value = obj

        await svc.delete(obj.id)
        repo.soft_delete.assert_awaited_once_with(obj)


class TestLibrarySkillServiceExportAsZip:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_skill_service()
        repo.find_with_files.return_value = None

        with pytest.raises(NotFoundError):
            await svc.export_as_zip(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_returns_zip_bytes_and_slug(self):
        svc, repo = _make_skill_service()
        obj = _make_skill_obj(slug="data-processor")
        obj.files = []
        obj.content = "# Process data"
        repo.find_with_files.return_value = obj

        zip_bytes, slug = await svc.export_as_zip(obj.id)

        assert isinstance(zip_bytes, bytes)
        assert slug == "data-processor"
        # Verify it's a valid zip
        import io
        import zipfile

        buf = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(buf, "r") as zf:
            names = zf.namelist()
        assert "data-processor/SKILL.md" in names

    @pytest.mark.asyncio
    async def test_includes_skill_files_in_zip(self):
        svc, repo = _make_skill_service()
        skill_id = uuid.uuid4()
        obj = _make_skill_obj(uid=skill_id, slug="my-skill")
        fobj = _make_skill_file_obj(skill_id, path="scripts/run.sh")
        obj.files = [fobj]
        repo.find_with_files.return_value = obj

        zip_bytes, _slug = await svc.export_as_zip(skill_id)

        import io
        import zipfile

        buf = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(buf, "r") as zf:
            names = zf.namelist()
        assert "my-skill/scripts/run.sh" in names


# ─── _build_frontmatter ───────────────────────────────────────────────────


class TestBuildFrontmatter:
    def test_includes_name_and_description(self):
        obj = _make_skill_obj(slug="my-skill")
        result = _build_frontmatter(obj)
        assert "name: my-skill" in result
        assert "description: A skill" in result
        assert result.startswith("---")

    def test_includes_license_if_present(self):
        obj = _make_skill_obj()
        obj.license = "MIT"
        result = _build_frontmatter(obj)
        assert "license: MIT" in result

    def test_no_license_if_none(self):
        obj = _make_skill_obj()
        obj.license = None
        result = _build_frontmatter(obj)
        assert "license" not in result

    def test_includes_metadata(self):
        obj = _make_skill_obj()
        obj.skill_metadata = {"author": "alice"}
        result = _build_frontmatter(obj)
        assert "author: alice" in result
