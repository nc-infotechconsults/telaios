"""
core/strategies/graph.py — GRAPH RAG strategy.

Extract entities → traverse knowledge graph → format subgraph → generate.
"""

from __future__ import annotations

from typing import Any, AsyncIterator

from core.graph_store import GraphStore
from core.strategies import RAGStrategy
from core.types import (
    AgentInput,
    AgentOutput,
    Chunk,
    Message,
    MessageRole,
    RagConfig,
    RetrievalQuery,
    RetrievalResult,
    StreamEvent,
    StreamEventType,
)


class GraphRAG(RAGStrategy):
    """
    GRAPH strategy: knowledge-graph traversal for structured context.

    Source: https://neo4j.com/developer-blog/genai-applications-how-to/
    """

    def __init__(
        self,
        retriever: Any,
        llm: Any,
        config: RagConfig,
        graph_store: GraphStore,
    ) -> None:
        super().__init__(retriever, llm, config)
        self.graph_store = graph_store
        self._depth = config.graph_store.extra.get("depth", 2) if config.graph_store else 2

    async def answer(self, input: AgentInput) -> AgentOutput:
        query_text = self._extract_query(input)
        chunks = await self._retrieve_graph(query_text)
        return await self._generate(input, chunks)

    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(type=StreamEventType.AGENT_START, data={})

        query_text = self._extract_query(input)
        entities = await self.graph_store.aextract_entities(query_text)
        yield StreamEvent(
            type=StreamEventType.TOOL_RESULT,
            data={"phase": "entity_extraction", "entities": entities},
        )

        chunks = await self._retrieve_graph(query_text)
        yield StreamEvent(
            type=StreamEventType.TOOL_RESULT,
            data={"phase": "graph_traversal", "chunks": len(chunks)},
        )

        async for token in self._generate_stream(input, chunks):
            yield token

        yield StreamEvent(type=StreamEventType.AGENT_END, data={})

    async def _retrieve_graph(self, query_text: str) -> list[Chunk]:
        """Retrieve context by traversing the knowledge graph."""
        entities = await self.graph_store.aextract_entities(query_text)
        entity_names = list({e[0] for e in entities}) or [query_text[:100]]

        triplets = await self.graph_store.aget_subgraph(entity_names, depth=self._depth)

        chunks: list[Chunk] = []
        seen: set[str] = set()
        for subj, pred, obj in triplets[: self.config.top_k]:
            chunk_id = f"{subj}--{pred}--{obj}"
            if chunk_id in seen:
                continue
            seen.add(chunk_id)
            chunks.append(
                Chunk(
                    id=chunk_id,
                    document_id="graph",
                    content=f"{subj} {pred} {obj}",
                    metadata={"subject": subj, "predicate": pred, "object": obj},
                )
            )
        return chunks

    async def _generate(self, input: AgentInput, chunks: list[Chunk]) -> AgentOutput:
        """Generate answer with graph context."""
        context = self._format_graph_context(chunks)
        system_msg = Message(
            role=MessageRole.SYSTEM,
            content=(
                "Use the following knowledge graph context to answer "
                "the user's question.\n\n"
                f"{context}"
            ),
        )
        augmented = AgentInput(messages=[system_msg, *input.messages], metadata=input.metadata)
        response = await self.llm.invoke(augmented.messages)
        return AgentOutput(content=response.content, messages=[response])

    async def _generate_stream(
        self, input: AgentInput, chunks: list[Chunk]
    ) -> AsyncIterator[StreamEvent]:
        context = self._format_graph_context(chunks)
        system_msg = Message(
            role=MessageRole.SYSTEM,
            content=(
                "Use the following knowledge graph context to answer "
                "the user's question.\n\n"
                f"{context}"
            ),
        )
        augmented = AgentInput(messages=[system_msg, *input.messages], metadata=input.metadata)
        async for token in self.llm.astream(augmented.messages):
            yield StreamEvent(type=StreamEventType.TEXT_CHUNK, data={"text": token})

    @staticmethod
    def _format_graph_context(chunks: list[Chunk]) -> str:
        if not chunks:
            return "[No relevant graph context found]"
        parts = []
        for i, chunk in enumerate(chunks, 1):
            subj = chunk.metadata.get("subject", "unknown")
            pred = chunk.metadata.get("predicate", "related_to")
            obj = chunk.metadata.get("object", "unknown")
            parts.append(f"[{i}] {subj} --{pred}--> {obj}")
        return "\n".join(parts)


class GraphRAGStrategy:
    """Compatibility wrapper for graph strategy construction in integration tests."""

    def __init__(self, graph_store: GraphStore, config: RagConfig) -> None:
        self.graph_store = graph_store
        self.config = config
