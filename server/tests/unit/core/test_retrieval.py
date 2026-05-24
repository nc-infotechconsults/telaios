"""Unit tests for HybridRetriever and RRF fusion.

No Qdrant or real embeddings required — all external dependencies are mocked.
"""

from __future__ import annotations

import pytest

from telaios.core.knowledge.retrieval import HybridRetriever, _reciprocal_rank_fusion
from telaios.core.types import RetrievalQuery


# ── _reciprocal_rank_fusion ───────────────────────────────────────────────────


class TestRRF:
    def _doc(self, doc_id: str, content: str = "") -> dict:
        return {"id": doc_id, "content": content, "metadata": {}}

    def test_single_list_ordering_preserved(self):
        docs = [self._doc("a"), self._doc("b"), self._doc("c")]
        fused = _reciprocal_rank_fusion([docs])
        ids = [d["id"] for d, _ in fused]
        assert ids == ["a", "b", "c"]

    def test_doc_appearing_in_both_lists_ranked_higher(self):
        list_a = [self._doc("shared"), self._doc("only_a")]
        list_b = [self._doc("shared"), self._doc("only_b")]
        fused = _reciprocal_rank_fusion([list_a, list_b])
        ids = [d["id"] for d, _ in fused]
        assert ids[0] == "shared"

    def test_scores_decrease_monotonically(self):
        docs = [self._doc(str(i)) for i in range(5)]
        fused = _reciprocal_rank_fusion([docs])
        scores = [s for _, s in fused]
        assert scores == sorted(scores, reverse=True)

    def test_empty_lists_returns_empty(self):
        assert _reciprocal_rank_fusion([]) == []
        assert _reciprocal_rank_fusion([[]]) == []

    def test_docs_without_id_skipped(self):
        docs = [{"content": "no id here", "metadata": {}}]
        fused = _reciprocal_rank_fusion([docs])
        assert fused == []

    def test_k_parameter_affects_score_magnitude(self):
        docs = [self._doc("x")]
        fused_k60 = _reciprocal_rank_fusion([docs], k=60)
        fused_k1 = _reciprocal_rank_fusion([docs], k=1)
        # k=1 → 1/(1+1)=0.5, k=60 → 1/(60+1)≈0.016 — lower k = higher score
        assert fused_k1[0][1] > fused_k60[0][1]


# ── HybridRetriever (mocked) ──────────────────────────────────────────────────


def _make_doc(doc_id: str, content: str = "content") -> dict:
    return {"id": doc_id, "content": content, "metadata": {"document_id": f"doc_{doc_id}"}}


def _make_retriever(**kwargs) -> HybridRetriever:
    from unittest.mock import AsyncMock, MagicMock

    vs = MagicMock()
    vs.embed_query = AsyncMock(return_value=[0.1] * 8)
    vs.search = AsyncMock(return_value=[_make_doc("d1"), _make_doc("d2"), _make_doc("d3")])

    bm25 = MagicMock()
    bm25.search = MagicMock(return_value=[_make_doc("d2"), _make_doc("d4")])

    defaults = dict(
        vector_store=vs,
        bm25_store=bm25,
        collection="test_coll",
        project_id="proj",
        hyde=None,
        top_k=3,
        rrf_k=60,
    )
    defaults.update(kwargs)
    return HybridRetriever(**defaults)


class TestHybridRetrieverNoReranker:
    @pytest.mark.asyncio
    async def test_returns_retrieval_result(self):
        retriever = _make_retriever()
        result = await retriever.aretrieve(RetrievalQuery(text="query"))
        assert hasattr(result, "chunks")
        assert hasattr(result, "scores")

    @pytest.mark.asyncio
    async def test_chunk_count_bounded_by_top_k(self):
        retriever = _make_retriever(top_k=2)
        result = await retriever.aretrieve(RetrievalQuery(text="query", top_k=2))
        assert len(result.chunks) <= 2

    @pytest.mark.asyncio
    async def test_scores_normalized_to_01(self):
        retriever = _make_retriever()
        result = await retriever.aretrieve(RetrievalQuery(text="query"))
        for score in result.scores:
            assert 0.0 <= score <= 1.0, f"Score {score} out of [0, 1]"

    @pytest.mark.asyncio
    async def test_chunk_content_populated(self):
        retriever = _make_retriever()
        result = await retriever.aretrieve(RetrievalQuery(text="query"))
        for chunk in result.chunks:
            assert isinstance(chunk.content, str)

    @pytest.mark.asyncio
    async def test_query_top_k_overrides_default(self):
        # query.top_k=1 overrides retriever's default top_k=10
        retriever = _make_retriever(top_k=10)
        result = await retriever.aretrieve(RetrievalQuery(text="query", top_k=1))
        assert len(result.chunks) <= 1

    @pytest.mark.asyncio
    async def test_hyde_embed_called_when_set(self):
        from unittest.mock import AsyncMock, MagicMock

        vs = MagicMock()
        vs.search = AsyncMock(return_value=[])
        bm25 = MagicMock()
        bm25.search = MagicMock(return_value=[])

        fake_vector = [0.5] * 8
        hyde = MagicMock()
        hyde.embed_query = AsyncMock(return_value=fake_vector)

        retriever = HybridRetriever(
            vector_store=vs,
            bm25_store=bm25,
            collection="coll",
            project_id="pid",
            hyde=hyde,
            top_k=3,
            rrf_k=60,
        )
        await retriever.aretrieve(RetrievalQuery(text="test"))
        hyde.embed_query.assert_called_once_with("test", "coll")

    @pytest.mark.asyncio
    async def test_direct_embed_when_no_hyde(self):
        from unittest.mock import AsyncMock, MagicMock

        vs = MagicMock()
        vs.embed_query = AsyncMock(return_value=[0.1] * 8)
        vs.search = AsyncMock(return_value=[])
        bm25 = MagicMock()
        bm25.search = MagicMock(return_value=[])

        retriever = HybridRetriever(
            vector_store=vs,
            bm25_store=bm25,
            collection="coll",
            project_id="pid",
            hyde=None,
            top_k=3,
            rrf_k=60,
        )
        await retriever.aretrieve(RetrievalQuery(text="test"))
        vs.embed_query.assert_called_once_with("test", collection="coll")


class TestHybridRetrieverWithReranker:
    @pytest.mark.asyncio
    async def test_reranker_called_with_candidates(self):
        from unittest.mock import AsyncMock, MagicMock

        reranked_docs = [_make_doc("d1"), _make_doc("d2")]
        reranker = MagicMock()
        reranker.arerank = AsyncMock(return_value=reranked_docs)

        retriever = _make_retriever(reranker=reranker, rerank_candidates=10, top_k=2)
        result = await retriever.aretrieve(RetrievalQuery(text="query", top_k=2))

        reranker.arerank.assert_called_once()
        call_args = reranker.arerank.call_args
        assert call_args[0][0] == "query"   # query text
        assert call_args[0][2] == 2          # top_k

    @pytest.mark.asyncio
    async def test_reranker_output_determines_final_chunks(self):
        from unittest.mock import AsyncMock, MagicMock

        # Reranker swaps order: returns d2 first
        reranked_docs = [_make_doc("d2"), _make_doc("d1")]
        reranker = MagicMock()
        reranker.arerank = AsyncMock(return_value=reranked_docs)

        retriever = _make_retriever(reranker=reranker, rerank_candidates=10, top_k=2)
        result = await retriever.aretrieve(RetrievalQuery(text="query"))

        assert result.chunks[0].id == "d2"
        assert result.chunks[1].id == "d1"

    @pytest.mark.asyncio
    async def test_reranker_respects_top_k(self):
        from unittest.mock import AsyncMock, MagicMock

        reranker = MagicMock()
        reranker.arerank = AsyncMock(return_value=[_make_doc("d1")])

        retriever = _make_retriever(reranker=reranker, rerank_candidates=10, top_k=1)
        result = await retriever.aretrieve(RetrievalQuery(text="query"))

        assert len(result.chunks) == 1

    @pytest.mark.asyncio
    async def test_reranker_overfetch_at_least_rerank_candidates(self):
        """Dense + sparse search must over-fetch rerank_candidates items."""
        from unittest.mock import AsyncMock, MagicMock

        vs = MagicMock()
        vs.embed_query = AsyncMock(return_value=[0.1] * 8)
        vs.search = AsyncMock(return_value=[])

        bm25 = MagicMock()
        bm25.search = MagicMock(return_value=[])

        reranker = MagicMock()
        reranker.arerank = AsyncMock(return_value=[])

        retriever = HybridRetriever(
            vector_store=vs,
            bm25_store=bm25,
            collection="coll",
            project_id="pid",
            hyde=None,
            top_k=3,
            rrf_k=60,
            reranker=reranker,
            rerank_candidates=25,
        )
        await retriever.aretrieve(RetrievalQuery(text="q"))

        search_call_kwargs = vs.search.call_args
        limit_used = search_call_kwargs[1].get("top_k") or search_call_kwargs[0][3]
        assert limit_used >= 25

    @pytest.mark.asyncio
    async def test_scores_still_normalized_with_reranker(self):
        from unittest.mock import AsyncMock, MagicMock

        reranker = MagicMock()
        reranker.arerank = AsyncMock(return_value=[_make_doc("d1"), _make_doc("d2")])

        retriever = _make_retriever(reranker=reranker, rerank_candidates=10, top_k=2)
        result = await retriever.aretrieve(RetrievalQuery(text="query"))

        for score in result.scores:
            assert 0.0 <= score <= 1.0
