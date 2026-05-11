from __future__ import annotations

import contextlib
import logging
from typing import Any

import aioboto3

from telaios.config.settings import settings
from telaios.tools.builtin.documents.chunking import chunk_text
from telaios.tools.builtin.documents.embedding import embed_texts
from telaios.tools.builtin.documents.extraction import extract_text

logger = logging.getLogger(__name__)

_BATCH_SIZE = 100


async def _get_document(project_id: str, document_id: str) -> Any:
    # TODO(migration): rewire to telaios.modules.documents.service in Phase 7
    raise NotImplementedError("rewire to telaios.modules.documents.service in Phase 7")


async def _update_document_status(document_id: str, status: str, error: str | None = None) -> None:
    # TODO(migration): rewire to telaios.modules.documents.service in Phase 7
    raise NotImplementedError("rewire to telaios.modules.documents.service in Phase 7")


async def _store_document_chunks(document_id: str, chunks: list[dict[str, Any]]) -> None:
    # TODO(migration): rewire to telaios.modules.documents.service in Phase 7
    raise NotImplementedError("rewire to telaios.modules.documents.service in Phase 7")


async def process_document(document_id: str, project_id: str) -> None:
    try:
        doc = await _get_document(project_id, document_id)

        session = aioboto3.Session()
        async with session.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        ) as s3:
            response = await s3.get_object(Bucket=settings.S3_BUCKET, Key=doc["s3_key"])
            buffer = await response["Body"].read()

        text = await extract_text(buffer, doc["mime_type"], doc.get("file_type"))
        if not text or not text.strip():
            await _update_document_status(document_id, "ready")
            return

        text_chunks = chunk_text(text)
        all_embeddings: list[list[float]] = []
        for index in range(0, len(text_chunks), _BATCH_SIZE):
            batch = text_chunks[index : index + _BATCH_SIZE]
            all_embeddings.extend(await embed_texts(batch))

        await _store_document_chunks(
            document_id,
            [
                {"chunk_index": index, "content": content, "embedding": all_embeddings[index]}
                for index, content in enumerate(text_chunks)
            ],
        )
        await _update_document_status(document_id, "ready")
    except Exception as err:
        message = str(err)
        logger.error("[document_processor] Error processing %s: %s", document_id, message)
        with contextlib.suppress(Exception):
            await _update_document_status(document_id, "error", message)
