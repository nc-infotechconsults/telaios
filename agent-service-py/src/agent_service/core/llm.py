from __future__ import annotations

from typing import Optional

from langchain_core.language_models.chat_models import BaseChatModel


def build_chat_model(
    provider: str,
    model: str,
    api_key: str,
    base_url: Optional[str] = None,
) -> BaseChatModel:
    """Return a LangChain chat model for the given provider configuration."""
    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=model, api_key=api_key)  # type: ignore[arg-type]

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(model=model, api_key=api_key)  # type: ignore[arg-type]

    # Default: OpenAI-compatible with custom base URL
    from langchain_openai import ChatOpenAI

    kwargs: dict = {"model": model, "api_key": api_key or "placeholder"}
    if base_url:
        kwargs["base_url"] = base_url
    return ChatOpenAI(**kwargs)
