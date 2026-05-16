"""Document processing pipeline — pure ETL (no DB, no S3 orchestration).

The public entry-point is :func:`extract_chunks`:

    chunks = await extract_chunks(file_bytes, "application/pdf", "pdf")

Embeddings are handled by Chroma; this pipeline returns text-only chunks.

The full orchestration (fetch from DB, download from S3, store chunks, update
status) lives in :class:`telaios.modules.documents.service.DocumentService`
so that the tools layer remains free of module-level imports.
"""

from __future__ import annotations

import logging
from typing import Any

from telaios.tools.builtin.documents.chunking import chunk_text
from telaios.tools.builtin.documents.extraction import extract_text

logger = logging.getLogger(__name__)


async def extract_chunks(
    content: bytes,
    mime_type: str,
    file_type: str | None = None,
) -> list[dict[str, Any]]:
    """Extract text and chunk it. Embedding is handled by Chroma at store time.

    Returns an empty list when the document has no extractable text.

    Each item in the returned list has keys:
    * ``chunk_index`` (int)
    * ``content`` (str)
    """
    text = await extract_text(content, mime_type, file_type)
    if not text or not text.strip():
        return []

    text_chunks = chunk_text(text)
    return [{"chunk_index": idx, "content": chunk} for idx, chunk in enumerate(text_chunks)]
