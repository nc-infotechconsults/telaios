from __future__ import annotations

import logging
from typing import Optional

from agent_service.config import config

logger = logging.getLogger(__name__)

_local_embeddings = None
_openai_embeddings = None


def _has_openai_key() -> bool:
    key = config.EMBEDDING_API_KEY or config.LLM_API_KEY or ""
    # Anthropic keys start with "sk-ant-" — they won't work with OpenAI embeddings
    return bool(key) and not key.startswith("sk-ant-")


def _get_local_embeddings():
    global _local_embeddings
    if _local_embeddings is None:
        from fastembed import TextEmbedding

        _local_embeddings = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
    return _local_embeddings


def _get_openai_embeddings():
    global _openai_embeddings
    if _openai_embeddings is None:
        from langchain_openai import OpenAIEmbeddings

        api_key = config.EMBEDDING_API_KEY or config.LLM_API_KEY or None
        kwargs: dict = {"model": config.EMBEDDING_MODEL}
        if api_key:
            kwargs["api_key"] = api_key
        if config.EMBEDDING_BASE_URL:
            kwargs["base_url"] = config.EMBEDDING_BASE_URL
        _openai_embeddings = OpenAIEmbeddings(**kwargs)
    return _openai_embeddings


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Embed an array of text strings.

    - If an OpenAI-compatible key is configured, uses the OpenAI embeddings API.
    - Otherwise falls back to a local ONNX model via fastembed
      (BAAI/bge-small-en-v1.5, 384-dimensional) that requires no API key.
    """
    if not texts:
        return []

    if _has_openai_key():
        model = _get_openai_embeddings()
        return await model.aembed_documents(texts)

    # Local fastembed fallback (runs in a thread to avoid blocking the event loop)
    import asyncio

    def _embed_sync() -> list[list[float]]:
        model = _get_local_embeddings()
        results: list[list[float]] = []
        for embedding in model.embed(texts):
            results.append(embedding.tolist())
        return results

    return await asyncio.to_thread(_embed_sync)
