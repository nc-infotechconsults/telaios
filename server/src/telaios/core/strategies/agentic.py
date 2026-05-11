"""
core/strategies/agentic.py — AGENTIC RAG strategy.

Agent loop: retrieve → generate → reflect → decide (retrieve more or finish).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

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


class AgenticRAG(RAGStrategy):
    """
    AGENTIC strategy: agent decides when to retrieve more context.

    Source: https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_agentic_rag/
    """

    def __init__(self, retriever: Any, llm: Any, config: RagConfig) -> None:
        super().__init__(retriever, llm, config)
        self._max_rounds = config.extra.get("max_retrieval_rounds", 3) if config.extra else 3

    async def answer(self, input: AgentInput) -> AgentOutput:
        query_text = self._extract_query(input)
        all_chunks: list[Chunk] = []
        rounds = 0

        while rounds < self._max_rounds:
            # Retrieve
            result = await self.retriever.aretrieve(
                RetrievalQuery(text=query_text, top_k=self.config.top_k)
            )
            new_chunks = [c for c in result.chunks if c.id not in {ec.id for ec in all_chunks}]
            all_chunks.extend(new_chunks)
            rounds += 1

            # Generate
            context = self._format_context(all_chunks)
            system_msg = Message(
                role=MessageRole.SYSTEM,
                content=(
                    "Use the following retrieved context to answer the user's question. "
                    "If the context is insufficient, say so explicitly.\n\n"
                    f"{context}"
                ),
            )
            augmented = AgentInput(messages=[system_msg, *input.messages], metadata=input.metadata)
            response = await self.llm.invoke(augmented.messages)

            # Reflect: do we need more context?
            needs_more = await self._needs_more_context(query_text, all_chunks)
            if not needs_more:
                return AgentOutput(content=response.content, messages=[response])

        # Max rounds reached — return last answer
        return AgentOutput(content=response.content, messages=[response])

    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(type=StreamEventType.AGENT_START, data={})

        query_text = self._extract_query(input)
        all_chunks: list[Chunk] = []
        rounds = 0

        while rounds < self._max_rounds:
            yield StreamEvent(
                type=StreamEventType.TOOL_RESULT,
                data={"node": "retrieve", "round": rounds + 1},
            )

            result = await self.retriever.aretrieve(
                RetrievalQuery(text=query_text, top_k=self.config.top_k)
            )
            new_chunks = [c for c in result.chunks if c.id not in {ec.id for ec in all_chunks}]
            all_chunks.extend(new_chunks)
            rounds += 1

            context = self._format_context(all_chunks)
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

            needs_more = await self._needs_more_context(query_text, all_chunks)
            if not needs_more:
                break

        yield StreamEvent(type=StreamEventType.AGENT_END, data={})

    async def _needs_more_context(self, query: str, chunks: list[Chunk]) -> bool:
        """Use LLM to assess whether more retrieval is needed."""
        prompt = (
            f"Question: {query}\n\n"
            f"Retrieved {len(chunks)} chunks so far.\n\n"
            "Do you need more context to answer this question? "
            "Respond with only 'yes' or 'no'."
        )
        response = await self.llm.invoke([Message(role=MessageRole.HUMAN, content=prompt)])
        return "yes" in response.content.lower()
