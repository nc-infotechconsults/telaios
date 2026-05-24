"""KnowledgeBasePipeline — the single entry point for all knowledge operations."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

ProgressFn = Callable[[str], None]

from telaios.core.knowledge.config import KnowledgePipelineConfig
from telaios.core.knowledge.docgen import GeneratedDoc, RepoDocGenerator
from telaios.core.knowledge.graph import GraphAugmentor
from telaios.core.knowledge.hyde import HyDE
from telaios.core.knowledge.ingestion import IngestResult, IngestionService
from telaios.core.knowledge.retrieval import HybridRetriever
from telaios.core.retriever import Retriever
from telaios.core.stores.bm25 import BM25Store
from telaios.core.stores.qdrant import QdrantVectorStore
from telaios.core.types import Chunk

logger = logging.getLogger(__name__)

SourceLiteral = Literal["all", "documents", "repositories"]


@dataclass
class Citation:
    index: int            # matches [N] in the answer
    source_path: str
    symbol_name: str | None
    start_line: int | None
    collection: str


@dataclass
class KnowledgeQueryResult:
    query: str
    chunks: list[Chunk]
    scores: list[float]
    sources_searched: list[str]
    answer: str | None = None
    citations: list[Citation] = field(default_factory=list)


class KnowledgeBasePipeline:
    """
    Single production pipeline for cross-knowledge-base retrieval and Q&A.

    Fixed internal sequence:
      Query → HyDE → Hybrid (Qdrant + BM25 + RRF) → Graph Augmentation → Response

    Ingestion:
      Source → Chunker (AST for code, Semantic for docs) → Graph Index → Qdrant → BM25

    Two global Qdrant collections, logically partitioned by project_id payload filter.
    """

    def __init__(
        self,
        vector_store: QdrantVectorStore,
        bm25_store: BM25Store,
        graph_augmentor: GraphAugmentor,
        hyde: HyDE,
        llm: Any,
        ingestion: IngestionService,
        config: KnowledgePipelineConfig,
        docgen: RepoDocGenerator | None = None,
        reranker: Any | None = None,
    ) -> None:
        self._vs = vector_store
        self._bm25 = bm25_store
        self._graph = graph_augmentor
        self._hyde = hyde
        self._llm = llm
        self._ingestion = ingestion
        self._config = config
        self._docgen = docgen
        self._reranker = reranker

    # ── Retrieval ─────────────────────────────────────────────────────────────

    async def query(
        self,
        project_id: str,
        text: str,
        source: SourceLiteral = "all",
        top_k: int | None = None,
        on_progress: ProgressFn | None = None,
    ) -> KnowledgeQueryResult:
        """Agentic retrieval: decompose → retrieve → evaluate → synthesize."""
        agent = self._make_retrieval_agent(
            project_id=project_id,
            source=source,
            top_k=top_k or self._config.top_k,
        )
        return await agent.arun(text)

    def _make_retrieval_agent(self, project_id: str, source: str, top_k: int):
        from telaios.core.agents.retrieval.agent import RetrievalAgent
        from telaios.core.agents.retrieval.tools import RetrievalTools
        tools = RetrievalTools(
            vector_store=self._vs,
            bm25_store=self._bm25,
            graph_augmentor=self._graph,
            hyde=self._hyde if self._config.hyde_enabled else None,
            config=self._config,
            project_id=project_id,
            source=source,
            top_k=top_k,
        )
        return RetrievalAgent(
            llm=self._llm,
            tools=tools,
            config=self._config,
            project_id=project_id,
            source=source,
            top_k=top_k,
        )

    def get_retriever(
        self,
        collection: Literal["documents", "repositories"],
        project_id: str | None,
    ) -> Retriever:
        """Return a Retriever-compatible object for direct use in agent tools."""
        real_collection = (
            self._config.documents_collection
            if collection == "documents"
            else self._config.repositories_collection
        )
        return self._make_retriever(real_collection, project_id)

    # ── Ingestion ─────────────────────────────────────────────────────────────

    async def ingest_documents(
        self,
        project_id: str,
        source: Any,  # KnowledgeSource
        on_progress: ProgressFn | None = None,
    ) -> IngestResult:
        """Ingest documents (PDF, DOCX, MD, etc.) using SemanticChunker."""
        from telaios.core.chunkers.semantic import SemanticChunker
        chunker = SemanticChunker(
            chunk_size=self._config.document_chunk_size,
            overlap=self._config.document_chunk_overlap,
        )
        return await self._ingestion.ingest(
            source=source,
            collection=self._config.documents_collection,
            project_id=project_id,
            chunker=chunker,
            on_progress=on_progress,
        )

    async def ingest_repository(
        self,
        project_id: str,
        source: Any,  # KnowledgeSource (FileSource, GitSource, GitHubSource, ...)
        on_progress: ProgressFn | None = None,
    ) -> IngestResult:
        """Ingest a code repository using per-file language detection via TreeSitterChunker.

        If docgen_enabled and a local repo path is resolvable from the source,
        also runs LLM-driven documentation generation and stores the produced
        Markdown docs in the documents collection (tagged as generated_doc).
        Generation is skipped when the current git HEAD SHA matches the SHA
        stored from a previous ingestion.
        """
        from telaios.core.chunkers import get_code_chunker

        def _emit(msg: str) -> None:
            if on_progress:
                on_progress(msg)

        max_lines = self._config.code_chunk_max_lines
        chunk_size = self._config.document_chunk_size
        overlap = self._config.document_chunk_overlap

        def _chunker_factory(doc: Any) -> Any:
            return get_code_chunker(
                source_path=doc.source_path,
                max_lines=max_lines,
                chunk_size=chunk_size,
                overlap=overlap,
            )

        code_result = await self._ingestion.ingest(
            source=source,
            collection=self._config.repositories_collection,
            project_id=project_id,
            chunker=_chunker_factory,
            on_progress=on_progress,
        )

        # ── Documentation generation ──────────────────────────────────────────
        doc_chunk_count = 0
        if self._config.docgen_enabled and self._docgen:
            repo_path = self._resolve_repo_path(source)
            if repo_path:
                _emit("Starting LLM documentation generation…")
                existing_sha = await self._vs.get_generated_doc_sha(
                    collection=self._config.documents_collection,
                    project_id=project_id,
                    repo_path=str(repo_path),
                )
                docs, current_sha = await self._docgen.generate(
                    repo_root=repo_path,
                    existing_sha=existing_sha,
                    on_progress=on_progress,
                )
                if docs:
                    if existing_sha:
                        await self._vs.delete_generated_docs(
                            collection=self._config.documents_collection,
                            project_id=project_id,
                            repo_path=str(repo_path),
                        )
                    _emit(f"Ingesting {len(docs)} generated doc(s) into documents collection…")
                    doc_result = await self._ingest_generated_docs(
                        docs=docs,
                        project_id=project_id,
                        repo_path=str(repo_path),
                        git_sha=current_sha,
                    )
                    doc_chunk_count = doc_result.chunk_count
                elif existing_sha:
                    _emit("Generated docs unchanged (same git SHA)")
            else:
                _emit("Skipping doc generation — no local repo path available for this source")

        return IngestResult(
            collection=code_result.collection,
            project_id=code_result.project_id,
            document_count=code_result.document_count,
            chunk_count=code_result.chunk_count + doc_chunk_count,
            triplet_count=code_result.triplet_count,
            chunks=code_result.chunks,
        )

    async def _ingest_generated_docs(
        self,
        docs: list[GeneratedDoc],
        project_id: str,
        repo_path: str,
        git_sha: str | None,
    ) -> IngestResult:
        """Ingest LLM-generated Markdown docs into the documents collection."""
        from telaios.core.chunkers.semantic import SemanticChunker
        from telaios.core.knowledge_source import KnowledgeSource, SourceDocument

        class _DocSource(KnowledgeSource):
            def __init__(self, generated: list[GeneratedDoc]) -> None:
                super().__init__("generated_docs")
                self._docs = generated

            async def extract(self) -> list[SourceDocument]:
                return [
                    SourceDocument(
                        content=d.content,
                        title=d.title,
                        source_type="generated_doc",
                        source_path=f"{repo_path}/{d.doc_type}",
                        metadata={
                            "doc_type": d.doc_type,
                            "repo_path": repo_path,
                            "git_sha": git_sha or "",
                            "source_files": ",".join(d.source_files[:20]),
                        },
                    )
                    for d in self._docs
                ]

        chunker = SemanticChunker(
            chunk_size=self._config.document_chunk_size,
            overlap=self._config.document_chunk_overlap,
        )
        return await self._ingestion.ingest(
            source=_DocSource(docs),
            collection=self._config.documents_collection,
            project_id=project_id,
            chunker=chunker,
        )

    @staticmethod
    def _resolve_repo_path(source: Any):
        """Extract a local Path from a FileSource or local GitSource. Returns None otherwise."""
        from pathlib import Path
        # FileSource: has _paths attribute
        paths = getattr(source, "_paths", None)
        if paths:
            p = paths[0]
            return p if p.is_dir() else p.parent
        # GitSource: _source is a local path when not remote
        src = getattr(source, "_source", None)
        is_remote_fn = getattr(source, "_is_remote", None)
        if src and callable(is_remote_fn) and not is_remote_fn():
            return Path(src)
        return None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def warm_up(self, project_ids: list[str] | None = None) -> None:
        """Rebuild in-memory BM25 indexes from Qdrant on startup."""
        for collection in [
            self._config.documents_collection,
            self._config.repositories_collection,
        ]:
            try:
                if project_ids:
                    for pid in project_ids:
                        docs = await self._vs.scroll_all(collection=collection, project_id=pid)
                        if docs:
                            self._bm25.rebuild(collection=collection, docs=docs, project_id=pid)
                            logger.info("Warmed BM25: %d docs for project %r in %r", len(docs), pid, collection)
                else:
                    docs = await self._vs.scroll_all(collection=collection)
                    if docs:
                        self._bm25.rebuild(collection=collection, docs=docs)
                        logger.info("Warmed BM25: %d docs in %r (no project filter)", len(docs), collection)
            except Exception:
                logger.warning("BM25 warm-up failed for %r", collection, exc_info=True)

    async def delete_project_data(self, project_id: str) -> None:
        """Remove all vectors and BM25 index belonging to *project_id* from both collections."""
        for collection in [
            self._config.documents_collection,
            self._config.repositories_collection,
        ]:
            await self._vs.delete_by_project(collection=collection, project_id=project_id)
            self._bm25.delete_project(collection=collection, project_id=project_id)

    # ── Internals ─────────────────────────────────────────────────────────────

    def _make_retriever(self, collection: str, project_id: str | None) -> HybridRetriever:
        return HybridRetriever(
            vector_store=self._vs,
            bm25_store=self._bm25,
            collection=collection,
            project_id=project_id,
            hyde=self._hyde if self._config.hyde_enabled else None,
            top_k=self._config.top_k,
            rrf_k=self._config.rrf_k,
            reranker=self._reranker,
            rerank_candidates=self._config.rerank_candidates,
        )


__all__ = ["KnowledgeBasePipeline", "KnowledgeQueryResult"]
