"""TEIEmbedder — Text Embeddings Inference HTTP client.

Connects to a Hugging Face TEI server (https://github.com/huggingface/text-embeddings-inference).
TEI exposes an OpenAI-compatible ``/embed`` endpoint that accepts a batch of
strings and returns a list of float vectors.

Docker quickstart (add to docker-compose.dev.yml):
  tei:
    image: ghcr.io/huggingface/text-embeddings-inference:cpu-1.5
    command: --model-id BAAI/bge-m3 --port 8080
    ports: ["8080:8080"]

Config (.env):
  EMBEDDING_PROVIDER=tei
  EMBEDDING_MODEL=BAAI/bge-m3
  EMBEDDING_BASE_URL=http://localhost:8080
  EMBEDDING_DIM=1024

Source: https://huggingface.github.io/text-embeddings-inference/
"""

from __future__ import annotations

import logging
from typing import Any

from telaios.core.embedders.base import Embedder

logger = logging.getLogger(__name__)


class TEIEmbedder(Embedder):
    """Async HTTP client for a Hugging Face TEI server.

    TEI endpoint: ``POST /embed``
    Request body: ``{"inputs": ["text1", "text2"]}``
    Response:     ``[[0.1, 0.2, ...], [0.3, 0.4, ...]]``
    """

    def __init__(
        self,
        base_url: str,
        model: str = "BAAI/bge-m3",
        dimensions: int = 1024,
        api_key: str | None = None,
        timeout: int = 30,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._model_name = model
        self._dims = dimensions
        self._timeout = timeout
        self._headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            self._headers["Authorization"] = f"Bearer {api_key}"

        logger.info(
            "TEIEmbedder initialised: url=%r model=%r dims=%d",
            self._base_url, model, dimensions,
        )

    async def embed(self, texts: list[str]) -> list[list[float]]:
        import httpx

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/embed",
                json={"inputs": texts},
                headers=self._headers,
            )
            resp.raise_for_status()
            data: Any = resp.json()

        # TEI returns list[list[float]] directly
        return data

    async def embed_query(self, text: str) -> list[float]:
        results = await self.embed([text])
        return results[0]

    @property
    def dimensions(self) -> int:
        return self._dims


__all__ = ["TEIEmbedder"]
