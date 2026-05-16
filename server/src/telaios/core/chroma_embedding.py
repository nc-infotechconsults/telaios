"""
core/chroma_embedding.py — Chroma EmbeddingFunction adapter.

Adapts the project's ``EmbeddingConfig`` to Chroma's ``EmbeddingFunction``
interface so that the Chroma client auto-embeds documents during ``add()``,
``update()``, and ``query()``.

Sources:
  - Chroma custom embedding functions:
    https://docs.trychroma.com/docs/embeddings/embedding-functions#custom-embedding-functions
  - Chroma EmbeddingFunction base class:
    https://docs.trychroma.com/reference/python/embedding-functions
"""

from __future__ import annotations

from typing import Any

from chromadb import Documents, EmbeddingFunction

from telaios.core.types import EmbeddingConfig


class ChromaEmbeddingFunction(EmbeddingFunction):  # type: ignore[type-arg]
    """Embedding function that delegates to the project's embedding provider.

    Required by Chroma's ``collection.add(..., embedding_function=...)`` and
    ``collection.query(query_texts=..., ...)`` APIs.
    """

    def __init__(self, config: EmbeddingConfig) -> None:
        self._config = config
        self._impl = _build_embedding_impl(config)

    def __call__(self, input: Documents) -> Any:
        """Chroma calls this when it needs embeddings for *input* documents.

        Returns a list of vectors (one per input document).
        """
        return self._impl(input)

    @staticmethod
    def name() -> str:
        return "telaios-chroma-ef"

    def get_config(self) -> dict[str, Any]:
        return self._config.model_dump()

    @staticmethod
    def build_from_config(config: dict[str, Any]) -> ChromaEmbeddingFunction:
        return ChromaEmbeddingFunction(EmbeddingConfig(**config))


def _build_embedding_impl(config: EmbeddingConfig) -> Any:
    """Build the concrete embedding function from ``EmbeddingConfig``.

    Supported providers:
      - ``openai`` → OpenAI text-embedding-3-small/ada-002
      - ``sentence_transformers`` → all-MiniLM-L6-v2 (default)
      - ``fastembed`` → BAAI/bge-small-en-v1.5 (local, no API key)
      - ``ollama`` → nomic-embed-text (local)
    """
    provider = config.provider.lower()

    if provider == "openai":
        try:
            import openai
        except ImportError:
            return _default_ef()

        client = openai.OpenAI(api_key=config.api_key or None)
        model = config.model or "text-embedding-3-small"
        dimensions = config.dimensions

        def _openai_embed(texts: list[str]) -> list[list[float]]:
            kwargs: dict[str, Any] = {"model": model, "input": texts}
            if dimensions:
                kwargs["dimensions"] = dimensions
            resp = client.embeddings.create(**kwargs)
            return [d.embedding for d in resp.data]

        return _openai_embed

    if provider == "sentence_transformers":
        from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

        model = config.model or "all-MiniLM-L6-v2"
        ef = SentenceTransformerEmbeddingFunction(model_name=model)
        return ef

    if provider == "fastembed":
        try:
            from fastembed import TextEmbedding
        except ImportError:
            return _default_ef()

        model = config.model or "BAAI/bge-small-en-v1.5"
        te = TextEmbedding(model_name=model)

        def _fastembed(texts: list[str]) -> list[list[float]]:
            return [emb.tolist() for emb in te.embed(texts)]

        return _fastembed

    if provider == "ollama":
        import httpx

        base_url = config.api_key or "http://localhost:11434"
        model = config.model or "nomic-embed-text"

        def _ollama_embed(texts: list[str]) -> list[list[float]]:
            embeddings: list[list[float]] = []
            for text in texts:
                r = httpx.post(
                    f"{base_url}/api/embeddings",
                    json={"model": model, "prompt": text},
                    timeout=30,
                )
                r.raise_for_status()
                embeddings.append(r.json()["embedding"])
            return embeddings

        return _ollama_embed

    # Default: fastembed BAAI/bge-small-en-v1.5 (local, no extra deps)
    # Source: https://docs.trychroma.com/docs/embeddings/embedding-functions
    return _default_ef()


def _default_ef() -> Any:
    """Build the default embedding function (fastembed or Chroma's default).

    Prefers fastembed (already in project deps) over sentence_transformers
    to avoid requiring an additional pip package for local dev.
    """
    try:
        from fastembed import TextEmbedding

        model = "BAAI/bge-small-en-v1.5"
        te = TextEmbedding(model_name=model)

        def _fe(texts: list[str]) -> list[list[float]]:
            return [emb.tolist() for emb in te.embed(texts)]

        return _fe
    except ImportError:
        from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

        return DefaultEmbeddingFunction()
