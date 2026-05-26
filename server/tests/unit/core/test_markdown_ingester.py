"""Unit tests for MarkdownDocIngester."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest


_SIMPLE_MD = """\
# Authentication

Users must log in via JWT.

## Token Refresh

Tokens expire after 1 hour. Use @AuthService to refresh.

## Logout

Call @UserController to invalidate.
"""


def _make_graph_store():
    store = MagicMock()
    store.upsert_doc_section = MagicMock()
    store.add_references_edge = MagicMock()
    return store


class TestMarkdownDocIngester:
    def _ingest(self, content: str = _SIMPLE_MD, kind: str = "guide"):
        from telaios.core.knowledge.markdown_ingester import MarkdownDocIngester
        store = _make_graph_store()
        ingester = MarkdownDocIngester()
        results = ingester.ingest(
            content=content,
            source_doc="docs/auth.md",
            project_id="proj-1",
            kind=kind,
            graph_store=store,
        )
        return results, store

    def test_sections_are_parsed(self):
        results, _ = self._ingest()
        headings = [r.heading for r in results]
        assert "Authentication" in headings
        assert "Token Refresh" in headings
        assert "Logout" in headings

    def test_upsert_called_per_section(self):
        results, store = self._ingest()
        assert store.upsert_doc_section.call_count == 3

    def test_section_ids_are_slugified(self):
        results, _ = self._ingest()
        ids = [r.section_id for r in results]
        assert "authentication" in ids
        assert "token-refresh" in ids

    def test_kind_propagated(self):
        results, store = self._ingest(kind="requirement")
        call_kwargs = store.upsert_doc_section.call_args_list[0][1]
        assert call_kwargs["kind"] == "requirement"

    def test_annotation_triggers_references_edge(self):
        results, store = self._ingest()
        # @AuthService and @UserController in the fixture
        assert store.add_references_edge.call_count >= 2
        target_names = [
            c[1]["target_name"] for c in store.add_references_edge.call_args_list
        ]
        assert "AuthService" in target_names
        assert "UserController" in target_names

    def test_via_annotation_on_references_edge(self):
        results, store = self._ingest()
        for c in store.add_references_edge.call_args_list:
            assert c[1]["via"] == "annotation"

    def test_no_annotation_no_edge(self):
        results, store = self._ingest("# Plain Section\n\nNo annotations here.\n")
        store.add_references_edge.assert_not_called()

    def test_duplicate_headings_get_numeric_suffix(self):
        md = "# Foo\n\nbody1\n\n# Foo\n\nbody2\n"
        results, _ = self._ingest(content=md)
        ids = [r.section_id for r in results]
        assert "foo" in ids
        assert "foo-1" in ids

    def test_empty_file_returns_empty_list(self):
        results, store = self._ingest(content="")
        assert results == []
        store.upsert_doc_section.assert_not_called()


class TestParseHelpers:
    def test_slugify(self):
        from telaios.core.knowledge.markdown_ingester import _slugify
        assert _slugify("Authentication Requirements") == "authentication-requirements"
        assert _slugify("  Foo Bar  ") == "foo-bar"
        assert _slugify("A" * 200)[:100] == "a" * 100
