"""
src/core/providers/langchain/llm.py
------------------------------------
LangChain ``LLM`` adapter and ``BaseChatModel`` factory.

This module provides:
1. ``LangChainLLM`` — implements ``core.llm.LLM`` by wrapping a
   LangChain ``BaseChatModel``.
2. ``build_llm()`` — legacy factory that returns a ``BaseChatModel``
   directly (kept for backward compatibility with ``LangChainAgent``).

All ``langchain*`` imports are **deferred** (inside the function body) so
that this module can be imported without LangChain installed.

Sources
~~~~~~~
- BaseChatModel:
  https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/language_models/chat_models.py
- LangChain message types:
  https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/messages.py
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from telaios.core.llm import LLM, LLMFactory
from telaios.core.types import LLMConfig, Message, MessageRole


class LangChainLLM(LLM):
    """
    ``LLM`` implementation backed by a LangChain ``BaseChatModel``.

    Wraps any LangChain chat model (ChatOpenAI, ChatAnthropic, etc.) and
    exposes the framework-agnostic ``LLM`` interface.
    """

    def __init__(self, config: LLMConfig) -> None:
        self._config = config
        self._model: Any | None = None

    def _get_model(self) -> Any:
        """Lazily build the underlying LangChain model."""
        if self._model is None:
            self._model = build_llm(self._config)
        return self._model

    async def invoke(self, messages: list[Message]) -> Message:
        """Send messages and get a single response."""
        model = self._get_model()
        lc_messages = _to_lc_messages(messages)
        response = await model.ainvoke(lc_messages)
        return _from_lc_message(response)

    async def astream(self, messages: list[Message]) -> AsyncIterator[str]:
        """Stream the model's response token by token."""
        model = self._get_model()
        lc_messages = _to_lc_messages(messages)
        async for chunk in model.astream(lc_messages):
            content = chunk.content
            if content:
                text = content if isinstance(content, str) else str(content)
                if text:
                    yield text

    async def invoke_structured(
        self,
        messages: list[Message],
        response_format: type[Any],
    ) -> Any:
        """Invoke with structured output parsing."""
        model = self._get_model()
        lc_messages = _to_lc_messages(messages)
        structured_model = model.with_structured_output(response_format)
        return await structured_model.ainvoke(lc_messages)


# ── Legacy factory (backward compatible) ─────────────────────────────────────


def build_llm(cfg: LLMConfig) -> Any:
    """
    Instantiate a LangChain ``BaseChatModel`` from an ``LLMConfig``.

    Supported providers:
    - ``"anthropic"``  → ``ChatAnthropic``
    - anything else    → ``ChatOpenAI`` (covers OpenAI, Ollama, vLLM, …)

    Source:
        https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/language_models/chat_models.py
    """
    extra: dict[str, str | float | int] = {}
    if cfg.temperature is not None:
        extra["temperature"] = cfg.temperature
    if cfg.max_tokens is not None:
        extra["max_tokens"] = cfg.max_tokens
    if cfg.top_p is not None:
        extra["top_p"] = cfg.top_p
    if cfg.base_url is not None:
        extra["base_url"] = cfg.base_url

    extra["api_key"] = cfg.api_key or "placeholder"

    if cfg.provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(**extra)

    # OpenAI and OpenAI-compatible providers
    from langchain_openai import ChatOpenAI

    if cfg.frequency_penalty is not None:
        extra["frequency_penalty"] = cfg.frequency_penalty
    if cfg.presence_penalty is not None:
        extra["presence_penalty"] = cfg.presence_penalty

    return ChatOpenAI(**extra)


# ── Message conversion helpers ────────────────────────────────────────────────


def _to_lc_messages(messages: list[Message]) -> list[Any]:
    """Convert ``core.types.Message`` objects to LangChain message types."""
    from langchain_core.messages import (
        AIMessage,
        HumanMessage,
        SystemMessage,
        ToolMessage,
    )

    lc: list[Any] = []
    for msg in messages:
        if msg.role == MessageRole.SYSTEM:
            lc.append(SystemMessage(content=msg.content))
        elif msg.role == MessageRole.HUMAN:
            lc.append(HumanMessage(content=msg.content))
        elif msg.role == MessageRole.AI:
            lc.append(AIMessage(content=msg.content))
        elif msg.role == MessageRole.TOOL:
            lc.append(
                ToolMessage(
                    content=msg.content,
                    tool_call_id=msg.tool_call_id or "",
                    name=msg.name,
                )
            )
    return lc


def _from_lc_message(lc_msg: Any) -> Message:
    """Convert a LangChain message to ``core.types.Message``."""
    content = lc_msg.content
    text = content if isinstance(content, str) else str(content)
    return Message(role=MessageRole.AI, content=text)


# ── Auto-register with LLMFactory ─────────────────────────────────────────────

LLMFactory.register("openai", LangChainLLM)
LLMFactory.register("anthropic", LangChainLLM)
LLMFactory.register("azure_openai", LangChainLLM)
LLMFactory.register("ollama", LangChainLLM)
