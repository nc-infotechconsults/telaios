"""
core/strategies/self_rag.py — Self-RAG strategy.

Retrieve → generate → reflect (hallucination check) → regenerate if needed.
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


class SelfRAG(RAGStrategy):
    """
    Self-RAG strategy: self-reflect on generation for hallucination detection.

    Source: https://arxiv.org/abs/2310.11511
    """

    def __init__(self, retriever: Any, llm: Any, config: RagConfig) -> None:
        super().__init__(retriever, llm, config)
        self._max_regen = config.extra.get("max_regeneration_rounds", 2) if config.extra else 2

    async def answer(self, input: AgentInput) -> AgentOutput:
        query_text = self._extract_query(input)
        result = await self.retriever.aretrieve(
            RetrievalQuery(text=query_text, top_k=self.config.top_k)
        )
        chunks = result.chunks

        answer, messages = await self._generate_with_context(input, chunks)
        regen_count = 0

        while regen_count < self._max_regen:
            hallucination = await self._check_hallucination(query_text, answer, chunks)
            if hallucination == "supported":
                break

            # Regenerate with stricter instructions
            answer, messages = await self._regenerate(input, chunks)
            regen_count += 1

        return AgentOutput(content=answer, messages=messages)

    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(type=StreamEventType.AGENT_START, data={})

        query_text = self._extract_query(input)
        result = await self.retriever.aretrieve(
            RetrievalQuery(text=query_text, top_k=self.config.top_k)
        )
        chunks = result.chunks

        regen_count = 0
        answer = ""
        while regen_count <= self._max_regen:
            yield StreamEvent(
                type=StreamEventType.TOOL_RESULT,
                data={"node": "generate", "attempt": regen_count + 1},
            )

            # Stream and collect answer simultaneously
            answer = ""
            async for token in self._generate_stream(input, chunks, regen_count > 0):
                answer += token
                yield StreamEvent(type=StreamEventType.TEXT_CHUNK, data={"text": token})

            # After first pass, check for hallucination
            if regen_count == 0:
                hallucination = await self._check_hallucination(query_text, answer, chunks)
                if hallucination == "supported":
                    break

            regen_count += 1

        yield StreamEvent(type=StreamEventType.AGENT_END, data={})

    async def _generate_with_context(
        self, input: AgentInput, chunks: list[Chunk], strict: bool = False
    ) -> tuple[str, list[Message]]:
        context = self._format_context(chunks)
        instruction = (
            "Answer using ONLY the provided context. "
            "If the context does not contain enough information, say so explicitly. "
            "Do NOT make up information not present in the context."
            if strict
            else "Use the following retrieved context to answer the user's question."
        )

        system_msg = Message(
            role=MessageRole.SYSTEM,
            content=f"{instruction}\n\nContext:\n{context}",
        )
        augmented = AgentInput(messages=[system_msg, *input.messages], metadata=input.metadata)
        response = await self.llm.invoke(augmented.messages)
        return response.content, [response]

    async def _regenerate(
        self, input: AgentInput, chunks: list[Chunk]
    ) -> tuple[str, list[Message]]:
        return await self._generate_with_context(input, chunks, strict=True)

    async def _generate_stream(
        self, input: AgentInput, chunks: list[Chunk], strict: bool = False
    ) -> AsyncIterator[str]:
        context = self._format_context(chunks)
        instruction = (
            "Answer using ONLY the provided context. "
            "Do NOT make up information not present in the context."
            if strict
            else "Use the following retrieved context to answer the user's question."
        )
        system_msg = Message(
            role=MessageRole.SYSTEM,
            content=f"{instruction}\n\nContext:\n{context}",
        )
        augmented = AgentInput(messages=[system_msg, *input.messages], metadata=input.metadata)
        async for token in self.llm.astream(augmented.messages):
            yield token

    async def _check_hallucination(self, query: str, answer: str, chunks: list[Chunk]) -> str:
        context = "\n".join(c.content for c in chunks)
        prompt = (
            f"Question: {query}\n\n"
            f"Context: {context[:1000]}\n\n"
            f"Answer: {answer}\n\n"
            "Is the answer fully supported by the context? "
            "Respond with one of: 'supported', 'partially_supported', 'unsupported'."
        )
        response = await self.llm.invoke([Message(role=MessageRole.HUMAN, content=prompt)])
        content = response.content.lower()
        if "supported" in content and "partial" not in content and "un" not in content:
            return "supported"
        elif "partial" in content:
            return "partially_supported"
        return "unsupported"
