"""Tests for enriched FalkorDBGraphStore code-entity writes.

Uses a mocked FalkorDB graph object to avoid requiring a running FalkorDB instance.
"""
from __future__ import annotations

from unittest.mock import MagicMock, call, patch

import pytest

from telaios.core.knowledge.code_graph import (
    ClassInfo,
    CodeEntities,
    FieldInfo,
    MethodInfo,
    RestEndpointInfo,
)


def _make_store():
    """Return a FalkorDBGraphStore with a mocked internal graph."""
    with patch("telaios.core.stores.graph.falkordb.FalkorDBGraphStore.__init__", return_value=None):
        from telaios.core.stores.graph.falkordb import FalkorDBGraphStore
        store = FalkorDBGraphStore.__new__(FalkorDBGraphStore)
        store._graph = MagicMock()
        store._graph_name = "test"
        return store


def _entities(file_path: str = "com/example/Foo.java") -> CodeEntities:
    return CodeEntities(
        file_path=file_path,
        classes=[
            ClassInfo(
                name="Foo", package="com.example", file_path=file_path,
                start_line=3, end_line=20,
            )
        ],
        methods=[
            MethodInfo(
                class_name="Foo", name="doWork", return_type="void",
                start_line=5, end_line=10,
            )
        ],
        fields=[],
        imports=[],
        endpoints=[],
    )


class TestCodeFileNode:
    def test_code_file_node_is_created(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("CodeFile" in c for c in calls), "expected CodeFile MERGE"

    def test_code_file_language_detected(self):
        store = _make_store()
        store.upsert_code_entities(_entities("src/Foo.java"), "proj-1")
        java_calls = [
            c for c in store._graph.query.call_args_list
            if "CodeFile" in str(c) and "java" in str(c)
        ]
        assert java_calls, "expected language=java on CodeFile node"


class TestCodeFunctionNode:
    def test_code_function_node_is_created(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("CodeFunction" in c and "doWork" in c for c in calls)

    def test_code_function_has_line_coords(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        fn_calls = [
            c for c in store._graph.query.call_args_list
            if "CodeFunction" in str(c) and "MERGE" in str(c)
        ]
        assert fn_calls
        params = fn_calls[0][0][1]  # second positional arg is the params dict
        assert params.get("sl") == 5
        assert params.get("el") == 10


class TestCodeClassLineCoords:
    def test_class_start_end_line_written(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        cls_calls = [
            c for c in store._graph.query.call_args_list
            if "CodeClass" in str(c) and "MERGE" in str(c) and "start_line" in str(c)
        ]
        assert cls_calls
        params = cls_calls[0][0][1]
        assert params.get("sl") == 3
        assert params.get("el") == 20


class TestContainsEdge:
    def test_code_file_contains_code_class_edge(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        edge_calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("CONTAINS" in c and "CodeClass" in c for c in edge_calls)

    def test_code_class_has_method_edge(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        edge_calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("HAS_METHOD" in c for c in edge_calls)


class TestDocSectionMethods:
    def test_upsert_doc_section_calls_merge(self):
        store = _make_store()
        store.upsert_doc_section(
            section_id="auth-requirements",
            heading="Authentication Requirements",
            content_summary="Users must authenticate via JWT.",
            kind="requirement",
            source_doc="docs/auth.md",
            start_line=10,
            project_id="proj-1",
        )
        calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("Doc_Section" in c and "auth-requirements" in c for c in calls)

    def test_add_references_edge_creates_edge(self):
        store = _make_store()
        store.add_references_edge(
            section_id="auth-requirements",
            target_label="CodeClass",
            target_name="AuthService",
            via="annotation",
            project_id="proj-1",
        )
        calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("REFERENCES" in c for c in calls)

    def test_query_doc_sections_returns_rows(self):
        from unittest.mock import MagicMock
        store = _make_store()
        expected = [{"id": "s1", "heading": "Foo", "kind": "guide", "source_doc": "x.md", "content_summary": ""}]
        # Mock the parsed `query()` wrapper (not the raw `_graph.query()`) so the test
        # exercises query_doc_sections routing without depending on FalkorDB result format.
        store.query = MagicMock(return_value=expected)
        rows = store.query_doc_sections("proj-1")
        assert len(rows) == 1
        assert rows[0]["id"] == "s1"

    def test_query_unlinked_sections_uses_not_pattern(self):
        store = _make_store()
        store._graph.query.return_value = []
        store.query_unlinked_sections("proj-1")
        call_cypher = store._graph.query.call_args[0][0]
        assert "NOT" in call_cypher
        assert "REFERENCES" in call_cypher

    def test_query_sections_for_changed_files_empty_returns_early(self):
        store = _make_store()
        rows = store.query_sections_for_changed_files("proj-1", [])
        assert rows == []
        store._graph.query.assert_not_called()
