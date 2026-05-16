"""
core/fake_llm.py — FakeLLM for testing and TUI dry-runs.

Implements the same interface as ``LangChainLLM`` so RAG strategies can
be exercised without external API calls. Returns deterministic responses
based on context content.

Used by:
  - TUI (``telaios-eval``) for dry-run mode
  - Integration tests (``tests/integration/core/``)
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from telaios.core.types import Message, MessageRole


class FakeLLM:
    """Deterministic LLM that echoes context for integration tests and TUI.

    Usage::

        llm = FakeLLM()
        response = await llm.invoke([
            Message(role=MessageRole.HUMAN, content="What is RAG?")
        ])
    """

    def __init__(self, label: str = "fake-llm") -> None:
        self._label = label

    async def invoke(self, messages: list[Message]) -> Message:
        """Return a response that cites the provided context."""
        system_content = ""
        user_query = ""

        for msg in messages:
            if msg.role == MessageRole.SYSTEM:
                system_content = msg.content
            elif msg.role == MessageRole.HUMAN:
                user_query = msg.content

        context_lines = system_content.count("[")
        has_context = "Context:" in system_content or "context" in system_content.lower()

        if has_context and context_lines > 0:
            response = (
                f"[FakeLLM] Based on the {context_lines} retrieved documents, "
                f"the answer to '{user_query[:50]}...' is: "
                "The retrieved context provides relevant information about the topic."
            )
        elif has_context:
            response = f"[FakeLLM] Answer (with context) to: {user_query[:80]}"
        else:
            response = f"[FakeLLM] Answer to: {user_query[:80]}"

        return Message(role=MessageRole.AI, content=response)

    async def astream(self, messages: list[Message]) -> AsyncIterator[str]:
        """Stream tokens one word at a time."""
        response = await self.invoke(messages)
        words = response.content.split()
        for word in words:
            yield word + " "
