"""GraphAugmentor — augments retrieved chunks with entity-linked graph context."""

from __future__ import annotations

import logging
import re
from typing import Any

from telaios.core.types import Chunk

logger = logging.getLogger(__name__)

# Prompt used to extract entity triplets from a text segment via LLM.
_EXTRACT_PROMPT = (
    "Extract entity relationships from the following text as a list of triplets. "
    "Each triplet must be on its own line in the format: subject | predicate | object\n"
    "Use short, lowercase noun phrases. Extract at most 10 triplets.\n\n"
    "Text:\n{text}\n\nTriplets:"
)

_TRIPLET_RE = re.compile(r"^\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$", re.MULTILINE)


class GraphAugmentor:
    """
    Augments a set of retrieved chunks with additional context from a knowledge graph.

    Pipeline:
      1. Extract entities from the query via LLM
      2. Traverse the graph to find related entities (depth = config.graph_augmentation_depth)
      3. Return the original chunks plus synthetic chunks containing graph triples

    Also provides ``index_document`` to populate the graph during ingestion.
    """

    def __init__(
        self,
        graph_store: Any,  # GraphStore ABC
        llm: Any,
        depth: int = 1,
    ) -> None:
        self._graph = graph_store
        self._llm = llm
        self._depth = depth

    async def augment(self, chunks: list[Chunk], query: str) -> list[Chunk]:
        """Expand chunks with graph-linked context."""
        if not chunks:
            return chunks

        try:
            entities = await self._extract_query_entities(query)
            if not entities:
                return chunks

            subgraph = await self._graph.aget_subgraph(entities, depth=self._depth)
            if not subgraph:
                return chunks

            graph_text = self._format_subgraph(subgraph)
            graph_chunk = Chunk(
                id="graph-augmentation",
                document_id="knowledge-graph",
                content=graph_text,
                metadata={"source": "knowledge_graph", "entity_count": len(entities)},
            )
            return [graph_chunk, *chunks]

        except Exception:
            logger.warning("Graph augmentation failed, returning original chunks", exc_info=True)
            return chunks

    async def index_document(self, doc_id: str, content: str) -> None:
        """Extract triplets from content and persist them in the graph store."""
        try:
            triplets = await self._extract_triplets(content)
            if triplets:
                await self._graph.aadd_triplets(triplets)
                logger.debug("Indexed %d triplets for doc %s", len(triplets), doc_id)
        except Exception:
            logger.warning("Graph indexing failed for doc %s", doc_id, exc_info=True)

    async def _extract_query_entities(self, query: str) -> list[str]:
        """Extract entity names from the query (simple keyword extraction)."""
        # Lightweight: extract capitalized words and noun phrases as entity seeds.
        # For production, replace with an LLM call or NER model.
        words = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b", query)
        lower_words = re.findall(r"\b\w{4,}\b", query.lower())
        return list(dict.fromkeys(words + lower_words))[:10]

    async def _extract_triplets(self, content: str) -> list[tuple[str, str, str]]:
        """Use LLM to extract entity triplets from document content."""
        from langchain_core.messages import HumanMessage
        # Truncate to avoid huge LLM prompts
        snippet = content[:2000]
        prompt = _EXTRACT_PROMPT.format(text=snippet)
        try:
            response = await self._llm.ainvoke([HumanMessage(content=prompt)])
            return self._parse_triplets(response.content)
        except Exception:
            return []

    @staticmethod
    def _parse_triplets(text: str) -> list[tuple[str, str, str]]:
        return [
            (m.group(1).strip(), m.group(2).strip(), m.group(3).strip())
            for m in _TRIPLET_RE.finditer(text)
        ]

    @staticmethod
    def _format_subgraph(triplets: list[tuple[str, str, str]]) -> str:
        lines = [f"{s} → {p} → {o}" for s, p, o in triplets[:20]]
        return "Related knowledge graph context:\n" + "\n".join(lines)


__all__ = ["GraphAugmentor"]
