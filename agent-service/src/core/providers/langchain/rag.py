"""
src/core/providers/langchain/rag.py
------------------------------------
LangChain-backed ``Retriever`` and ``RAG`` implementations.

Classes
~~~~~~~
``LangChainRetriever``
    Bridges any LangChain ``BaseRetriever`` to the framework-agnostic
    ``Retriever`` interface.  All LangChain imports are deferred.

``LangChainSimpleRAG``
    SIMPLE strategy (retrieve-then-read):
    1. Embed the last user message into a ``RetrievalQuery``.
    2. Retrieve top-k chunks via the ``Retriever``.
    3. Prepend chunks as context into the system prompt.
    4. Delegate to a ``LangChainAgent`` for the generation step.

Sources
~~~~~~~
- LangChain BaseRetriever:
  https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/retrievers.py
- LangChain RAG guide:
  https://docs.langchain.com/oss/python/langchain/rag
"""

from __future__ import annotations

import hashlib
import logging
from typing import TYPE_CHECKING, Any, AsyncIterator

from core.rag import RAG, Retriever
from core.types import (
    AgentConfig,
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

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# ── LangChainRetriever ────────────────────────────────────────────────────────


class LangChainRetriever(Retriever):
    """
    ``Retriever`` backed by a LangChain ``BaseRetriever``.

    This bridge lets any LangChain retriever (vector store retrievers,
    ``MultiQueryRetriever``, ``ContextualCompressionRetriever``, etc.) be
    used wherever the framework-agnostic ``Retriever`` interface is expected.

    Source:
        https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/retrievers.py
    """

    def __init__(self, lc_retriever: Any) -> None:
        """
        Args:
            lc_retriever: Any ``langchain_core.retrievers.BaseRetriever`` instance.
        """
        self._lc_retriever = lc_retriever

    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Synchronous retrieval via LangChain's ``get_relevant_documents``."""
        lc_docs = self._lc_retriever.get_relevant_documents(query.text)
        return self._to_result(lc_docs)

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Asynchronous retrieval via LangChain's ``aget_relevant_documents``."""
        lc_docs = await self._lc_retriever.aget_relevant_documents(query.text)
        return self._to_result(lc_docs)

    @staticmethod
    def _to_result(lc_docs: list[Any]) -> RetrievalResult:
        """Convert LangChain ``Document`` objects to ``RetrievalResult``."""
        chunks: list[Chunk] = []
        for doc in lc_docs:
            doc_id = doc.metadata.get("source", "unknown")
            chunk_id = hashlib.md5(doc.page_content.encode()).hexdigest()  # noqa: S324
            chunks.append(
                Chunk(
                    id=chunk_id,
                    document_id=doc_id,
                    content=doc.page_content,
                    metadata=dict(doc.metadata),
                )
            )
        return RetrievalResult(chunks=chunks)


# ── LangChainSimpleRAG ────────────────────────────────────────────────────────


class LangChainSimpleRAG(RAG):
    """
    SIMPLE (retrieve-then-read) RAG strategy backed by LangChain.

    Steps:
    1. Extract the last human message as the retrieval query.
    2. Retrieve top-k chunks via ``self.retriever``.
    3. Format chunks into a context block prepended to the system prompt.
    4. Delegate to an internal ``LangChainAgent`` for generation.

    The LLM used for generation is taken from ``config.llm``; if ``config.llm``
    is ``None`` a ``ValueError`` is raised at construction time.

    Source — SIMPLE RAG pattern:
        https://docs.langchain.com/oss/python/langchain/rag
    """

    def __init__(self, retriever: Retriever, config: RagConfig) -> None:
        if config.llm is None:
            raise ValueError(
                "LangChainSimpleRAG requires RagConfig.llm to be set "
                "(the LLM config for the generation step)."
            )
        super().__init__(retriever, config)
        # Build the internal agent lazily to keep construction cheap.
        self._agent_config = AgentConfig(
            llm=config.llm,
            system_prompt=None,  # overridden per-call with retrieved context
            system_prompt_mode="override",
            framework="langchain",
        )
        self._agent: Any | None = None  # LangChainAgent, built lazily

    # ── Public API ─────────────────────────────────────────────────────────

    async def answer(self, input: AgentInput) -> AgentOutput:
        """Answer a question by first retrieving context, then generating."""
        augmented = await self._augment(input)
        agent = self._get_agent()
        return await agent.run(augmented)

    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:  # type: ignore[override]
        """Stream the retrieval + generation process."""
        yield StreamEvent(type=StreamEventType.AGENT_START, data={})

        augmented = await self._augment(input)
        agent = self._get_agent()
        async for event in agent.astream(augmented):
            yield event

        yield StreamEvent(type=StreamEventType.AGENT_END, data={})

    # ── Private helpers ────────────────────────────────────────────────────

    async def _augment(self, input: AgentInput) -> AgentInput:
        """Retrieve context and inject it as a system message at the front."""
        query_text = self._extract_query(input)
        retrieval_query = RetrievalQuery(
            text=query_text,
            top_k=self.config.top_k,
        )
        result = await self.retriever.aretrieve(retrieval_query)
        context_block = self._format_context(result.chunks)

        system_msg = Message(
            role=MessageRole.SYSTEM,
            content=(
                "Use the following retrieved context to answer the user's question.\n\n"
                f"{context_block}"
            ),
        )
        return AgentInput(
            messages=[system_msg, *input.messages],
            metadata=input.metadata,
        )

    @staticmethod
    def _extract_query(input: AgentInput) -> str:
        """Extract the last human message as the retrieval query text."""
        for msg in reversed(input.messages):
            if msg.role == MessageRole.HUMAN:
                return msg.content
        return input.messages[-1].content if input.messages else ""

    @staticmethod
    def _format_context(chunks: list[Chunk]) -> str:
        """Format retrieved chunks into a readable context block."""
        if not chunks:
            return "[No relevant context found]"
        parts = [
            f"[{i + 1}] {chunk.content}" for i, chunk in enumerate(chunks)
        ]
        return "\n\n".join(parts)

    def _get_agent(self) -> Any:
        """Lazily build and cache the internal ``LangChainAgent``."""
        if self._agent is None:
            from core.providers.langchain.agent import LangChainAgent  # noqa: PLC0415

            self._agent = LangChainAgent(self._agent_config)
        return self._agent
