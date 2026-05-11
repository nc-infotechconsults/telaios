"""tests/unit/modules/messages/test_schemas.py

Unit tests for messages module schemas.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from telaios.modules.messages.schemas import (
    MessageCreate,
    MessageRead,
    MessageRole,
)


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


# ── MessageCreate ─────────────────────────────────────────────────────────────


class TestMessageCreate:
    def test_required_fields(self) -> None:
        dto = MessageCreate(role="user", content="Hello")
        assert dto.role == "user"
        assert dto.content == "Hello"
        assert dto.plan_id is None

    def test_missing_role(self) -> None:
        with pytest.raises(ValidationError):
            MessageCreate(content="Hi")  # type: ignore[call-arg]

    def test_missing_content(self) -> None:
        with pytest.raises(ValidationError):
            MessageCreate(role="user")  # type: ignore[call-arg]

    def test_valid_roles(self) -> None:
        for role in ("user", "assistant", "system"):
            dto = MessageCreate(role=role, content="msg")  # type: ignore[arg-type]
            assert dto.role == role

    def test_invalid_role(self) -> None:
        with pytest.raises(ValidationError):
            MessageCreate(role="bot", content="msg")  # type: ignore[arg-type]

    def test_with_plan_id(self) -> None:
        plan_id = uuid.uuid4()
        dto = MessageCreate(role="assistant", content="Sure!", plan_id=plan_id)
        assert dto.plan_id == plan_id

    def test_without_plan_id(self) -> None:
        dto = MessageCreate(role="system", content="Init")
        assert dto.plan_id is None


# ── MessageRead ───────────────────────────────────────────────────────────────


class TestMessageRead:
    def test_from_attributes(self) -> None:
        msg_id = uuid.uuid4()
        project_id = uuid.uuid4()
        mock = _make_message_mock(uid=msg_id, project_id=project_id, role="user", content="Hi")
        read = MessageRead.model_validate(mock)
        assert read.id == msg_id
        assert read.project_id == project_id
        assert read.plan_id is None
        assert read.role == "user"
        assert read.content == "Hi"

    def test_with_plan_id(self) -> None:
        plan_id = uuid.uuid4()
        mock = _make_message_mock(plan_id=plan_id, role="assistant", content="Done")
        read = MessageRead.model_validate(mock)
        assert read.plan_id == plan_id
        assert read.role == "assistant"

    def test_system_message(self) -> None:
        mock = _make_message_mock(role="system", content="You are a helpful agent.")
        read = MessageRead.model_validate(mock)
        assert read.role == "system"
        assert read.content == "You are a helpful agent."

    def test_created_at_preserved(self) -> None:
        now = _now()
        mock = _make_message_mock()
        mock.created_at = now
        read = MessageRead.model_validate(mock)
        assert read.created_at == now

    def test_serialises_uuid_fields(self) -> None:
        mock = _make_message_mock()
        read = MessageRead.model_validate(mock)
        data = read.model_dump()
        assert isinstance(data["id"], uuid.UUID)
        assert isinstance(data["project_id"], uuid.UUID)


# ── MessageRole literal ───────────────────────────────────────────────────────


class TestMessageRoleLiteral:
    def test_all_roles(self) -> None:
        roles: list[MessageRole] = ["user", "assistant", "system"]
        assert len(roles) == 3
