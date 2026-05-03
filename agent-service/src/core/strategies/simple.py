"""
core/strategies/simple.py — SIMPLE RAG strategy.

One-shot retrieve → prepend context → LLM answer.
"""

from __future__ import annotations

from typing import AsyncIterator

from core.strategies import RAGStrategy
from core.types import (
    AgentInput,
    AgentOutput,
    Message,
    MessageRole,
    RetrievalQuery,
    StreamEvent,
    StreamEventType,
)


class SimpleRAG(RAGStrategy):
    """
    SIMPLE strategy: retrieve once, prepend context, generate.

    Source: https://docs.langchain.com/oss/python/langchain/rag
    """

    async def answer(self, input: AgentInput) -> AgentOutput:
        query_text = self._extract_query(input)
        result = await self.retriever.aretrieve(
            RetrievalQuery(text=query_text, top_k=self.config.top_k)
        )
        context = self._format_context(result.chunks)

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

    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(type=StreamEventType.AGENT_START, data={})

        query_text = self._extract_query(input)
        result = await self.retriever.aretrieve(
            RetrievalQuery(text=query_text, top_k=self.config.top_k)
        )
        context = self._format_context(result.chunks)

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

        yield StreamEvent(type=StreamEventType.AGENT_END, data={})
