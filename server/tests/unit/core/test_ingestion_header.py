"""Unit tests for _build_structural_header in ingestion.py."""

from __future__ import annotations

import pytest

from telaios.core.knowledge.ingestion import _build_structural_header


class TestBuildStructuralHeader:
    def test_full_meta_produces_full_header(self):
        meta = {
            "language": "java",
            "source_path": "com/example/UserController.java",
            "enclosing_class": "UserController",
            "symbol_type": "function",
            "symbol_name": "getUser",
        }
        header = _build_structural_header(meta)
        assert header.startswith("[")
        assert header.endswith("]\n")
        assert "java" in header
        assert "UserController.java" in header
        assert "class:UserController" in header
        assert "function:getUser" in header

    def test_empty_meta_produces_empty_string(self):
        assert _build_structural_header({}) == ""

    def test_only_language(self):
        header = _build_structural_header({"language": "python"})
        assert "[python]" in header

    def test_no_enclosing_class(self):
        meta = {
            "language": "java",
            "source_path": "Foo.java",
            "symbol_type": "class",
            "symbol_name": "Foo",
        }
        header = _build_structural_header(meta)
        assert "class:Foo" in header
        assert "class:None" not in header

    def test_preamble_symbol_type_excluded(self):
        meta = {
            "language": "java",
            "source_path": "Foo.java",
            "symbol_type": "preamble",
            "symbol_name": None,
        }
        header = _build_structural_header(meta)
        # preamble type should not appear as sym_type:sym_name part
        assert "preamble:" not in header

    def test_file_index_symbol_type_excluded(self):
        meta = {
            "language": "java",
            "source_path": "Foo.java",
            "symbol_type": "file_index",
            "symbol_name": "index",
        }
        header = _build_structural_header(meta)
        assert "file_index:" not in header

    def test_long_path_keeps_last_two_segments(self):
        meta = {
            "source_path": "com/example/service/UserService.java",
        }
        header = _build_structural_header(meta)
        # Should include "service/UserService.java" (last 2 segments)
        assert "service/UserService.java" in header
        # Should not include full path
        assert "com/example/service/UserService.java" not in header

    def test_short_path_kept_as_is(self):
        meta = {"source_path": "Foo.java"}
        header = _build_structural_header(meta)
        assert "Foo.java" in header

    def test_no_symbol_name_no_sym_part(self):
        meta = {
            "language": "python",
            "symbol_type": "function",
            # symbol_name absent
        }
        header = _build_structural_header(meta)
        assert "function:" not in header

    def test_header_ends_with_newline(self):
        meta = {"language": "java"}
        header = _build_structural_header(meta)
        assert header.endswith("\n")

    def test_method_in_class(self):
        meta = {
            "language": "java",
            "source_path": "com/example/OrderService.java",
            "enclosing_class": "OrderService",
            "symbol_type": "function",
            "symbol_name": "createOrder",
        }
        header = _build_structural_header(meta)
        assert "class:OrderService" in header
        assert "function:createOrder" in header


class TestCodeGraphOnlyFlag:
    """When code_graph_only=True, Qdrant upsert and BM25 rebuild are skipped
    for the repositories collection but NOT for the documents collection."""

    def _make_service(self, code_graph_only: bool):
        from unittest.mock import AsyncMock, MagicMock

        from telaios.core.knowledge.config import KnowledgePipelineConfig
        from telaios.core.knowledge.ingestion import IngestionService

        config = KnowledgePipelineConfig(
            code_graph_only=code_graph_only,
        )
        vs = MagicMock()
        vs.upsert = AsyncMock(return_value=[])
        vs.scroll_all = AsyncMock(return_value=[])
        bm25 = MagicMock()
        graph = MagicMock()
        graph.index_code_entities = AsyncMock()
        graph.index_chunks = AsyncMock()
        graph.index_document = AsyncMock()
        graph.resolve_inherited_endpoints = AsyncMock()
        graph.resolve_cross_file_calls = AsyncMock()
        graph.resolve_import_file_edges = AsyncMock()
        graph.rebuild_communities = AsyncMock()
        svc = IngestionService(
            vector_store=vs, bm25_store=bm25, graph_augmentor=graph, config=config
        )
        return svc, vs, bm25

    def _make_source_and_chunker(self):
        """Return a minimal mock source (one plain-text doc) and a simple chunker."""
        from unittest.mock import AsyncMock, MagicMock

        from telaios.core.chunkers.base import ChunkMetadata
        from telaios.core.knowledge_source import SourceDocument

        doc = SourceDocument(
            content="hello world",
            doc_id="doc-1",
            title="Test Doc",
            source_type="text",
            source_path="test.txt",
        )
        source = MagicMock()
        source.extract = AsyncMock(return_value=[doc])

        meta = ChunkMetadata(index=0, start_char=0, end_char=11)
        chunker = MagicMock()
        chunker.chunk = MagicMock(return_value=[("hello world", meta)])

        return source, chunker

    @pytest.mark.asyncio
    async def test_repositories_skips_qdrant_when_code_graph_only(self):
        svc, vs, bm25 = self._make_service(code_graph_only=True)
        source, chunker = self._make_source_and_chunker()

        await svc.ingest(
            source=source,
            collection=svc._config.repositories_collection,
            project_id="proj-1",
            chunker=chunker,
        )

        vs.upsert.assert_not_called()
        bm25.rebuild.assert_not_called()

    @pytest.mark.asyncio
    async def test_documents_still_uses_qdrant_when_code_graph_only(self):
        svc, vs, bm25 = self._make_service(code_graph_only=True)
        source, chunker = self._make_source_and_chunker()

        await svc.ingest(
            source=source,
            collection=svc._config.documents_collection,
            project_id="proj-1",
            chunker=chunker,
        )

        vs.upsert.assert_called_once()
