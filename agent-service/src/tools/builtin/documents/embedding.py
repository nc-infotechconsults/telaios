"""Document embedding helpers."""

from __future__ import annotations

from core.types import Chunk, EmbeddingConfig
from infra.embeddings import embed_texts as _embed_texts
from infra.embeddings import resolve_provider


async def embed_texts(
    texts: list[str],
    config: EmbeddingConfig | None = None,
) -> list[list[float]]:
    return await _embed_texts(texts, config)


async def embed_chunks(
    chunks: list[Chunk],
    config: EmbeddingConfig | None = None,
) -> list[Chunk]:
    if not chunks:
        return []

    embeddings = await embed_texts([chunk.content for chunk in chunks], config)
    return [
        Chunk(
            id=chunk.id,
            document_id=chunk.document_id,
            content=chunk.content,
            embedding=embedding,
            metadata=chunk.metadata,
        )
        for chunk, embedding in zip(chunks, embeddings)
    ]


__all__ = ["embed_chunks", "embed_texts", "resolve_provider"]
