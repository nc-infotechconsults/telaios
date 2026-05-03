"""
src/core/llm.py
---------------
Framework-agnostic LLM (Large Language Model) abstraction.

This module defines the ``LLM`` abstract base class that any provider
(LangChain, OpenAI SDK, Anthropic SDK, etc.) must implement.  All
higher-level components — RAG strategies, agents, tools — depend only
on this interface, never on a concrete provider.

Usage
~~~~~
Providers implement the ABC::

    class LangChainLLM(LLM):
        async def invoke(self, messages: list[Message]) -> Message: ...
        async def astream(self, messages: list[Message]) -> AsyncIterator[str]: ...

Callers use the factory or inject directly::

    from core import create_llm
    llm = create_llm(LLMConfig(provider="openai", model="gpt-4o", ...))
    response = await llm.invoke([Message(role=MessageRole.HUMAN, content="Hello")])
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator

from core.types import Message


class LLM(ABC):
    """
    Framework-agnostic interface for a chat language model.

    Implementations may wrap:
    - LangChain ``BaseChatModel`` (ChatOpenAI, ChatAnthropic, …)
    - OpenAI SDK ``AsyncOpenAI``
    - Anthropic SDK ``AsyncAnthropic``
    - Any other chat API

    Callers depend only on this interface; they never import a concrete class.
    """

    @abstractmethod
    async def invoke(self, messages: list[Message]) -> Message:
        """
        Send a list of messages and receive a single response.

        Args:
            messages: Conversation history (system, human, ai, tool).

        Returns:
            The model's response as an AI ``Message``.
        """
        ...

    @abstractmethod
    async def astream(self, messages: list[Message]) -> AsyncIterator[str]:
        """
        Stream the model's response token by token.

        Args:
            messages: Conversation history.

        Yields:
            Text chunks as they are generated.
        """
        ...
        yield  # type: ignore[misc]  # marks this as an async generator

    @abstractmethod
    async def invoke_structured(
        self,
        messages: list[Message],
        response_format: type[Any],
    ) -> Any:
        """
        Invoke the model with structured output parsing.

        Args:
            messages: Conversation history.
            response_format: Pydantic model class for the expected output.

        Returns:
            Parsed response as an instance of ``response_format``.
        """
        ...


class LLMFactory:
    """
    Creates ``LLM`` instances from configuration.

    Delegates to registered provider factories.  Providers register
    themselves by adding an entry to ``_REGISTRY``.
    """

    _REGISTRY: dict[str, type[LLM]] = {}

    @classmethod
    def register(cls, provider: str, llm_cls: type[LLM]) -> None:
        """Register an LLM implementation for a provider key."""
        cls._REGISTRY[provider] = llm_cls

    @classmethod
    def create(cls, provider: str, **kwargs: Any) -> LLM:
        """
        Create an LLM instance for the given provider.

        Args:
            provider: Provider key (e.g., "openai", "anthropic").
            **kwargs: Provider-specific configuration.

        Returns:
            An ``LLM`` instance.

        Raises:
            ValueError: If the provider is not registered.
        """
        llm_cls = cls._REGISTRY.get(provider)
        if llm_cls is None:
            raise ValueError(
                f"Unknown LLM provider: {provider!r}. "
                f"Registered: {list(cls._REGISTRY)}. "
                "Call LLMFactory.register() to add a provider."
            )
        return llm_cls(**kwargs)

    @classmethod
    def registered_providers(cls) -> list[str]:
        """Return list of registered provider keys."""
        return list(cls._REGISTRY)
