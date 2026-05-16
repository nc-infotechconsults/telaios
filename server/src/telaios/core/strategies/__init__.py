"""
core/strategies — RAG strategy implementations using LangChain/LangGraph.

Every strategy here uses only:
- ``core.llm.LangChainLLM`` (or the ``LLM`` protocol)
- ``core.retriever.Retriever`` (base retriever class)
- ``core.types.*`` (domain types)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any

from telaios.core.llm import LLM
from telaios.core.retriever import Retriever
from telaios.core.types import (
    AgentInput,
    AgentOutput,
    Chunk,
    MessageRole,
    RagConfig,
    StreamEvent,
)


class RAGStrategy(ABC):
    """
    Base class for all RAG strategies.

    Subclasses implement ``answer()`` and ``astream()`` using only the
    abstract ``LLM`` and ``Retriever`` interfaces.
    """

    def __init__(self, retriever: Retriever, llm: LLM, config: RagConfig) -> None:
        self.retriever = retriever
        self.llm = llm
        self.config = config

    @abstractmethod
    async def answer(self, input: AgentInput) -> AgentOutput:
        """Generate a response using RAG."""
        ...

    @abstractmethod
    def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:
        """Stream response events using RAG."""
        ...

    @staticmethod
    def _extract_query(input: AgentInput) -> str:
        """Extract the last human message as the retrieval query."""
        for msg in reversed(input.messages):
            if msg.role == MessageRole.HUMAN:
                return msg.content
        return input.messages[-1].content if input.messages else ""

    @staticmethod
    def _format_context(chunks: list[Chunk]) -> str:
        """Format retrieved chunks into a readable context block."""
        if not chunks:
            return "[No relevant context found]"
        parts = [f"[{i + 1}] {chunk.content}" for i, chunk in enumerate(chunks)]
        return "\n\n".join(parts)

    @staticmethod
    def _chunks_to_dicts(chunks: list[Chunk]) -> list[dict[str, Any]]:
        """Convert Chunk objects to plain dicts for state tracking."""
        return [
            {
                "id": c.id,
                "document_id": c.document_id,
                "content": c.content,
                "metadata": c.metadata,
            }
            for c in chunks
        ]

    @staticmethod
    def _dicts_to_chunks(dicts: list[dict[str, Any]]) -> list[Chunk]:
        """Convert plain dicts back to Chunk objects."""
        return [
            Chunk(
                id=d["id"],
                document_id=d["document_id"],
                content=d["content"],
                metadata=d.get("metadata", {}),
            )
            for d in dicts
        ]
