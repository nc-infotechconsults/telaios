from __future__ import annotations

import asyncio
import os
from typing import Any

from core.types import EmbeddingConfig

_LOCAL_MODEL_DEFAULT = "BAAI/bge-small-en-v1.5"
_local_embeddings: Any = None
_openai_embeddings: Any = None
_voyage_embeddings: Any = None


def resolve_provider(config: EmbeddingConfig | None = None) -> str:
    if config and config.provider:
        return config.provider.lower()

    explicit = os.environ.get("EMBEDDING_PROVIDER", "").strip().lower()
    if explicit in ("voyage", "openai", "fastembed"):
        return explicit

    if os.environ.get("EMBEDDING_API_KEY"):
        return "openai"

    llm_key = os.environ.get("LLM_API_KEY", "")
    if llm_key and not llm_key.startswith("sk-ant-"):
        return "openai"

    return "fastembed"


def _get_local_embeddings(model: str = _LOCAL_MODEL_DEFAULT) -> Any:
    global _local_embeddings
    if _local_embeddings is None:
        from fastembed import TextEmbedding

        _local_embeddings = TextEmbedding(model_name=model)
    return _local_embeddings


def _get_openai_embeddings(config: EmbeddingConfig | None = None) -> Any:
    global _openai_embeddings
    if _openai_embeddings is None:
        from langchain_openai import OpenAIEmbeddings

        kwargs: dict[str, Any] = {}
        if config:
            if config.model:
                kwargs["model"] = config.model
            if config.api_key:
                kwargs["api_key"] = config.api_key
        else:
            api_key = os.environ.get("EMBEDDING_API_KEY") or os.environ.get("LLM_API_KEY")
            if api_key:
                kwargs["api_key"] = api_key
            model = os.environ.get("EMBEDDING_MODEL")
            if model:
                kwargs["model"] = model

        base_url = os.environ.get("EMBEDDING_BASE_URL")
        if base_url:
            kwargs["base_url"] = base_url

        _openai_embeddings = OpenAIEmbeddings(**kwargs)
    return _openai_embeddings


def _get_voyage_embeddings(config: EmbeddingConfig | None = None) -> Any:
    global _voyage_embeddings
    if _voyage_embeddings is None:
        from langchain_voyageai import VoyageAIEmbeddings

        api_key = config.api_key if config else ""
        model = config.model if config and config.model else "voyage-3-lite"
        if not api_key:
            api_key = os.environ.get("EMBEDDING_API_KEY", "")
        if not api_key:
            raise ValueError(
                "Voyage AI requires an API key. "
                "Set EMBEDDING_API_KEY or pass EmbeddingConfig.api_key."
            )

        _voyage_embeddings = VoyageAIEmbeddings(voyage_api_key=api_key, model=model)
    return _voyage_embeddings


async def embed_texts(
    texts: list[str],
    config: EmbeddingConfig | None = None,
) -> list[list[float]]:
    if not texts:
        return []

    provider = resolve_provider(config)
    if provider == "voyage":
        return await _get_voyage_embeddings(config).aembed_documents(texts)
    if provider == "openai":
        return await _get_openai_embeddings(config).aembed_documents(texts)

    model_name = config.model if config and config.model else _LOCAL_MODEL_DEFAULT

    def _embed_sync() -> list[list[float]]:
        local = _get_local_embeddings(model_name)
        return [embedding.tolist() for embedding in local.embed(texts)]

    return await asyncio.to_thread(_embed_sync)
