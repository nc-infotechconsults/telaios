"""Unit tests for AgentOverrideService._resolve().

Tests the three-layer resolution logic in isolation (no DB required).
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from telaios.modules.agent_overrides.schemas import (
    AgentBaseProfileRead,
    AgentOverrideRead,
    ResolvedAgentProfile,
)
from telaios.modules.agent_overrides.service import AgentOverrideService


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _base(
    role: str = "coder",
    llm_provider: str = "openai",
    llm_model: str = "gpt-4o",
    system_prompt: str = "Default prompt",
    system_prompt_mode: str = "append",
    llm_temperature: float = 0.1,
) -> AgentBaseProfileRead:
    return AgentBaseProfileRead(
        id=uuid.uuid4(),
        role=role,
        name="Coder",
        description="Writes code.",
        dispatch="workflow",
        system_prompt=system_prompt,
        system_prompt_mode=system_prompt_mode,  # type: ignore[arg-type]
        llm_provider=llm_provider,
        llm_model=llm_model,
        llm_temperature=llm_temperature,
        llm_max_tokens=None,
        llm_top_p=None,
        llm_frequency_penalty=None,
        llm_presence_penalty=None,
        mcp_servers=[],
        skills=[],
    )


def _override(
    base_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
    **kwargs,
) -> AgentOverrideRead:
    defaults = dict(
        system_prompt=None,
        system_prompt_mode=None,
        llm_provider=None,
        llm_model=None,
        llm_temperature=None,
        llm_max_tokens=None,
        llm_top_p=None,
        llm_frequency_penalty=None,
        llm_presence_penalty=None,
        mcp_servers=None,
        skills=None,
    )
    defaults.update(kwargs)
    return AgentOverrideRead(
        id=uuid.uuid4(),
        base_profile_id=base_id,
        project_id=project_id,
        **defaults,
    )


def _svc() -> AgentOverrideService:
    return AgentOverrideService(session=MagicMock())  # type: ignore[arg-type]


# ─── _resolve: base-only (no overrides) ──────────────────────────────────────

def test_resolve_base_only_returns_base_values() -> None:
    base = _base(llm_provider="openai", llm_model="gpt-4o", llm_temperature=0.1)
    result = _svc()._resolve(base, None, None)

    assert isinstance(result, ResolvedAgentProfile)
    assert result.llm_provider == "openai"
    assert result.llm_model == "gpt-4o"
    assert result.llm_temperature == 0.1
    assert result.override_scope == "base"
    assert result.override_id is None
    assert result.overridden_fields == []


# ─── _resolve: workspace override ────────────────────────────────────────────

def test_resolve_workspace_override_replaces_llm_model() -> None:
    base = _base(llm_model="gpt-4o", llm_temperature=0.1)
    ws_ov = _override(base.id, llm_model="claude-opus-4-7")
    result = _svc()._resolve(base, ws_ov, None)

    assert result.llm_model == "claude-opus-4-7"
    assert result.llm_provider == "openai"  # not overridden → falls back to base
    assert result.override_scope == "workspace"
    assert result.override_id == ws_ov.id
    assert "llm_model" in result.overridden_fields
    assert "llm_provider" not in result.overridden_fields


def test_resolve_workspace_override_replaces_system_prompt() -> None:
    base = _base(system_prompt="Default", system_prompt_mode="append")
    ws_ov = _override(base.id, system_prompt="Custom", system_prompt_mode="override")
    result = _svc()._resolve(base, ws_ov, None)

    assert result.system_prompt == "Custom"
    assert result.system_prompt_mode == "override"
    assert "system_prompt" in result.overridden_fields
    assert "system_prompt_mode" in result.overridden_fields


# ─── _resolve: project override wins over workspace ──────────────────────────

def test_resolve_project_override_wins_over_workspace() -> None:
    proj_id = uuid.uuid4()
    base = _base(llm_model="gpt-4o")
    ws_ov = _override(base.id, llm_model="claude-opus-4-7")
    proj_ov = _override(base.id, project_id=proj_id, llm_model="gpt-4o-mini")
    result = _svc()._resolve(base, ws_ov, proj_ov)

    assert result.llm_model == "gpt-4o-mini"
    assert result.override_scope == "project"
    assert result.override_id == proj_ov.id
    assert "llm_model" in result.overridden_fields


def test_resolve_project_override_partial_falls_back_to_workspace() -> None:
    """Project sets temperature only; model should come from workspace override."""
    proj_id = uuid.uuid4()
    base = _base(llm_model="gpt-4o", llm_temperature=0.1)
    ws_ov = _override(base.id, llm_model="claude-opus-4-7")
    proj_ov = _override(base.id, project_id=proj_id, llm_temperature=0.9)
    result = _svc()._resolve(base, ws_ov, proj_ov)

    assert result.llm_model == "claude-opus-4-7"  # from workspace
    assert result.llm_temperature == 0.9          # from project
    assert result.override_scope == "project"
    assert "llm_model" in result.overridden_fields
    assert "llm_temperature" in result.overridden_fields


# ─── _resolve: overridden_fields accuracy ────────────────────────────────────

def test_resolve_no_overridden_fields_when_all_null() -> None:
    base = _base()
    ws_ov = _override(base.id)  # all fields null
    result = _svc()._resolve(base, ws_ov, None)

    assert result.overridden_fields == []


def test_resolve_multiple_overridden_fields_reported() -> None:
    base = _base(llm_model="gpt-4o", llm_temperature=0.1, system_prompt="X")
    ws_ov = _override(
        base.id,
        llm_model="claude-opus-4-7",
        llm_temperature=0.5,
        system_prompt="Y",
    )
    result = _svc()._resolve(base, ws_ov, None)

    assert set(result.overridden_fields) == {"llm_model", "llm_temperature", "system_prompt"}
