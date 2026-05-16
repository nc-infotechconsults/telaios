"""
core/strategy_selector.py — Intelligent RAG strategy selection.

Analyzes corpus characteristics and query intent to auto-select the best
RAG strategy.  Used by ``RagManager.auto_pipeline()`` to pick the optimal
strategy without manual configuration.

Strategy selection dimensions:
  1. Corpus analysis (size, diversity, code ratio, structure)
  2. Query analysis (intent, complexity, multi-hop indicators)

Source: heuristic-based decision tree (no framework dependency).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from telaios.core.types import RagStrategy

# ── Analysis results ─────────────────────────────────────────────────────────


@dataclass
class CorpusProfile:
    """Characteristics of the ingested knowledge corpus."""

    document_count: int = 0
    total_chars: int = 0
    avg_doc_length: float = 0.0
    source_types: list[str] = field(default_factory=list)
    code_ratio: float = 0.0
    has_structured_data: bool = False
    has_multiple_sources: bool = False

    @property
    def is_large_corpus(self) -> bool:
        return self.document_count > 10 or self.total_chars > 50000

    @property
    def is_code_heavy(self) -> bool:
        return self.code_ratio > 0.4

    @property
    def is_mixed_types(self) -> bool:
        return len(set(self.source_types)) > 1

    @property
    def is_single_document(self) -> bool:
        return self.document_count == 1


@dataclass
class QueryProfile:
    """Characteristics of the user's query."""

    text: str = ""
    word_count: int = 0
    has_comparison: bool = False
    has_multi_hop: bool = False
    has_factoid: bool = False
    has_explanation: bool = False
    has_code_request: bool = False
    has_correction_intent: bool = False


# ── Intent detection patterns ────────────────────────────────────────────────

_COMPARISON_PATTERNS = re.compile(
    r"\b(compare|versus|vs\.?|difference|better|worse|pros|cons|advantages|disadvantages)\b",
    re.IGNORECASE,
)

_MULTI_HOP_PATTERNS = re.compile(
    r"\b(how does .+ (relate|connect|affect|impact|influence) .+|"
    r"what is the (relationship|connection) between.+|"
    r"chain of|steps (in|of) |process of |flow of)\b",
    re.IGNORECASE,
)

_FACTOID_PATTERNS = re.compile(
    r"^(what is|who is|when did|where is|how many|how much|which |define )",
    re.IGNORECASE,
)

_EXPLANATION_PATTERNS = re.compile(
    r"\b(explain|why|how does|describe|elaborate|analyze|break down)\b",
    re.IGNORECASE,
)

_CODE_PATTERNS = re.compile(
    r"\b(code|implement|function|class|method|api|endpoint|bug|fix|error|"
    r"compile|runtime|import |deploy|docker|kubernetes)\b",
    re.IGNORECASE,
)

_CORRECTION_PATTERNS = re.compile(
    r"\b(correct|fix|wrong|incorrect|error|mistake|verify|validate|check)\b",
    re.IGNORECASE,
)


# ── Selector ─────────────────────────────────────────────────────────────────


class StrategySelector:
    """Selects the best RAG strategy from corpus + query profiles.

    Usage::

        selector = StrategySelector()
        strategy, reason = selector.select(corpus_profile, query_profile)
        pipeline = rag_manager.auto_pipeline(query, strategy)
    """

    # ── Corpus-level decision rules ──────────────────────────────────────

    def analyze_corpus(self, stats: dict[str, Any]) -> CorpusProfile:
        """Build a ``CorpusProfile`` from ``KnowledgeSource.corpus_stats()``."""
        source_types = stats.get("source_types", [])
        return CorpusProfile(
            document_count=stats.get("document_count", 0),
            total_chars=stats.get("total_chars", 0),
            avg_doc_length=stats.get("avg_doc_length", 0.0),
            source_types=list(source_types),
            code_ratio=stats.get("code_ratio", 0.0),
            has_structured_data=any(t in ("code", "json", "yaml", "sql") for t in source_types),
            has_multiple_sources=len(set(source_types)) > 1,
        )

    # ── Query-level intent detection ─────────────────────────────────────

    def analyze_query(self, text: str) -> QueryProfile:
        """Extract intent signals from the query text."""
        words = text.split()
        return QueryProfile(
            text=text,
            word_count=len(words),
            has_comparison=bool(_COMPARISON_PATTERNS.search(text)),
            has_multi_hop=bool(_MULTI_HOP_PATTERNS.search(text)),
            has_factoid=bool(_FACTOID_PATTERNS.search(text)),
            has_explanation=bool(_EXPLANATION_PATTERNS.search(text)),
            has_code_request=bool(_CODE_PATTERNS.search(text)),
            has_correction_intent=bool(_CORRECTION_PATTERNS.search(text)),
        )

    # ── Strategy selection ───────────────────────────────────────────────

    def select(self, corpus: CorpusProfile, query: QueryProfile) -> tuple[RagStrategy, str]:
        """Return the recommended strategy and the reasoning.

        Decision tree (ordered by priority):

        1. **Graph RAG** — multi-hop queries over structured/relational data
        2. **Agentic RAG** — complex queries over large corpora, or code-heavy
        3. **Hybrid RAG** — mixed source types, or code + text
        4. **CRAG** — correction/verification intent, high precision needed
        5. **Self-RAG** — explanation intent, hallucination risk
        6. **Simple RAG** — factoid queries, small corpus (default)
        """
        # 1. Graph RAG — multi-hop relational queries with structured data
        if query.has_multi_hop and (corpus.has_structured_data or corpus.is_large_corpus):
            return RagStrategy.GRAPH, (
                "Multi-hop query with structured/large corpus → graph traversal "
                "provides relational context across entities."
            )

        # 2. Agentic RAG — complex queries, code-heavy, or large corpus
        if (
            query.has_explanation
            and (corpus.is_large_corpus or corpus.is_code_heavy)
            and not query.has_factoid
        ):
            return RagStrategy.AGENTIC, (
                "Complex query over large/code-heavy corpus → agentic loop "
                "can iteratively retrieve missing context."
            )

        # Agentic also good for code-related queries with multiple source types
        if query.has_code_request and corpus.is_mixed_types:
            return RagStrategy.AGENTIC, (
                "Code-related query with mixed source types → agentic retrieval "
                "adapts to diverse content."
            )

        # Agentic for single large document (needs multi-hop within one doc)
        if corpus.is_single_document and corpus.avg_doc_length > 5000 and query.has_explanation:
            return RagStrategy.AGENTIC, (
                "Explanatory query over large single document → agentic loop "
                "retrieves sections in multiple hops."
            )

        # 3. Hybrid RAG — mixed source types or code+text combination
        if corpus.is_mixed_types or (corpus.is_code_heavy and not corpus.is_single_document):
            return RagStrategy.HYBRID, (
                f"Mixed source types ({', '.join(corpus.source_types[:3])}) → "
                "hybrid dense+sparse retrieval maximizes recall across domains."
            )

        # Hybrid for large corpus with factoid queries
        if corpus.is_large_corpus and query.has_factoid:
            return RagStrategy.HYBRID, (
                "Factoid query over large corpus → hybrid search balances "
                "semantic and keyword precision."
            )

        # 4. CRAG — correction/verification intent
        if query.has_correction_intent:
            return RagStrategy.CRAG, (
                "Correction/verification query → corrective RAG grades documents "
                "and rewrites queries to ensure relevant context."
            )

        # CRAG for high-stakes explanation queries with moderate corpus
        if query.has_explanation and not corpus.is_large_corpus and corpus.document_count > 3:
            return RagStrategy.CRAG, (
                "Explanatory query over moderate corpus → corrective RAG "
                "filters irrelevant chunks before generation."
            )

        # 5. Self-RAG — explanation queries with hallucination risk
        if query.has_explanation and corpus.document_count <= 3:
            return RagStrategy.SELF_RAG, (
                "Explanatory query over small corpus → self-RAG reflects on "
                "generation to detect unsupported claims."
            )

        # Self-RAG for any query with comparison over small/medium corpus
        if query.has_comparison and not corpus.is_large_corpus:
            return RagStrategy.SELF_RAG, (
                "Comparative query → self-RAG validates that all comparison "
                "points are grounded in retrieved context."
            )

        # 6. Simple RAG — factoid queries, small corpus (default)
        if query.has_factoid and not corpus.is_large_corpus:
            return RagStrategy.SIMPLE, (
                "Factoid query over small corpus → simple retrieve-then-generate is sufficient."
            )

        # Default: Simple RAG
        return RagStrategy.SIMPLE, (
            f"Default fallback: {corpus.document_count} document(s), "
            f"{corpus.total_chars} chars total → simple one-shot RAG."
        )
