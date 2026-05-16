"""
telaios.cli.mock
----------------
In-memory ``Retriever`` for the eval TUI.

Returns deterministic sample chunks so the TUI runs without postgres,
redis, or any vector store.  Embeddings are omitted (not needed for
dry-run evaluation).
"""

from __future__ import annotations

import re

from telaios.core.retriever import Retriever
from telaios.core.types import Chunk, RetrievalQuery, RetrievalResult

# ---------------------------------------------------------------------------
# Sample corpus — one document per topic area we want to exercise
# ---------------------------------------------------------------------------

_CORPUS: list[tuple[str, str, str]] = [
    # (doc_id, chunk_id, content)
    (
        "doc-python",
        "chunk-py-1",
        "Python is a high-level, interpreted programming language created by Guido van Rossum "
        "and first released in 1991. It emphasises code readability and uses significant indentation.",
    ),
    (
        "doc-python",
        "chunk-py-2",
        "Python supports multiple programming paradigms including procedural, object-oriented, "
        "and functional programming. Its comprehensive standard library is one of its greatest strengths.",
    ),
    (
        "doc-rag",
        "chunk-rag-1",
        "Retrieval-Augmented Generation (RAG) combines a retrieval component with a generative LLM. "
        "A query is used to fetch relevant documents from a vector store, which are then provided as "
        "context to the language model.",
    ),
    (
        "doc-rag",
        "chunk-rag-2",
        "Hybrid RAG combines dense vector search with sparse keyword search (BM25). "
        "Results are merged using Reciprocal Rank Fusion (RRF), improving recall especially for "
        "rare terms and domain-specific jargon.",
    ),
    (
        "doc-rag",
        "chunk-rag-3",
        "Corrective RAG (CRAG) grades retrieved documents for relevance. If documents score below "
        "a threshold the query is rewritten or a web search fallback is triggered before generation.",
    ),
    (
        "doc-rag",
        "chunk-rag-4",
        "Self-RAG introduces reflection tokens to decide whether to retrieve, assess document "
        "relevance, and detect hallucinations in the generated output. The model can regenerate "
        "if it detects an unsupported claim.",
    ),
    (
        "doc-agents",
        "chunk-agent-1",
        "A ReAct agent interleaves reasoning steps (Thought) with tool invocations (Action) "
        "in a loop until it reaches a final answer. LangGraph implements this via a cyclic state graph.",
    ),
    (
        "doc-agents",
        "chunk-agent-2",
        "LangGraph checkpointing persists the agent's state between turns using "
        "AsyncPostgresSaver or MemorySaver, enabling long-running multi-turn conversations "
        "and human-in-the-loop interrupts.",
    ),
    (
        "doc-code",
        "chunk-code-1",
        "Static analysis tools like ruff and mypy catch issues before runtime. "
        "ruff combines linting and formatting in a single Rust-based tool; mypy enforces "
        "type annotations with configurable strictness.",
    ),
    (
        "doc-code",
        "chunk-code-2",
        "Security hardening for LLM applications includes input sanitisation to prevent "
        "prompt injection, output validation to block PII leakage, and rate limiting to "
        "resist denial-of-service attacks.",
    ),
]

_CHUNKS: list[Chunk] = [
    Chunk(id=cid, document_id=did, content=content) for did, cid, content in _CORPUS
]


def _score(query_text: str, chunk: Chunk) -> float:
    """Naive BM25-lite: count query-word hits in chunk content."""
    words = set(re.findall(r"\w+", query_text.lower()))
    hits = sum(1 for w in words if w in chunk.content.lower())
    return hits / max(len(words), 1)


class InMemoryRetriever(Retriever):
    """
    Retriever backed by a static in-memory corpus.

    Scores chunks via simple word-overlap and returns the top-k by score.
    Suitable for offline/dry-run evaluation without any external services.
    """

    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        scored = sorted(
            ((c, _score(query.text, c)) for c in _CHUNKS),
            key=lambda x: x[1],
            reverse=True,
        )
        top = scored[: query.top_k]
        return RetrievalResult(
            chunks=[c for c, _ in top],
            scores=[s for _, s in top],
        )

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        return self.retrieve(query)
