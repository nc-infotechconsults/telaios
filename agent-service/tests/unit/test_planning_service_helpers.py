"""
Unit tests for planning_service helper functions.

Tests _build_project_context_text with various inputs including the
Phase 4.2 feature: ready project documents injected into the system prompt.
"""
from __future__ import annotations

import pytest

from agent_service.services.planning_service import _build_project_context_text


def _ctx(**kwargs) -> dict:
    """Build a minimal context dict, merging extra kwargs."""
    base = {
        "name": "Test Project",
        "description": None,
        "existingPlans": [],
        "repoStructures": [],
        "documents": [],
    }
    base.update(kwargs)
    return base


class TestBuildProjectContextText:
    def test_includes_project_name(self):
        text = _build_project_context_text(_ctx(name="My App"), None)
        assert "My App" in text

    def test_includes_description_when_present(self):
        text = _build_project_context_text(_ctx(description="A cool app"), None)
        assert "A cool app" in text

    def test_omits_description_section_when_none(self):
        text = _build_project_context_text(_ctx(description=None), None)
        assert "Description:" not in text

    def test_includes_plan_title(self):
        text = _build_project_context_text(_ctx(), "Auth Refactor")
        assert "Auth Refactor" in text

    def test_omits_plan_title_when_none(self):
        text = _build_project_context_text(_ctx(), None)
        assert "This plan is titled" not in text

    def test_includes_existing_plans(self):
        ctx = _ctx(existingPlans=[{"title": "Old Plan", "status": "confirmed"}])
        text = _build_project_context_text(ctx, None)
        assert "Old Plan" in text
        assert "confirmed" in text

    def test_omits_plans_section_when_empty(self):
        text = _build_project_context_text(_ctx(), None)
        assert "Existing plans" not in text

    def test_includes_repo_structure(self):
        ctx = _ctx(repoStructures=[{"name": "my-repo", "structure": "src/\n  main.ts"}])
        text = _build_project_context_text(ctx, None)
        assert "my-repo" in text
        assert "main.ts" in text

    # ── Phase 4.2: document context ───────────────────────────────────────────

    def test_includes_ready_documents(self):
        ctx = _ctx(documents=[
            {"name": "spec.pdf", "file_type": "pdf", "size_bytes": 204800},
            {"name": "notes.md", "file_type": "md", "size_bytes": 1024},
        ])
        text = _build_project_context_text(ctx, None)
        assert "spec.pdf" in text
        assert "notes.md" in text
        assert "pdf" in text
        assert "md" in text

    def test_shows_size_in_kb(self):
        ctx = _ctx(documents=[
            {"name": "big.pdf", "file_type": "pdf", "size_bytes": 102400},
        ])
        text = _build_project_context_text(ctx, None)
        assert "100.0 KB" in text

    def test_omits_documents_section_when_empty(self):
        text = _build_project_context_text(_ctx(documents=[]), None)
        assert "Project documents" not in text

    def test_document_section_comes_after_repo_section(self):
        ctx = _ctx(
            repoStructures=[{"name": "repo", "structure": "src/"}],
            documents=[{"name": "spec.pdf", "file_type": "pdf", "size_bytes": 1024}],
        )
        text = _build_project_context_text(ctx, None)
        repo_pos = text.index("repo")
        doc_pos = text.index("spec.pdf")
        assert doc_pos > repo_pos

    def test_handles_zero_size_bytes(self):
        ctx = _ctx(documents=[{"name": "empty.txt", "file_type": "txt", "size_bytes": 0}])
        text = _build_project_context_text(ctx, None)
        assert "empty.txt" in text
        assert "0.0 KB" in text

    def test_handles_missing_size_bytes(self):
        ctx = _ctx(documents=[{"name": "nodoc.pdf", "file_type": "pdf"}])
        text = _build_project_context_text(ctx, None)
        assert "nodoc.pdf" in text
