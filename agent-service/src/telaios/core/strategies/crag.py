"""
core/strategies/crag.py — CRAG (Corrective RAG) strategy.

Retrieve → grade documents → (relevant → generate | irrelevant → rewrite → retrieve | fallback)
"""

from __future__ import annotations

from typing import Any, AsyncIterator

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


class CRAG(RAGStrategy):
    """
    CRAG strategy: grade retrieved documents, correct by rewriting query or fallback.

    Source: https://arxiv.org/abs/2401.15884
    """

    def __init__(self, retriever: Any, llm: Any, config: RagConfig) -> None:
        super().__init__(retriever, llm, config)
        self._max_rewrites = config.extra.get("max_rewrite_attempts", 1) if config.extra else 1
        self._fallback_provider = (
            config.extra.get("fallback_search_provider") if config.extra else None
        )

    async def answer(self, input: AgentInput) -> AgentOutput:
        query_text = self._extract_query(input)
        chunks, grade = await self._retrieve_and_grade(query_text)
        rewrite_count = 0

        while grade == "irrelevant" and rewrite_count < self._max_rewrites:
            query_text = await self._rewrite_query(query_text)
            chunks, grade = await self._retrieve_and_grade(query_text)
            rewrite_count += 1

        if grade == "irrelevant" and self._fallback_provider:
            chunks = await self._fallback_search(query_text)

        return await self._generate(input, chunks)

    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(type=StreamEventType.AGENT_START, data={})

        query_text = self._extract_query(input)
        chunks, grade = await self._retrieve_and_grade(query_text)
        rewrite_count = 0

        while grade == "irrelevant" and rewrite_count < self._max_rewrites:
            yield StreamEvent(
                type=StreamEventType.TOOL_RESULT,
                data={"node": "rewrite_query", "attempt": rewrite_count + 1},
            )
            query_text = await self._rewrite_query(query_text)
            chunks, grade = await self._retrieve_and_grade(query_text)
            rewrite_count += 1

        if grade == "irrelevant" and self._fallback_provider:
            yield StreamEvent(type=StreamEventType.TOOL_RESULT, data={"node": "fallback_search"})
            chunks = await self._fallback_search(query_text)

        yield StreamEvent(
            type=StreamEventType.TOOL_RESULT,
            data={"node": "generate", "chunks": len(chunks)},
        )

        async for token in self._generate_stream(input, chunks):
            yield token

        yield StreamEvent(type=StreamEventType.AGENT_END, data={})

    async def _retrieve_and_grade(
        self, query_text: str
    ) -> tuple[list[Chunk], str]:
        """Retrieve and grade documents for relevance."""
        result = await self.retriever.aretrieve(
            RetrievalQuery(text=query_text, top_k=self.config.top_k)
        )
        chunks = result.chunks

        if not chunks:
            return [], "irrelevant"

        relevant_count = 0
        for chunk in chunks:
            grade = await self._grade_document(query_text, chunk.content)
            if grade == "relevant":
                relevant_count += 1

        ratio = relevant_count / len(chunks) if chunks else 0
        if ratio >= 0.5:
            grade = "relevant"
        elif relevant_count > 0:
            grade = "ambiguous"
        else:
            grade = "irrelevant"

        return chunks, grade

    async def _grade_document(self, query: str, content: str) -> str:
        """Grade a single document for relevance."""
        prompt = (
            f"Question: {query}\n\n"
            f"Document: {content[:500]}\n\n"
            "Is this document relevant to the question? "
            "Respond with only 'relevant' or 'irrelevant'."
        )
        response = await self.llm.invoke(
            [Message(role=MessageRole.HUMAN, content=prompt)]
        )
        return "relevant" if "relevant" in response.content.lower() else "irrelevant"

    async def _rewrite_query(self, query: str) -> str:
        """Rewrite the query to improve retrieval."""
        prompt = (
            f"Original question: {query}\n\n"
            "Rewrite this question to make it more specific and easier to "
            "find relevant information. Return only the rewritten question."
        )
        response = await self.llm.invoke(
            [Message(role=MessageRole.HUMAN, content=prompt)]
        )
        return response.content.strip()

    async def _fallback_search(self, query: str) -> list[Chunk]:
        """
        Fallback to web search when local retrieval fails.

        Supports Tavily Search API if configured.
        """
        if not self._fallback_provider:
            return []

        provider = self._fallback_provider.lower()

        if provider == "tavily":
            return await self._tavily_search(query)

        logger.warning("Unknown fallback provider: %s", provider)
        return []

    async def _tavily_search(self, query: str) -> list[Chunk]:
        """Search using Tavily API."""
        import httpx

        api_key = self.config.extra.get("tavily_api_key", "") if self.config.extra else ""
        if not api_key:
            logger.warning("Tavily API key not configured")
            return []

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.tavily.com/search",
                    headers={"Content-Type": "application/json"},
                    json={
                        "api_key": api_key,
                        "query": query,
                        "search_depth": "basic",
                        "include_answer": False,
                        "max_results": self.config.top_k,
                    },
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                results = data.get("results", [])
                chunks: list[Chunk] = []
                for i, result in enumerate(results):
                    content = result.get("content", "")
                    url = result.get("url", "")
                    if content:
                        chunks.append(
                            Chunk(
                                id=f"tavily_{i}",
                                document_id=url or f"tavily_{i}",
                                content=content,
                                metadata={
                                    "source": "tavily",
                                    "url": url,
                                    "title": result.get("title", ""),
                                },
                            )
                        )
                return chunks
        except Exception as exc:
            logger.error("Tavily fallback search failed: %s", exc)
            return []

    async def _generate(self, input: AgentInput, chunks: list[Chunk]) -> AgentOutput:
        context = self._format_context(chunks)
        system_msg = Message(
            role=MessageRole.SYSTEM,
            content=(
                "Use the following context to answer the user's question.\n\n"
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
                "Use the following context to answer the user's question.\n\n"
                f"{context}"
            ),
        )
        augmented = AgentInput(messages=[system_msg, *input.messages], metadata=input.metadata)
        async for token in self.llm.astream(augmented.messages):
            yield StreamEvent(type=StreamEventType.TEXT_CHUNK, data={"text": token})
