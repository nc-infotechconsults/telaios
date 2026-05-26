"""Retrieval tool wrappers for the RetrievalAgent dispatcher."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from telaios.core.knowledge.query_router import QueryIntent, classify_query
from telaios.core.agents.retrieval.state import SearchStep
from telaios.core.types import Chunk, RetrievalQuery

logger = logging.getLogger(__name__)


def _resolve_collections(source: str, config: Any) -> list[str]:
    if source == "documents":
        return [config.documents_collection]
    if source == "repositories":
        return [config.repositories_collection]
    return [config.documents_collection, config.repositories_collection]


def _parse_source_query(sub_query: str) -> tuple[str, int | None, int | None]:
    """Parse 'path/to/file.java:10:50' → (path, 10, 50).

    Returns (sub_query, None, None) when no line range is encoded.
    """
    m = re.match(r"^(.+):(\d+):(\d+)$", sub_query)
    if m:
        return m.group(1), int(m.group(2)), int(m.group(3))
    return sub_query, None, None


@dataclass
class RetrievalTools:
    vector_store: Any
    bm25_store: Any
    graph_augmentor: Any
    hyde: Any | None
    config: Any           # KnowledgePipelineConfig
    project_id: str
    source: str
    top_k: int
    file_reader: Any | None = field(default=None)   # FileReader | None

    async def execute(self, step: SearchStep) -> tuple[list[Chunk], list[float]]:
        match step.tool:
            case "vector_search":
                return await self._vector_search(step.sub_query)
            case "graph_structural":
                return await self._graph_structural(step.sub_query)
            case "graph_navigate":
                return await self._graph_navigate(step.sub_query)
            case "bm25":
                return await self._bm25(step.sub_query)
            case "generated_docs":
                return await self._generated_docs(step.sub_query)
            case "read_source":
                return await self._read_source(step.sub_query)
            case "doc_to_code":
                return await self._doc_to_code(step.sub_query)
            case _:
                logger.warning("Unknown tool %r — falling back to vector_search", step.tool)
                return await self._vector_search(step.sub_query)

    # ── Documents: semantic search (Qdrant + BM25) ────────────────────────────

    async def _vector_search(self, query: str) -> tuple[list[Chunk], list[float]]:
        from telaios.core.knowledge.retrieval import HybridRetriever

        # Code is now navigated via graph_navigate + read_source.
        # vector_search is scoped to the documents collection only.
        collections = [self.config.documents_collection]
        all_chunks: list[Chunk] = []
        all_scores: list[float] = []

        for collection in collections:
            retriever = HybridRetriever(
                vector_store=self.vector_store,
                bm25_store=self.bm25_store,
                collection=collection,
                project_id=self.project_id,
                hyde=self.hyde if self.config.hyde_enabled else None,
                top_k=self.top_k,
                rrf_k=self.config.rrf_k,
                reranker=None,
                rerank_candidates=self.config.rerank_candidates,
            )
            result = await retriever.aretrieve(
                RetrievalQuery(text=query, top_k=self.top_k)
            )
            for chunk in result.chunks:
                chunk.metadata["_collection"] = collection
            all_chunks.extend(result.chunks)
            all_scores.extend(result.scores)

        return all_chunks, all_scores

    async def _graph_structural(self, query: str) -> tuple[list[Chunk], list[float]]:
        intent, params = classify_query(query)
        if intent == QueryIntent.SEMANTIC:
            intent_str = "dependency"
            params = {}
        else:
            intent_str = intent.value
        try:
            chunks = await self.graph_augmentor.query_structural(intent_str, params, self.project_id)
        except Exception:
            logger.warning("graph_structural tool failed for query %r", query, exc_info=True)
            chunks = []
        scores = [1.0] * len(chunks)
        return chunks, scores

    async def _bm25(self, query: str) -> tuple[list[Chunk], list[float]]:
        # BM25 scoped to documents collection only (code BM25 removed with code_graph_only)
        collections = [self.config.documents_collection]
        all_chunks: list[Chunk] = []

        for collection in collections:
            results = self.bm25_store.search(
                collection=collection,
                query=query,
                project_id=self.project_id,
                top_k=self.top_k,
            )
            for doc in results:
                all_chunks.append(Chunk(
                    id=doc.get("id", ""),
                    document_id=doc.get("metadata", {}).get("document_id", ""),
                    content=doc.get("content", ""),
                    metadata=doc.get("metadata", {}),
                ))

        scores = [1.0] * len(all_chunks)
        return all_chunks, scores

    async def _generated_docs(self, query: str) -> tuple[list[Chunk], list[float]]:
        from telaios.core.knowledge.retrieval import HybridRetriever

        retriever = HybridRetriever(
            vector_store=self.vector_store,
            bm25_store=self.bm25_store,
            collection=self.config.documents_collection,
            project_id=self.project_id,
            hyde=self.hyde if self.config.hyde_enabled else None,
            top_k=self.top_k * 3,
            rrf_k=self.config.rrf_k,
            reranker=None,
            rerank_candidates=self.config.rerank_candidates,
        )
        result = await retriever.aretrieve(
            RetrievalQuery(text=query, top_k=self.top_k * 3)
        )
        filtered = [
            (c, s) for c, s in zip(result.chunks, result.scores)
            if c.metadata.get("source_type") == "generated_doc"
        ]
        if not filtered:
            filtered = list(zip(result.chunks[:self.top_k], result.scores[:self.top_k]))
        chunks = [c for c, _ in filtered[:self.top_k]]
        scores = [s for _, s in filtered[:self.top_k]]
        return chunks, scores

    # ── Code: graph navigation + file read ───────────────────────────────────

    async def _graph_navigate(self, query: str) -> tuple[list[Chunk], list[float]]:
        """Search FalkorDB for code entities matching a symbol name or file path."""
        graph = self.graph_augmentor._graph
        pid = self.project_id

        try:
            # Search CodeClass and CodeFunction by name (case-sensitive CONTAINS)
            class_rows = graph.query(
                "MATCH (c:CodeClass {project_id: $pid}) WHERE c.name CONTAINS $q "
                "RETURN c.name AS name, c.file_path AS file_path, "
                "c.start_line AS start_line, c.end_line AS end_line, 'CodeClass' AS type "
                "LIMIT 5",
                {"pid": pid, "q": query},
            )
            fn_rows = graph.query(
                "MATCH (fn:CodeFunction {project_id: $pid}) WHERE fn.name CONTAINS $q "
                "RETURN fn.name AS name, fn.file_path AS file_path, "
                "fn.start_line AS start_line, fn.end_line AS end_line, 'CodeFunction' AS type "
                "LIMIT 5",
                {"pid": pid, "q": query},
            )
            rows = (class_rows or []) + (fn_rows or [])
        except Exception:
            logger.warning("graph_navigate failed for query %r", query, exc_info=True)
            rows = []

        # Deduplicate by (name, file_path) in case the same entity appears in both queries
        seen_entities: set[tuple[str, str]] = set()
        deduped_rows: list[dict] = []
        for row in rows:
            key = (row.get("name", ""), row.get("file_path", ""))
            if key not in seen_entities:
                seen_entities.add(key)
                deduped_rows.append(row)
        rows = deduped_rows

        chunks: list[Chunk] = []
        for row in rows[:self.top_k]:
            name = row.get("name", "")
            fp = row.get("file_path", "")
            sl = row.get("start_line")
            el = row.get("end_line")
            etype = row.get("type", "CodeEntity")
            content = f"{etype}: {name}\nfile: {fp}"
            if sl is not None:
                content += f"\nlines: {sl}-{el}"
            chunks.append(Chunk(
                id=f"graph-nav-{abs(hash(name + fp)) % 100000}",
                document_id="knowledge-graph",
                content=content,
                metadata={
                    "source": "graph_navigate",
                    "file_path": fp,
                    "start_line": sl,
                    "end_line": el,
                    "entity_type": etype,
                    "entity_name": name,
                },
            ))

        return chunks, [1.0] * len(chunks)

    async def _read_source(self, sub_query: str) -> tuple[list[Chunk], list[float]]:
        """Fetch a source file slice using FileReader (S3 or local disk).

        sub_query formats accepted:
          "path/to/File.java"          — full file
          "path/to/File.java:10:50"    — specific line range
          "SymbolName"                 — resolved to file_path via graph_navigate
        """
        file_path, start_line, end_line = _parse_source_query(sub_query)

        # Resolve symbol name → file path via graph when no path separator present
        if "/" not in file_path and self.graph_augmentor:
            nav_chunks, _ = await self._graph_navigate(file_path)
            if nav_chunks:
                meta = nav_chunks[0].metadata
                file_path = meta.get("file_path", file_path)
                if start_line is None:
                    start_line = meta.get("start_line")
                    end_line = meta.get("end_line")

        if self.file_reader is not None:
            try:
                content = await self.file_reader.read(
                    file_path,
                    start_line=start_line,
                    end_line=end_line,
                )
            except Exception:
                logger.warning("read_source: FileReader failed for %r", file_path, exc_info=True)
                content = ""
        else:
            # Fallback: Qdrant-backed fetch (Stage 1 compatibility)
            return await self._read_source_qdrant(sub_query)

        if not content:
            return [], []

        return [Chunk(
            id=f"read-source-{abs(hash(file_path)) % 100000}",
            document_id=file_path,
            content=content,
            metadata={
                "source": "read_source",
                "source_path": file_path,
                "start_line": start_line,
                "end_line": end_line,
            },
        )], [1.0]

    async def _read_source_qdrant(self, sub_query: str) -> tuple[list[Chunk], list[float]]:
        """Stage-1 fallback: fetch chunks by source_path from Qdrant."""
        source_path = sub_query
        if "/" not in sub_query:
            collections = _resolve_collections(self.source, self.config)
            for collection in collections:
                results = self.bm25_store.search(
                    collection=collection,
                    query=sub_query,
                    project_id=self.project_id,
                    top_k=1,
                )
                if results:
                    sp = results[0].get("metadata", {}).get("source_path", "")
                    if sp:
                        source_path = sp
                        break

        collections = _resolve_collections(self.source, self.config)
        all_chunks: list[Chunk] = []
        seen_ids: set[str] = set()
        for collection in collections:
            try:
                chunks = await self.vector_store.fetch_by_source_path(
                    collection=collection,
                    project_id=self.project_id,
                    source_path=source_path,
                )
            except Exception:
                logger.warning("read_source_qdrant: fetch failed for %r", source_path, exc_info=True)
                chunks = []
            for c in chunks:
                if c.id not in seen_ids:
                    seen_ids.add(c.id)
                    all_chunks.append(c)
        all_chunks.sort(key=lambda c: c.metadata.get("start_line") or 0)
        return all_chunks, [1.0] * len(all_chunks)

    async def _doc_to_code(self, sub_query: str) -> tuple[list[Chunk], list[float]]:
        """Find code that satisfies a Doc_Section by ID or heading.

        Fast path: return targets from existing REFERENCES edges.
        Slow path: use LLM-generated candidate names to search FalkorDB.
        """
        graph = self.graph_augmentor._graph
        pid = self.project_id

        # Find the Doc_Section node
        try:
            section_rows = graph.query(
                "MATCH (d:Doc_Section {project_id: $pid}) "
                "WHERE d.id = $q OR d.heading CONTAINS $q "
                "RETURN d.id AS id, d.heading AS heading, d.content_summary AS summary "
                "LIMIT 1",
                {"pid": pid, "q": sub_query},
            )
        except Exception:
            logger.warning("doc_to_code: section lookup failed for %r", sub_query, exc_info=True)
            return [], []

        if not section_rows:
            return [], []

        section = section_rows[0]
        section_id = section["id"]

        # Fast path: existing REFERENCES edges
        try:
            ref_rows = graph.query(
                "MATCH (d:Doc_Section {id: $id, project_id: $pid})-[r:REFERENCES]->(t) "
                "RETURN t.name AS name, t.file_path AS file_path, "
                "t.start_line AS start_line, t.end_line AS end_line, "
                "labels(t)[0] AS entity_type, r.via AS via",
                {"id": section_id, "pid": pid},
            )
        except Exception:
            ref_rows = []

        if ref_rows:
            chunks = []
            for row in ref_rows:
                content = (
                    f"Doc '{section['heading']}' references:\n"
                    f"{row.get('entity_type', 'Entity')}: {row.get('name', '')}\n"
                    f"file: {row.get('file_path', '')}\n"
                    f"lines: {row.get('start_line')}-{row.get('end_line')}\n"
                    f"link via: {row.get('via', '')}"
                )
                chunks.append(Chunk(
                    id=f"d2c-{abs(hash(section_id + str(row.get('name', '')))) % 100000}",
                    document_id="knowledge-graph",
                    content=content,
                    metadata={
                        "source": "doc_to_code",
                        "file_path": row.get("file_path"),
                        "start_line": row.get("start_line"),
                        "end_line": row.get("end_line"),
                        "entity_type": row.get("entity_type"),
                        "entity_name": row.get("name"),
                        "via": row.get("via"),
                    },
                ))
            return chunks, [1.0] * len(chunks)

        # Slow path: LLM candidate generation + graph name search
        summary = (section.get("summary") or "") or section.get("heading", "")
        candidate_names: list[str] = []

        llm = getattr(self.graph_augmentor, "_llm", None)
        if llm:
            from langchain_core.messages import HumanMessage, SystemMessage
            try:
                response = await llm.ainvoke([
                    SystemMessage(content=(
                        "You are a code search assistant. Given a documentation section summary, "
                        "list up to 5 likely class or function names (one per line) that would "
                        "implement it. Output only names, no explanation."
                    )),
                    HumanMessage(content=f"Summary: {summary}"),
                ])
                candidate_names = [
                    ln.strip() for ln in response.content.splitlines()
                    if ln.strip() and len(ln.strip()) >= 3
                ][:5]
            except Exception:
                logger.debug("doc_to_code: LLM candidate generation failed", exc_info=True)

        if not candidate_names:
            # Regex fallback: extract PascalCase tokens
            candidate_names = re.findall(r'\b[A-Z][a-zA-Z]{2,}\b', summary)[:5]

        chunks = []
        for candidate in candidate_names:
            nav_chunks, _ = await self._graph_navigate(candidate)
            for c in nav_chunks[:2]:
                chunk = Chunk(
                    id=f"d2c-slow-{abs(hash(section_id + c.metadata.get('entity_name', ''))) % 100000}",
                    document_id="knowledge-graph",
                    content=(
                        f"Candidate for doc section '{section['heading']}':\n{c.content}\n"
                        f"confidence: semantic"
                    ),
                    metadata={**c.metadata, "source": "doc_to_code", "via": "semantic"},
                )
                chunks.append(chunk)

        return chunks[:self.top_k], [0.5] * min(len(chunks), self.top_k)


__all__ = ["RetrievalTools"]
