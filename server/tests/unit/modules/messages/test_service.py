"""tests/unit/modules/messages/test_service.py

Unit tests for MessageService.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from telaios.modules.messages.schemas import MessageCreate, MessageRead
from telaios.modules.messages.service import MessageService


def _now() -> datetime:
    return datetime.now(UTC)


def _make_message_mock(
    uid: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    plan_id: uuid.UUID | None = None,
    role: str = "user",
    content: str = "Hello",
) -> MagicMock:
    m = MagicMock()
    m.id = uid or uuid.uuid4()
    m.project_id = project_id or uuid.uuid4()
    m.plan_id = plan_id
    m.role = role
    m.content = content
    m.created_at = _now()
    return m


def _make_service() -> tuple[MessageService, AsyncMock]:
    session = AsyncMock()
    svc = MessageService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ── list_by_project ───────────────────────────────────────────────────────────


class TestListByProject:
    @pytest.mark.asyncio
    async def test_empty(self) -> None:
        svc, repo = _make_service()
        repo.list_by_project.return_value = []
        result = await svc.list_by_project(uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_list(self) -> None:
        svc, repo = _make_service()
        project_id = uuid.uuid4()
        mocks = [_make_message_mock(project_id=project_id, role="user") for _ in range(3)]
        repo.list_by_project.return_value = mocks
        result = await svc.list_by_project(project_id)
        assert len(result) == 3
        assert all(isinstance(r, MessageRead) for r in result)
        repo.list_by_project.assert_awaited_once_with(project_id)

    @pytest.mark.asyncio
    async def test_values_preserved(self) -> None:
        svc, repo = _make_service()
        msg_id = uuid.uuid4()
        mock = _make_message_mock(uid=msg_id, role="assistant", content="Here you go")
        repo.list_by_project.return_value = [mock]
        result = await svc.list_by_project(uuid.uuid4())
        assert result[0].id == msg_id
        assert result[0].role == "assistant"
        assert result[0].content == "Here you go"


# ── list_by_plan ──────────────────────────────────────────────────────────────


class TestListByPlan:
    @pytest.mark.asyncio
    async def test_empty(self) -> None:
        svc, repo = _make_service()
        repo.list_by_plan.return_value = []
        result = await svc.list_by_plan(uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_list(self) -> None:
        svc, repo = _make_service()
        plan_id = uuid.uuid4()
        mocks = [
            _make_message_mock(plan_id=plan_id, role="user"),
            _make_message_mock(plan_id=plan_id, role="assistant"),
        ]
        repo.list_by_plan.return_value = mocks
        result = await svc.list_by_plan(plan_id)
        assert len(result) == 2
        repo.list_by_plan.assert_awaited_once_with(plan_id)

    @pytest.mark.asyncio
    async def test_plan_id_preserved(self) -> None:
        svc, repo = _make_service()
        plan_id = uuid.uuid4()
        mock = _make_message_mock(plan_id=plan_id)
        repo.list_by_plan.return_value = [mock]
        result = await svc.list_by_plan(plan_id)
        assert result[0].plan_id == plan_id


# ── create ────────────────────────────────────────────────────────────────────


class TestCreate:
    @pytest.mark.asyncio
    async def test_creates_user_message(self) -> None:
        svc, repo = _make_service()
        project_id = uuid.uuid4()
        dto = MessageCreate(role="user", content="What is 2+2?")
        mock = _make_message_mock(project_id=project_id, role="user", content="What is 2+2?")
        repo.create.return_value = mock
        result = await svc.create(project_id, dto)
        assert isinstance(result, MessageRead)
        repo.create.assert_awaited_once_with(
            project_id=project_id,
            role="user",
            content="What is 2+2?",
            plan_id=None,
        )

    @pytest.mark.asyncio
    async def test_creates_with_plan_id(self) -> None:
        svc, repo = _make_service()
        project_id = uuid.uuid4()
        plan_id = uuid.uuid4()
        dto = MessageCreate(role="assistant", content="Done!", plan_id=plan_id)
        mock = _make_message_mock(
            project_id=project_id, plan_id=plan_id, role="assistant", content="Done!"
        )
        repo.create.return_value = mock
        result = await svc.create(project_id, dto)
        assert result.plan_id == plan_id
        repo.create.assert_awaited_once_with(
            project_id=project_id,
            role="assistant",
            content="Done!",
            plan_id=plan_id,
        )

    @pytest.mark.asyncio
    async def test_creates_system_message(self) -> None:
        svc, repo = _make_service()
        project_id = uuid.uuid4()
        dto = MessageCreate(role="system", content="You are a coding agent.")
        mock = _make_message_mock(project_id=project_id, role="system")
        repo.create.return_value = mock
        result = await svc.create(project_id, dto)
        assert isinstance(result, MessageRead)
        call_kwargs = repo.create.call_args.kwargs
        assert call_kwargs["role"] == "system"
        assert call_kwargs["content"] == "You are a coding agent."

    @pytest.mark.asyncio
    async def test_returns_message_read(self) -> None:
        svc, repo = _make_service()
        msg_id = uuid.uuid4()
        mock = _make_message_mock(uid=msg_id)
        repo.create.return_value = mock
        result = await svc.create(uuid.uuid4(), MessageCreate(role="user", content="Hi"))
        assert isinstance(result, MessageRead)
        assert result.id == msg_id
