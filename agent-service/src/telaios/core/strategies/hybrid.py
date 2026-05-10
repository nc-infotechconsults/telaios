"""
core/strategies/hybrid.py — HYBRID RAG strategy.

Multi-source retrieval → RRF fusion → generate.
"""

from __future__ import annotations

from typing import Any, AsyncIterator

from telaios.core.fusion import reciprocal_rank_fusion
from telaios.core.strategies import RAGStrategy
from telaios.core.types import (
    AgentInput,
    AgentOutput,
    Chunk,
    Message,
    MessageRole,
    RagConfig,
    RetrievalQuery,
    StreamEvent,
    StreamEventType,
)


class HybridRAG(RAGStrategy):
    """
    HYBRID strategy: fuse multiple retrievers via RRF, then generate.

    Source: https://python.langchain.com/docs/how_to/ensemble_retriever/
    """

    def __init__(
        self,
        retriever: Any,
        llm: Any,
        config: RagConfig,
        retrievers: list[Any] | None = None,
    ) -> None:
        super().__init__(retriever, llm, config)
        self._retrievers = retrievers or [retriever]
        self._rrf_k = config.extra.get("rrf_k", 60) if config.extra else 60

    async def answer(self, input: AgentInput) -> AgentOutput:
        query_text = self._extract_query(input)
        chunks = await self._hybrid_retrieve(query_text)
        return await self._generate(input, chunks)

    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(type=StreamEventType.AGENT_START, data={})

        query_text = self._extract_query(input)
        chunks = await self._hybrid_retrieve(query_text)

        yield StreamEvent(
            type=StreamEventType.TOOL_RESULT,
            data={"phase": "hybrid_retrieval", "sources": len(self._retrievers), "chunks": len(chunks)},
        )

        async for token in self._generate_stream(input, chunks):
            yield token

        yield StreamEvent(type=StreamEventType.AGENT_END, data={})

    async def _hybrid_retrieve(self, query_text: str) -> list[Chunk]:
        """Retrieve from all sources and fuse with RRF."""
        retrieval_query = RetrievalQuery(text=query_text, top_k=self.config.top_k)
        results_lists: list[list[Chunk]] = []

        for retriever in self._retrievers:
            try:
                result = await retriever.aretrieve(retrieval_query)
                if result.chunks:
                    results_lists.append(result.chunks)
            except Exception:
                pass

        if not results_lists:
            return []

        fused = reciprocal_rank_fusion(results_lists, k=self._rrf_k)
        return [chunk for chunk, _ in fused[: self.config.top_k]]

    async def _generate(self, input: AgentInput, chunks: list[Chunk]) -> AgentOutput:
        context = self._format_context(chunks)
        system_msg = Message(
            role=MessageRole.SYSTEM,
            content=(
                "Use the following retrieved context to answer the user's question.\n\n"
                f"{context}"
            ),
        )
        augmented = AgentInput(messages=[system_msg, *input.messages], metadata=input.metadata)
        response = await self.llm.invoke(augmented.messages)
        return AgentOutput(content=response.content, messages=[response])

    async def _generate_stream(
        self, input: AgentInput, chunks: list[Chunk]
    ) -> AsyncIterator[StreamEvent]:
        context = self._format_context(chunks)
        system_msg = Message(
            role=MessageRole.SYSTEM,
            content=(
                "Use the following retrieved context to answer the user's question.\n\n"
                f"{context}"
            ),
        )
        augmented = AgentInput(messages=[system_msg, *input.messages], metadata=input.metadata)
        async for token in self.llm.astream(augmented.messages):
            yield StreamEvent(type=StreamEventType.TEXT_CHUNK, data={"text": token})
