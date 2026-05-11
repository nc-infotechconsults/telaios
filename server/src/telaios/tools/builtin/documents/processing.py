"""Document processing pipeline — pure ETL (no DB, no S3 orchestration).

The public entry-point is :func:`extract_chunks`:

    chunks = await extract_chunks(file_bytes, "application/pdf", "pdf")

The full orchestration (fetch from DB, download from S3, store chunks, update
status) lives in :class:`telaios.modules.documents.service.DocumentService`
so that the tools layer remains free of module-level imports.
"""

from __future__ import annotations

import logging
from typing import Any

from telaios.tools.builtin.documents.chunking import chunk_text
from telaios.tools.builtin.documents.embedding import embed_texts
from telaios.tools.builtin.documents.extraction import extract_text

logger = logging.getLogger(__name__)

_BATCH_SIZE = 100


async def extract_chunks(
    content: bytes,
    mime_type: str,
    file_type: str | None = None,
) -> list[dict[str, Any]]:
    """Extract text, chunk it, embed each chunk, and return DB-ready dicts.

    Returns an empty list when the document has no extractable text.

    Each item in the returned list has keys:
    * ``chunk_index`` (int)
    * ``content`` (str)
    * ``embedding`` (list[float])
    """
    text = await extract_text(content, mime_type, file_type)
    if not text or not text.strip():
        return []

    text_chunks = chunk_text(text)
    all_embeddings: list[list[float]] = []
    for index in range(0, len(text_chunks), _BATCH_SIZE):
        batch = text_chunks[index : index + _BATCH_SIZE]
        all_embeddings.extend(await embed_texts(batch))

    return [
        {"chunk_index": idx, "content": chunk, "embedding": all_embeddings[idx]}
        for idx, chunk in enumerate(text_chunks)
    ]
