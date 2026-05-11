"""tests/unit/modules/workspaces/test_schemas.py

Unit tests for workspace Pydantic schemas.

Ported from ``data-api/src/__tests__/unit/schemas/workspace.schema.test.ts``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from telaios.modules.workspaces.schemas import (
    WorkspaceConfig,
    WorkspaceCreate,
    WorkspaceRead,
    WorkspaceUpdate,
)

# ─── WorkspaceConfig ──────────────────────────────────────────────────────


class TestWorkspaceConfig:
    def test_empty_config_valid(self):
        cfg = WorkspaceConfig()
        assert cfg.env_vars is None
        assert cfg.repositories is None

    def test_env_vars_string_values(self):
        cfg = WorkspaceConfig(env_vars={"KEY": "value", "PORT": "8080"})
        assert cfg.env_vars == {"KEY": "value", "PORT": "8080"}

    def test_env_vars_non_string_value_raises(self):
        with pytest.raises(ValidationError):
            WorkspaceConfig(env_vars={"KEY": 123})  # type: ignore[arg-type]

    def test_extra_fields_allowed(self):
        """extra='allow' — unknown fields pass through."""
        cfg = WorkspaceConfig(unknown_future_field="hello")
        assert cfg.model_extra is not None
        assert cfg.model_extra.get("unknown_future_field") == "hello"

    def test_agent_profile_id(self):
        cfg = WorkspaceConfig(agent_profile_id="profile-abc")
        assert cfg.agent_profile_id == "profile-abc"


# ─── WorkspaceCreate ──────────────────────────────────────────────────────


class TestWorkspaceCreate:
    def test_valid_minimal(self):
        wc = WorkspaceCreate(name="my-workspace")
        assert wc.name == "my-workspace"
        assert wc.config is None

    def test_with_config(self):
        wc = WorkspaceCreate(name="ws", config=WorkspaceConfig(env_vars={"A": "B"}))
        assert wc.config is not None
        assert wc.config.env_vars == {"A": "B"}

    def test_empty_name_raises(self):
        with pytest.raises(ValidationError):
            WorkspaceCreate(name="")


# ─── WorkspaceUpdate ──────────────────────────────────────────────────────


class TestWorkspaceUpdate:
    def test_all_none_valid(self):
        wu = WorkspaceUpdate()
        assert wu.name is None
        assert wu.status is None

    def test_valid_status(self):
        wu = WorkspaceUpdate(status="running")
        assert wu.status == "running"

    def test_invalid_status_raises(self):
        with pytest.raises(ValidationError):
            WorkspaceUpdate(status="unknown-status")

    def test_empty_name_raises(self):
        with pytest.raises(ValidationError):
            WorkspaceUpdate(name="")

    def test_model_dump_excludes_none(self):
        wu = WorkspaceUpdate(status="idle")
        dumped = wu.model_dump(exclude_none=True)
        assert "status" in dumped
        assert "name" not in dumped


# ─── WorkspaceRead ────────────────────────────────────────────────────────


class TestWorkspaceRead:
    def _make(self, **kwargs) -> WorkspaceRead:
        defaults = dict(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            name="ws",
            status="idle",
            config={},
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        defaults.update(kwargs)
        return WorkspaceRead(**defaults)

    def test_valid_minimal(self):
        ws = self._make()
        assert ws.status == "idle"
        assert ws.container_id is None
        assert ws.ide_url is None

    def test_all_optional_fields(self):
        ws = self._make(
            container_id="c1",
            container_image="img:latest",
            ide_url="https://ide.example.com",
            ide_workspace_id="ws-123",
            created_by=uuid.uuid4(),
        )
        assert ws.container_id == "c1"
        assert ws.ide_url == "https://ide.example.com"

    def test_invalid_status_raises(self):
        with pytest.raises(ValidationError):
            self._make(status="bad-status")

    def test_from_attributes(self):
        class FakeRow:
            id = uuid.uuid4()
            project_id = uuid.uuid4()
            name = "row-ws"
            status = "running"
            container_id = None
            container_image = None
            ide_url = None
            ide_workspace_id = None
            config: dict = {"env_vars": {"X": "1"}}  # noqa: RUF012
            created_by = None
            created_at = datetime.now(UTC)
            updated_at = datetime.now(UTC)

        ws = WorkspaceRead.model_validate(FakeRow())
        assert ws.name == "row-ws"
        assert ws.status == "running"
