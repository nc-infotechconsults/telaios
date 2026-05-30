"""Ground-truth precision evaluation against the tiledesk-analytics monorepo.

Full end-to-end test: the real LLM (from .env settings), real Qdrant, and real
graph store are all exercised.  Each query goes through the complete agentic path:

    analyst (LLM) → retrieval dispatcher → evaluator (LLM) → synthesizer (LLM)

The test double-ingests the corpus:
  • ingest_repository()   → TreeSitter chunks in Qdrant repositories collection
                            + code-entity graph (FalkorDB / networkx)
  • ingest_documents()    → SemanticChunker chunks in Qdrant documents collection
                            (makes source files visible to the vector_search tool,
                             which is scoped to the documents collection)

The tiledesk-analytics repo is expected at:
  /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-analytics

Run with:
    pytest tests/integration/core/test_tiledesk_analytics_ground_truth.py -v -s

Skip conditions (automatic):
  • Repo not found on disk
  • LLM server unreachable
  • Graph store unreachable (FalkorDB / Neo4j)
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
PASS_THRESHOLD = 0.60

# ── Corpus root ───────────────────────────────────────────────────────────────

_REPO_ROOT = Path("/Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-analytics")
_API_SVC   = _REPO_ROOT / "apps" / "api" / "src" / "services"
_API_MW    = _REPO_ROOT / "apps" / "api" / "src" / "middleware"
_CONSUMER  = _REPO_ROOT / "apps" / "consumer" / "src"
_CONTRACTS = _REPO_ROOT / "packages" / "contracts" / "src"

if not _REPO_ROOT.exists():
    pytest.skip(
        f"tiledesk-analytics repo not found at {_REPO_ROOT}",
        allow_module_level=True,
    )

# ── Ground-truth corpus ───────────────────────────────────────────────────────

_CORPUS_FILES: list[tuple[Path, str]] = [
    # API services
    (_API_SVC / "analytics.service.ts",           "analytics.service.ts"),
    (_API_SVC / "clickhouse-query.service.ts",    "clickhouse-query.service.ts"),
    (_API_SVC / "kpi.service.ts",                 "kpi.service.ts"),
    (_API_SVC / "filters.service.ts",             "filters.service.ts"),
    # API middleware
    (_API_MW / "auth.ts",                         "auth.ts"),
    (_API_MW / "cache.ts",                        "cache.ts"),
    # Consumer pipeline
    (_CONSUMER / "consumers" / "message-consumer.ts",    "message-consumer.ts"),
    (_CONSUMER / "mapper" / "event-to-row.ts",           "event-to-row.ts"),
    (_CONSUMER / "mapper" / "dimension-extractor.ts",    "dimension-extractor.ts"),
    (_CONSUMER / "idempotency" / "idempotency-guard.ts", "idempotency-guard.ts"),
    (_CONSUMER / "writer" / "clickhouse-writer.ts",      "clickhouse-writer.ts"),
    (_CONSUMER / "validation" / "validate-message.ts",   "validate-message.ts"),
    # Contracts package
    (_CONTRACTS / "envelope.ts",                  "envelope.ts"),
    (_CONTRACTS / "event-types.ts",               "event-types.ts"),
]

# ── Evaluation Q&A pairs ──────────────────────────────────────────────────────

_EVAL_QUERIES: list[tuple[str, list[str]]] = [
    (
        "How are time series query results gap-filled to ensure every bucket timestamp has a value?",
        ["clickhouse-query.service.ts"],
    ),
    (
        "How is the super admin sentinel value used to bypass project-level WHERE clauses?",
        ["clickhouse-query.service.ts", "analytics.service.ts"],
    ),
    (
        "How does the consumer check for duplicate events using Redis SET NX EX before processing?",
        ["idempotency-guard.ts"],
    ),
    (
        "What pipeline steps does the message consumer follow: validate, idempotency, map, write?",
        ["message-consumer.ts"],
    ),
    (
        "How is an analytics event serialized into a ClickHouse row with UTC DateTime64 format?",
        ["event-to-row.ts"],
    ),
    (
        "How does the ClickHouse writer buffer rows and flush on batch size or time interval threshold?",
        ["clickhouse-writer.ts"],
    ),
    (
        "How are raw AMQP messages parsed and validated against the analytics event schema?",
        ["validate-message.ts"],
    ),
    (
        "Which analytics event types trigger a dimension table upsert instead of writing to analytics_events?",
        ["dimension-extractor.ts"],
    ),
    (
        "How does the unique vs returning users chart distinguish first-time from repeat visitors?",
        ["analytics.service.ts"],
    ),
    (
        "How does the KPI service aggregate AI token usage broken down by model?",
        ["kpi.service.ts"],
    ),
    (
        "How are filter options for departments, knowledge bases, channels, and models fetched?",
        ["filters.service.ts"],
    ),
    (
        "How does JWT middleware detect whether to use symmetric HS256 or asymmetric RS256 algorithms?",
        ["auth.ts"],
    ),
    (
        "How does the Redis cache middleware intercept res.json to cache GET responses with a TTL?",
        ["cache.ts"],
    ),
    (
        "What are the valid analytics event type string values such as conversation.created or kb.query_executed?",
        ["event-types.ts", "envelope.ts"],
    ),
    # ── Multi-hop queries (require combining info from 2 files) ───────────────
    (
        "How does the super admin bypass in analytics service relate to the gap-fill helper in clickhouse-query service?",
        ["analytics.service.ts", "clickhouse-query.service.ts"],
    ),
    (
        "How does message-consumer orchestrate validate-message and idempotency-guard before writing events?",
        ["message-consumer.ts", "validate-message.ts", "idempotency-guard.ts"],
    ),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _check_services() -> None:
    """Skip the module early if required services are not reachable."""
    import socket
    from telaios.config.settings import settings

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
        "documents_collection":    "eval_td_documents",
        "repositories_collection": "eval_td_repositories",
        "docgen_enabled":          False,
        "top_k":                   TOP_K,
        "generation_enabled":      True,
    })

    try:
        pl = asyncio.run(KnowledgePipelineFactory.get(config=test_cfg))
    except Exception as exc:
        pytest.skip(f"Pipeline build failed — check service connectivity: {exc}")

    return pl


@pytest.fixture(scope="module")
def ingested_project(pipeline):
    """Double-ingest the TypeScript corpus and return the project_id."""
    from telaios.core.knowledge_source import FileSource

    pid = "tiledesk-analytics-eval"

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

    try:
        asyncio.run(pipeline.delete_project_data(pid))
        logger.info("Cleaned up test project %r", pid)
    except Exception:
        logger.warning("Cleanup failed for project %r", pid, exc_info=True)


# ── Evaluation tests ──────────────────────────────────────────────────────────

class TestTiledeskAnalyticsPrecision:
    """Full end-to-end Precision@K evaluation — LLM analyst + retrieval + synthesizer."""

    def test_corpus_ingested(self, ingested_project: str, pipeline) -> None:
        """Sanity check: documents collection has data after ingestion."""
        hits = pipeline._bm25.search(
            collection="eval_td_documents",
            query="analytics event ClickHouse",
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

        print(f"\n{'='*70}")
        print(f"Tiledesk Analytics Precision@{TOP_K} ({len(results)} queries)")
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
                text="ClickHouse analytics event consumer pipeline",
                source="all",
                top_k=5,
            )
            leaked = [
                c for c in result.chunks
                if c.metadata.get("project_id") == ingested_project
            ]
            assert len(leaked) == 0, (
                f"Cross-project leak: {len(leaked)} chunks from {ingested_project!r} "
                "appeared for a different project"
            )

        asyncio.run(_run())

    def test_answer_is_grounded(self, ingested_project: str, pipeline) -> None:
        """A single targeted query must produce a non-empty grounded answer."""
        async def _run() -> None:
            result = await pipeline.query(
                project_id=ingested_project,
                text=(
                    "How does checkIdempotency use Redis SET NX EX "
                    "to prevent duplicate event processing?"
                ),
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
                collection="eval_td_documents",
                project_id=ingested_project,
                hyde=None,
                top_k=TOP_K,
                rrf_k=60,
            )
            result = await retriever.aretrieve(
                RetrievalQuery(text="analytics event consumer pipeline", top_k=TOP_K)
            )
            for score in result.scores:
                assert 0.0 <= score <= 1.0, f"Score out of range: {score}"

        asyncio.run(_run())

    def test_typescript_ast_extraction(self) -> None:
        """TypeScriptAstExtractor produces non-empty entities for all corpus files."""
        from telaios.core.knowledge.code_graph import CodeGraphExtractor

        extractor = CodeGraphExtractor()
        failures: list[str] = []

        for file_path, label in _CORPUS_FILES:
            if not file_path.exists():
                continue
            source = file_path.read_text(encoding="utf-8")
            entities = extractor.extract(source, str(file_path), "typescript")
            if entities is None or entities.is_empty():
                failures.append(label)

        assert not failures, (
            f"TypeScript AST extraction yielded empty entities for: {failures}"
        )

    def test_no_answer_artifacts(self, ingested_project: str, pipeline) -> None:
        """Synthesizer must not echo XML tags like <question> in any answer."""
        async def _run() -> None:
            result = await pipeline.query(
                project_id=ingested_project,
                text="How does checkIdempotency use Redis SET NX EX to prevent duplicate events?",
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

        Refusal responses naturally echo back the topic keywords — that is fine.
        We only fail if the model invents specific ML/GPU implementation details
        that are nowhere in the corpus.
        """
        async def _run() -> None:
            result = await pipeline.query(
                project_id=ingested_project,
                text="How does the machine learning model training pipeline allocate GPU memory?",
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
                # GPU/ML training details absent from the corpus
                fabrication_indicators = [
                    "cudamalloc", "vram", "torch.cuda", "memory pool",
                    "device memory", "gpu buffer", "nvidia", "memory allocat",
                ]
                for indicator in fabrication_indicators:
                    assert indicator not in lower, (
                        f"Pipeline hallucinated GPU/ML details not in corpus: "
                        f"{result.answer[:300]!r}"
                    )

        asyncio.run(_run())

    def test_latency_tracking(self, ingested_project: str, pipeline) -> None:
        """KnowledgeQueryResult.latency_ms must contain per-stage timing entries."""
        async def _run() -> None:
            result = await pipeline.query(
                project_id=ingested_project,
                text="How does idempotency guard work?",
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
