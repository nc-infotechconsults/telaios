from __future__ import annotations

import logging

import aioboto3

from agent_service.config import config
from agent_service.services import data_client
from agent_service.services.document_extractor import extract_text
from agent_service.services.embedding_service import embed_texts
from agent_service.services.text_chunker import chunk_text

logger = logging.getLogger(__name__)

_BATCH_SIZE = 100


async def process_document(document_id: str, project_id: str) -> None:
    """
    Full document processing pipeline:
    1. Fetch document metadata from data-api
    2. Download file buffer from S3
    3. Extract text
    4. Chunk text
    5. Embed chunks (in batches)
    6. Store chunks in data-api
    7. Update document status to "ready"

    On any error, marks the document status as "error".
    """
    try:
        # 1. Get document metadata
        doc = await data_client.get_document(project_id, document_id)

        # 2. Download from S3
        session = aioboto3.Session()
        async with session.client(
            "s3",
            endpoint_url=config.S3_ENDPOINT,
            region_name=config.S3_REGION,
            aws_access_key_id=config.S3_ACCESS_KEY,
            aws_secret_access_key=config.S3_SECRET_KEY,
        ) as s3:
            response = await s3.get_object(Bucket=config.S3_BUCKET, Key=doc["s3_key"])
            body = response["Body"]
            buffer = await body.read()

        # 3. Extract text
        text = await extract_text(buffer, doc["mime_type"], doc.get("file_type"))
        if not text or not text.strip():
            await data_client.update_document_status(document_id, "ready")
            return

        # 4. Chunk
        text_chunks = chunk_text(text)

        # 5. Embed in batches
        all_embeddings: list[list[float]] = []
        for i in range(0, len(text_chunks), _BATCH_SIZE):
            batch = text_chunks[i : i + _BATCH_SIZE]
            embeddings = await embed_texts(batch)
            all_embeddings.extend(embeddings)

        # 6. Store chunks
        chunk_payload = [
            {"chunk_index": idx, "content": content, "embedding": all_embeddings[idx]}
            for idx, content in enumerate(text_chunks)
        ]
        await data_client.store_document_chunks(document_id, chunk_payload)

        # 7. Mark ready
        await data_client.update_document_status(document_id, "ready")

    except Exception as err:
        message = str(err)
        logger.error("[document_processor] Error processing %s: %s", document_id, message)
        try:
            await data_client.update_document_status(document_id, "error", message)
        except Exception:
            pass
