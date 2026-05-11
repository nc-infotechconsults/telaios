"""tests/unit/modules/skills/test_schemas.py

Unit tests for skills module Pydantic schemas:
  SkillSummary, SkillDetail, SearchResponse, ReloadResponse,
  InstallRequest, InstallResponse
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from telaios.modules.skills.schemas import (
    InstallRequest,
    InstallResponse,
    ReloadResponse,
    SearchResponse,
    SkillDetail,
    SkillSummary,
)

# ── SkillSummary ──────────────────────────────────────────────────────────────


class TestSkillSummary:
    def test_basic(self) -> None:
        s = SkillSummary(
            name="my-skill",
            description="Does things",
            version="1.0.0",
            tags=["ai", "tools"],
        )
        assert s.name == "my-skill"
        assert s.version == "1.0.0"
        assert s.tags == ["ai", "tools"]
        assert s.author is None
        assert s.script_count == 0

    def test_with_author_and_scripts(self) -> None:
        s = SkillSummary(
            name="skill",
            description="desc",
            version="2.0",
            tags=[],
            author="Alice",
            script_count=3,
        )
        assert s.author == "Alice"
        assert s.script_count == 3

    def test_tags_empty_list(self) -> None:
        s = SkillSummary(name="s", description="d", version="0.1", tags=[])
        assert s.tags == []


# ── SkillDetail ───────────────────────────────────────────────────────────────


class TestSkillDetail:
    def test_inherits_summary_fields(self) -> None:
        d = SkillDetail(
            name="skill",
            description="desc",
            version="1.0",
            tags=["code"],
            instructions="Do this then that.",
            scripts=[{"name": "run.sh", "path": "/skills/skill/run.sh"}],
            root_path="/skills/skill",
        )
        assert d.name == "skill"
        assert d.instructions == "Do this then that."
        assert len(d.scripts) == 1
        assert d.root_path == "/skills/skill"

    def test_scripts_can_be_empty(self) -> None:
        d = SkillDetail(
            name="s",
            description="d",
            version="0",
            tags=[],
            instructions="x",
            scripts=[],
            root_path="/",
        )
        assert d.scripts == []


# ── SearchResponse ────────────────────────────────────────────────────────────


class TestSearchResponse:
    def test_basic(self) -> None:
        summary = SkillSummary(name="s", description="d", version="1", tags=[])
        resp = SearchResponse(query="ai", results=[summary], total=1)
        assert resp.query == "ai"
        assert resp.total == 1
        assert len(resp.results) == 1

    def test_empty_results(self) -> None:
        resp = SearchResponse(query="xyz", results=[], total=0)
        assert resp.results == []
        assert resp.total == 0


# ── ReloadResponse ────────────────────────────────────────────────────────────


class TestReloadResponse:
    def test_basic(self) -> None:
        r = ReloadResponse(loaded=5, errors=[])
        assert r.loaded == 5
        assert r.errors == []

    def test_with_errors(self) -> None:
        r = ReloadResponse(loaded=3, errors=["Failed to parse skill-x"])
        assert r.loaded == 3
        assert len(r.errors) == 1


# ── InstallRequest ────────────────────────────────────────────────────────────


class TestInstallRequest:
    def test_basic(self) -> None:
        req = InstallRequest(zip_path="/tmp/skill.zip")
        assert req.zip_path == "/tmp/skill.zip"
        assert req.conflict_policy == "overwrite"

    def test_custom_conflict_policy(self) -> None:
        req = InstallRequest(zip_path="/tmp/skill.zip", conflict_policy="skip")
        assert req.conflict_policy == "skip"

    def test_empty_zip_path_raises(self) -> None:
        with pytest.raises(ValidationError):
            InstallRequest(zip_path="")


# ── InstallResponse ───────────────────────────────────────────────────────────


class TestInstallResponse:
    def test_success(self) -> None:
        resp = InstallResponse(
            success=True,
            skill_name="my-skill",
            target_path="/skills/my-skill",
            errors=None,
        )
        assert resp.success is True
        assert resp.skill_name == "my-skill"

    def test_failure(self) -> None:
        resp = InstallResponse(success=False, errors=["zip corrupted"])
        assert resp.success is False
        assert resp.skill_name is None
        assert resp.target_path is None
        assert resp.errors == ["zip corrupted"]
