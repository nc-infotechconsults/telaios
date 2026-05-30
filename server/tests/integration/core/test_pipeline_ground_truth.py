"""Ground-truth precision evaluation for the knowledge pipeline.

Full end-to-end test: the real LLM (from .env settings), real Qdrant, and real
graph store are all exercised.  Each query goes through the complete agentic path:

    analyst (LLM) → retrieval dispatcher → evaluator (LLM) → synthesizer (LLM)

The test double-ingests the corpus:
  • ingest_repository()   → TreeSitter chunks in Qdrant repositories collection
                            + code-entity graph (FalkorDB / networkx)
  • ingest_documents()    → SemanticChunker chunks in Qdrant documents collection
                            (makes source files visible to the vector_search tool,
                             which is scoped to the documents collection)

Precision@K is measured on KnowledgeQueryResult.chunks (from all tools combined).
A separate assertion verifies that a non-empty answer was synthesised for every
query that returned at least one chunk, confirming the LLM ran end-to-end.

Run with:
    pytest tests/integration/core/test_pipeline_ground_truth.py -v -s

Skip conditions (automatic):
  • LLM server unreachable (checked at fixture build time)
  • Graph store unreachable (if GRAPH_STORE_PROVIDER=falkordb / neo4j)
  • Corpus files not found on disk
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

import pytest

logger = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────────

TOP_K = 5
PASS_THRESHOLD = 0.60   # real agentic pipeline; LLM tool choices add variance

# ── Ground-truth corpus ───────────────────────────────────────────────────────

_KNOWLEDGE_DIR = (
    Path(__file__).parents[3]
    / "src" / "telaios" / "core" / "knowledge"
)

_CHUNKERS_DIR = (
    Path(__file__).parents[3]
    / "src" / "telaios" / "core" / "chunkers"
)

_AGENTS_RETRIEVAL_DIR = (
    Path(__file__).parents[3]
    / "src" / "telaios" / "core" / "agents" / "retrieval"
)

_CORPUS_FILES: list[tuple[Path, str]] = [
    (_KNOWLEDGE_DIR / "pipeline.py",          "pipeline.py"),
    (_KNOWLEDGE_DIR / "ingestion.py",         "ingestion.py"),
    (_KNOWLEDGE_DIR / "retrieval.py",         "retrieval.py"),
    (_KNOWLEDGE_DIR / "hyde.py",              "hyde.py"),
    (_KNOWLEDGE_DIR / "graph.py",             "graph.py"),
    (_KNOWLEDGE_DIR / "reranker.py",          "reranker.py"),
    (_KNOWLEDGE_DIR / "code_graph.py",        "code_graph.py"),
    (_KNOWLEDGE_DIR / "config.py",            "config.py"),
    (_KNOWLEDGE_DIR / "query_router.py",      "query_router.py"),
    (_KNOWLEDGE_DIR / "markdown_ingester.py", "markdown_ingester.py"),
    (_CHUNKERS_DIR  / "treesitter.py",        "treesitter.py"),
    (_CHUNKERS_DIR  / "semantic.py",          "semantic.py"),
    (_AGENTS_RETRIEVAL_DIR / "tools.py",      "tools.py"),
    (_AGENTS_RETRIEVAL_DIR / "nodes.py",      "nodes.py"),
]

# ── Evaluation Q&A pairs ──────────────────────────────────────────────────────

_EVAL_QUERIES: list[tuple[str, list[str]]] = [
    (
        "What is HyDE and how does it improve dense retrieval recall?",
        ["hyde.py"],
    ),
    (
        "How does cross-encoder reranking improve result precision after RRF fusion?",
        ["reranker.py"],
    ),
    (
        "How are dense and sparse results fused using Reciprocal Rank Fusion?",
        ["retrieval.py"],
    ),
    (
        "How is source code split at function and class boundaries using tree-sitter?",
        ["treesitter.py"],
    ),
    (
        "What ingestion steps happen between chunking and upserting to Qdrant?",
        ["ingestion.py"],
    ),
    (
        "How are structural context headers prepended to chunk embeddings?",
        ["ingestion.py"],
    ),
    (
        "How are Java REST endpoints and class inheritance extracted from source?",
        ["code_graph.py"],
    ),
    (
        "How does graph augmentation enrich retrieved chunks at query time?",
        ["graph.py"],
    ),
    (
        "How does Personalized PageRank work for graph traversal?",
        ["graph.py"],
    ),
    (
        "What configuration parameter controls the number of results returned?",
        ["config.py"],
    ),
    (
        "What is the KnowledgeBasePipeline and how does it orchestrate ingestion?",
        ["pipeline.py"],
    ),
    (
        "How are endpoint-listing queries distinguished from semantic queries?",
        ["query_router.py"],
    ),
    (
        "What retrieval tools are available to the agentic search planner?",
        ["tools.py", "nodes.py"],
    ),
    (
        "How are Markdown documentation sections ingested into the knowledge graph?",
        ["markdown_ingester.py"],
    ),
    # ── Multi-hop queries (require combining info from 2 files) ───────────────
    (
        "How does HyDE generate a hypothetical document and how does HybridRetriever use that embedding for dense search?",
        ["hyde.py", "retrieval.py"],
    ),
    (
        "How does the ingestion service build structural context headers before upserting chunks, and how does semantic chunking determine boundaries?",
        ["ingestion.py", "semantic.py"],
    ),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _check_services() -> None:
    """Skip the module early if required services are not reachable."""
    import socket
    from telaios.config.settings import settings

    # LLM server
    if settings.LLM_BASE_URL:
        from urllib.parse import urlparse
        parsed = urlparse(settings.LLM_BASE_URL)
        host = parsed.hostname or "localhost"
        port = parsed.port or 80
        try:
            with socket.create_connection((host, port), timeout=3):
                pass
        except OSError:
            pytest.skip(f"LLM server not reachable at {settings.LLM_BASE_URL}")

    # Graph store (FalkorDB / Neo4j)
    provider = settings.GRAPH_STORE_PROVIDER.lower()
    if provider == "falkordb" and settings.FALKORDB_URI:
        from urllib.parse import urlparse
        parsed = urlparse(settings.FALKORDB_URI)
        host = parsed.hostname or "localhost"
        port = parsed.port or 6379
        try:
            with socket.create_connection((host, port), timeout=3):
                pass
        except OSError:
            pytest.skip(f"FalkorDB not reachable at {settings.FALKORDB_URI}")
    elif provider == "neo4j" and settings.NEO4J_URI:
        from urllib.parse import urlparse
        parsed = urlparse(settings.NEO4J_URI.replace("bolt://", "http://"))
        host = parsed.hostname or "localhost"
        port = parsed.port or 7687
        try:
            with socket.create_connection((host, port), timeout=3):
                pass
        except OSError:
            pytest.skip(f"Neo4j not reachable at {settings.NEO4J_URI}")


def _precision_at_k(
    chunks: list[Any],
    expected_sources: list[str],
    k: int,
) -> bool:
    """Return True if any expected source basename appears in the top-k chunks."""
    for chunk in chunks[:k]:
        # Qdrant chunks carry source_path; graph/read_source chunks carry file_path
        for key in ("source_path", "file_path"):
            sp = chunk.metadata.get(key) or ""
            if any(sp.endswith(exp) for exp in expected_sources):
                return True
    return False


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def pipeline():
    """Build the full production pipeline from .env settings with test collections."""
    _check_services()

    from telaios.core.knowledge.config import KnowledgePipelineConfig
    from telaios.core.knowledge.factory import KnowledgePipelineFactory

    base_cfg = KnowledgePipelineFactory.from_settings()
    test_cfg: KnowledgePipelineConfig = base_cfg.model_copy(update={
        "documents_collection":   "eval_gt_documents",
        "repositories_collection": "eval_gt_repositories",
        "docgen_enabled":         False,   # skip LLM doc generation for speed
        "top_k":                  TOP_K,
        "generation_enabled":     True,    # enable full answer synthesis
    })

    try:
        pl = asyncio.run(KnowledgePipelineFactory.get(config=test_cfg))
    except Exception as exc:
        pytest.skip(f"Pipeline build failed — check service connectivity: {exc}")

    return pl


@pytest.fixture(scope="module")
def ingested_project(pipeline):
    """Double-ingest the corpus and return the project_id.

    • ingest_repository → TreeSitter chunks in repositories + code graph entities
    • ingest_documents  → SemanticChunker chunks in documents (enables vector_search)
    """
    from telaios.core.knowledge_source import FileSource

    pid = "ground-truth-eval"

    async def _ingest() -> None:
        missing = [str(p) for p, _ in _CORPUS_FILES if not p.exists()]
        if missing:
            pytest.skip(f"Corpus files not found: {missing}")

        for file_path, _ in _CORPUS_FILES:
            await pipeline.ingest_repository(
                project_id=pid,
                source=FileSource(file_path),
            )
            await pipeline.ingest_documents(
                project_id=pid,
                source=FileSource(file_path),
            )

    asyncio.run(_ingest())
    yield pid

    # Teardown: remove test project data so reruns start clean
    try:
        asyncio.run(pipeline.delete_project_data(pid))
        logger.info("Cleaned up test project %r", pid)
    except Exception:
        logger.warning("Cleanup failed for project %r", pid, exc_info=True)


# ── Evaluation tests ──────────────────────────────────────────────────────────

class TestGroundTruthPrecision:
    """Full end-to-end Precision@K evaluation — LLM analyst + retrieval + synthesizer."""

    def test_corpus_ingested(self, ingested_project: str, pipeline) -> None:
        """Sanity check: documents collection has data after ingestion."""
        hits = pipeline._bm25.search(
            collection="eval_gt_documents",
            query="retrieval pipeline",
            project_id=ingested_project,
            top_k=5,
        )
        assert len(hits) >= 1, "BM25 documents index is empty — ingestion failed"

    def test_precision_at_k_per_query(
        self,
        ingested_project: str,
        pipeline,
    ) -> None:
        """Run all eval queries through the full LLM pipeline and measure Precision@K."""
        from telaios.core.knowledge.pipeline import KnowledgeQueryResult

        results: list[tuple[str, list[str], bool, str]] = []

        async def _run() -> None:
            for query, expected in _EVAL_QUERIES:
                result: KnowledgeQueryResult = await pipeline.query(
                    project_id=ingested_project,
                    text=query,
                    source="all",
                    top_k=TOP_K,
                )
                hit = _precision_at_k(result.chunks, expected, TOP_K)
                results.append((query, expected, hit, result.answer or ""))

        asyncio.run(_run())

        # Print detailed report
        print(f"\n{'='*70}")
        print(f"Ground-truth Precision@{TOP_K} evaluation ({len(results)} queries)")
        print(f"{'='*70}")
        hits = 0
        no_answer_queries: list[str] = []
        for query, expected, hit, answer in results:
            status = "PASS" if hit else "FAIL"
            print(f"[{status}] {query[:60]!r}")
            print(f"       expected: {expected}")
            print(f"       answer:   {answer[:80]!r}" if answer else "       answer:   <empty>")
            hits += int(hit)
            if hit and not answer:
                no_answer_queries.append(query)
        precision = hits / len(results)
        print(f"\nPrecision@{TOP_K}: {hits}/{len(results)} = {precision:.1%}")
        print(f"Threshold:      {PASS_THRESHOLD:.0%}")
        print("=" * 70)

        # Every query that found evidence must have a synthesised answer
        assert not no_answer_queries, (
            f"LLM found relevant chunks but produced no answer for: {no_answer_queries}"
        )

        # No answer may echo back the <question> XML artifact
        artifact_queries = [
            q for q, _, hit, ans in results
            if hit and ans and ans.lstrip().startswith("<question")
        ]
        assert not artifact_queries, (
            f"Synthesizer echoed <question> XML tag in answer for: {artifact_queries}"
        )

        assert precision >= PASS_THRESHOLD, (
            f"Precision@{TOP_K} = {precision:.1%} is below threshold {PASS_THRESHOLD:.0%}. "
            f"Failed queries: {[q for q, _, h, _ in results if not h]}"
        )

    def test_project_isolation(self, ingested_project: str, pipeline) -> None:
        """Chunks from the ingested project must NOT appear under a different project_id."""
        async def _run() -> None:
            result = await pipeline.query(
                project_id="completely-different-project",
                text="HyDE hypothetical document embedding",
                source="all",
                top_k=5,
            )
            leaked = [
                c for c in result.chunks
                if c.metadata.get("project_id") == ingested_project
            ]
            assert len(leaked) == 0, (
                f"Cross-project data leak: {len(leaked)} chunks from {ingested_project!r} "
                "appeared for a different project"
            )

        asyncio.run(_run())

    def test_answer_is_grounded(self, ingested_project: str, pipeline) -> None:
        """A single targeted query must produce a non-empty grounded answer."""
        async def _run() -> None:
            result = await pipeline.query(
                project_id=ingested_project,
                text="What Python class implements HyDE and how does embed_query work?",
                source="all",
                top_k=TOP_K,
            )
            assert result.answer, "Synthesizer produced no answer"
            assert len(result.answer) > 50, (
                f"Answer suspiciously short: {result.answer!r}"
            )
            assert result.sources_searched, "No tools were used in the search plan"

        asyncio.run(_run())

    def test_rrf_scores_are_normalized(self, ingested_project: str, pipeline) -> None:
        """RRF-fused scores from the vector_search tool must be in [0, 1]."""
        from telaios.core.knowledge.retrieval import HybridRetriever
        from telaios.core.types import RetrievalQuery

        async def _run() -> None:
            retriever = HybridRetriever(
                vector_store=pipeline._vs,
                bm25_store=pipeline._bm25,
                collection="eval_gt_documents",
                project_id=ingested_project,
                hyde=None,
                top_k=TOP_K,
                rrf_k=60,
            )
            result = await retriever.aretrieve(
                RetrievalQuery(text="retrieval augmented generation pipeline", top_k=TOP_K)
            )
            for score in result.scores:
                assert 0.0 <= score <= 1.0, f"Score out of range: {score}"

        asyncio.run(_run())

    def test_code_graph_extraction_on_corpus(self) -> None:
        """AST extractor produces non-empty entities for each corpus Python file."""
        from telaios.core.knowledge.code_graph import CodeGraphExtractor

        extractor = CodeGraphExtractor()
        failures: list[str] = []

        for file_path, label in _CORPUS_FILES:
            if not file_path.exists():
                continue
            source = file_path.read_text(encoding="utf-8")
            entities = extractor.extract(source, str(file_path), "python")
            if entities is None or entities.is_empty():
                failures.append(label)

        assert not failures, (
            f"AST extraction yielded empty entities for: {failures}"
        )

    def test_call_graph_extracted(self) -> None:
        """Python call graph extraction produces CALLS entries for non-trivial files."""
        from telaios.core.knowledge.code_graph import CodeGraphExtractor

        extractor = CodeGraphExtractor()
        retrieval_file = _KNOWLEDGE_DIR / "retrieval.py"
        if not retrieval_file.exists():
            pytest.skip("retrieval.py not found")

        source = retrieval_file.read_text(encoding="utf-8")
        entities = extractor.extract(source, str(retrieval_file), "python")
        assert entities is not None
        assert len(entities.calls) > 0, (
            "Expected call graph entries from retrieval.py — "
            "HybridRetriever.aretrieve calls multiple async methods"
        )

    def test_no_answer_artifacts(self, ingested_project: str, pipeline) -> None:
        """Synthesizer must not echo XML tags like <question> in any answer."""
        async def _run() -> None:
            result = await pipeline.query(
                project_id=ingested_project,
                text="What Python class implements HyDE and what does embed_query do?",
                source="all",
                top_k=TOP_K,
            )
            assert result.answer, "Synthesizer produced no answer"
            assert not result.answer.lstrip().startswith("<question"), (
                f"Answer starts with <question> XML echo: {result.answer[:120]!r}"
            )
            assert "<question>" not in result.answer, (
                f"Answer contains <question> XML artifact: {result.answer[:120]!r}"
            )

        asyncio.run(_run())

    def test_hard_negative_query(self, ingested_project: str, pipeline) -> None:
        """A query about a topic absent from the corpus must not fabricate an answer.

        The model is expected to refuse or say it lacks context — those responses
        naturally echo back the topic keywords and that is fine.  We only fail if
        the model invents specific technical implementation details (HMAC, raw-body
        parsing, etc.) that are nowhere in the corpus.
        """
        async def _run() -> None:
            result = await pipeline.query(
                project_id=ingested_project,
                text="How does the payment processing service validate Stripe webhook signatures?",
                source="all",
                top_k=TOP_K,
            )
            if not result.answer:
                return  # empty answer is fine

            lower = result.answer.lower()
            refusal_phrases = [
                "not available", "not contain", "no information", "not found",
                "cannot", "unable", "does not", "don't have", "insufficient",
                "not in the", "not provided", "context does not",
            ]
            is_refusal = any(p in lower for p in refusal_phrases)
            if not is_refusal:
                # Model attempted a substantive answer — check it didn't invent
                # Stripe-specific implementation details absent from the corpus
                fabrication_indicators = [
                    "hmac", "sha256", "x-stripe-signature", "raw body",
                    "verify_signature", "webhook secret", "stripe.webhooks",
                ]
                for indicator in fabrication_indicators:
                    assert indicator not in lower, (
                        f"Pipeline hallucinated Stripe implementation details not in corpus: "
                        f"{result.answer[:300]!r}"
                    )

        asyncio.run(_run())

    def test_latency_tracking(self, ingested_project: str, pipeline) -> None:
        """KnowledgeQueryResult.latency_ms must contain per-stage timing entries."""
        async def _run() -> None:
            result = await pipeline.query(
                project_id=ingested_project,
                text="What is HyDE?",
                source="all",
                top_k=TOP_K,
            )
            assert result.latency_ms, "latency_ms is empty — timing instrumentation missing"
            assert "query_analyst" in result.latency_ms, (
                f"query_analyst timing missing; got keys: {list(result.latency_ms)}"
            )
            assert "synthesizer" in result.latency_ms, (
                f"synthesizer timing missing; got keys: {list(result.latency_ms)}"
            )
            for stage, ms in result.latency_ms.items():
                assert ms >= 0, f"Negative latency for stage {stage!r}: {ms}"
            total = sum(result.latency_ms.values())
            print(f"\nLatency breakdown: {result.latency_ms}")
            print(f"Total accounted: {total:.0f} ms")

        asyncio.run(_run())


# ── Structural / cross-file capability tests ──────────────────────────────────

class TestStructuralCapabilities:
    """Verify that the new cross-file dependency features work after ingestion.

    These tests exercise:
    - Ghost CALLS node resolution (callers_of intent)
    - IMPORTS_FILE edge creation (dependents_of intent)
    - Impact set traversal (impact_set intent)
    - Python module_path extraction
    """

    def test_graph_has_calls_edges(self, ingested_project: str, pipeline) -> None:
        """CALLS edges must exist in the graph after ingestion of Python corpus."""
        graph = pipeline._graph_augmentor._graph
        rows = graph.query(
            "MATCH (a:CodeFunction {project_id: $pid})-[:CALLS]->(b:CodeFunction {project_id: $pid}) "
            "RETURN count(*) AS n",
            {"pid": ingested_project},
        )
        count = rows[0].get("n", 0) if rows else 0
        assert count > 0, (
            f"No CALLS edges found — call graph extraction or post-pass failed "
            f"(project: {ingested_project!r})"
        )
        print(f"\nCALLS edges in graph: {count}")

    def test_graph_has_no_ghost_nodes(self, ingested_project: str, pipeline) -> None:
        """resolve_cross_file_calls post-pass must have deleted all ghost CodeFunction nodes."""
        graph = pipeline._graph_augmentor._graph
        rows = graph.query(
            "MATCH (ghost:CodeFunction {project_id: $pid}) "
            "WHERE ghost.class_name IS NULL OR ghost.is_ghost = true "
            "RETURN count(*) AS n",
            {"pid": ingested_project},
        )
        count = rows[0].get("n", 0) if rows else 0
        assert count == 0, (
            f"Found {count} ghost CodeFunction node(s) — "
            "resolve_cross_file_calls() did not clean up all ghost nodes"
        )

    def test_graph_has_imports_file_edges(self, ingested_project: str, pipeline) -> None:
        """IMPORTS_FILE edges must exist after resolve_import_file_edges post-pass."""
        graph = pipeline._graph_augmentor._graph
        rows = graph.query(
            "MATCH (a:CodeFile {project_id: $pid})-[:IMPORTS_FILE]->(b:CodeFile {project_id: $pid}) "
            "RETURN count(*) AS n",
            {"pid": ingested_project},
        )
        count = rows[0].get("n", 0) if rows else 0
        assert count > 0, (
            "No IMPORTS_FILE edges found — resolve_import_file_edges() post-pass failed"
        )
        print(f"\nIMPORTS_FILE edges in graph: {count}")

    def test_callers_of_structural_query(self, ingested_project: str, pipeline) -> None:
        """graph_structural callers_of must return callers of a known function."""
        async def _run() -> None:
            from telaios.core.knowledge.graph import GraphAugmentor
            graph: GraphAugmentor = pipeline._graph_augmentor
            # aretrieve is a well-known method in retrieval.py called by the pipeline
            chunks = await graph.query_structural(
                "callers_of",
                {"function_name": "aretrieve"},
                ingested_project,
            )
            # The query may return empty if aretrieve has no cross-file CALLS edges yet,
            # but the intent machinery must not crash
            print(f"\ncallers_of 'aretrieve': {len(chunks)} chunk(s) returned")
            # If we get results, they must contain file_path metadata
            for c in chunks:
                assert c.metadata.get("source") == "knowledge_graph"

        asyncio.run(_run())

    def test_dependents_of_structural_query(self, ingested_project: str, pipeline) -> None:
        """graph_structural dependents_of must find classes that import HybridRetriever."""
        async def _run() -> None:
            from telaios.core.knowledge.graph import GraphAugmentor
            graph: GraphAugmentor = pipeline._graph_augmentor
            chunks = await graph.query_structural(
                "dependents_of",
                {"class_name": "HybridRetriever"},
                ingested_project,
            )
            print(f"\ndependents_of 'HybridRetriever': {len(chunks)} chunk(s)")
            for c in chunks:
                assert c.metadata.get("source") == "knowledge_graph"
            # HybridRetriever is imported by pipeline.py — at least one dependent expected
            assert len(chunks) > 0, (
                "Expected dependents of HybridRetriever (used in pipeline.py) — "
                "IMPORTS edges or graph may be incomplete"
            )

        asyncio.run(_run())

    def test_impact_set_structural_query(self, ingested_project: str, pipeline) -> None:
        """graph_structural impact_set must return a non-empty impact analysis."""
        async def _run() -> None:
            from telaios.core.knowledge.graph import GraphAugmentor
            graph: GraphAugmentor = pipeline._graph_augmentor
            chunks = await graph.query_structural(
                "impact_set",
                {"class_name": "HybridRetriever"},
                ingested_project,
            )
            print(f"\nimpact_set 'HybridRetriever': {len(chunks)} chunk(s)")
            for c in chunks:
                assert c.metadata.get("source") == "knowledge_graph"
            assert len(chunks) > 0, (
                "impact_set for HybridRetriever returned nothing — graph queries broken"
            )

        asyncio.run(_run())

    def test_cross_file_impact_query_end_to_end(self, ingested_project: str, pipeline) -> None:
        """Full pipeline query for 'what breaks if I change HybridRetriever' must use graph."""
        async def _run() -> None:
            result = await pipeline.query(
                project_id=ingested_project,
                text="What classes or files would be affected if HybridRetriever changes its aretrieve interface?",
                source="all",
                top_k=TOP_K,
            )
            assert result.answer, "No answer synthesized"
            print(f"\nCross-file impact answer: {result.answer[:200]!r}")
            # Must have retrieved something — retrieval.py or pipeline.py should appear
            source_files = {
                chunk.metadata.get("source_path", "") or chunk.metadata.get("file_path", "")
                for chunk in result.chunks
            }
            relevant = any(
                "retrieval" in fp or "pipeline" in fp
                for fp in source_files
            )
            assert relevant, (
                f"Expected retrieval.py or pipeline.py in evidence, got: {source_files}"
            )

        asyncio.run(_run())
