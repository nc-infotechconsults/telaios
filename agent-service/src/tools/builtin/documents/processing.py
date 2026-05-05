from __future__ import annotations

import logging

import aioboto3

from infra import data_client
from infra.settings import config
from tools.builtin.documents.chunking import chunk_text
from tools.builtin.documents.embedding import embed_texts
from tools.builtin.documents.extraction import extract_text

logger = logging.getLogger(__name__)

_BATCH_SIZE = 100


async def process_document(document_id: str, project_id: str) -> None:
    try:
        doc = await data_client.get_document(project_id, document_id)

        session = aioboto3.Session()
        async with session.client(
            "s3",
            endpoint_url=config.S3_ENDPOINT,
            region_name=config.S3_REGION,
            aws_access_key_id=config.S3_ACCESS_KEY,
            aws_secret_access_key=config.S3_SECRET_KEY,
        ) as s3:
            response = await s3.get_object(Bucket=config.S3_BUCKET, Key=doc["s3_key"])
            buffer = await response["Body"].read()

        text = await extract_text(buffer, doc["mime_type"], doc.get("file_type"))
        if not text or not text.strip():
            await data_client.update_document_status(document_id, "ready")
            return

        text_chunks = chunk_text(text)
        all_embeddings: list[list[float]] = []
        for index in range(0, len(text_chunks), _BATCH_SIZE):
            batch = text_chunks[index:index + _BATCH_SIZE]
            all_embeddings.extend(await embed_texts(batch))

        await data_client.store_document_chunks(
            document_id,
            [
                {"chunk_index": index, "content": content, "embedding": all_embeddings[index]}
                for index, content in enumerate(text_chunks)
            ],
        )
        await data_client.update_document_status(document_id, "ready")
    except Exception as err:
        message = str(err)
        logger.error("[document_processor] Error processing %s: %s", document_id, message)
        try:
            await data_client.update_document_status(document_id, "error", message)
        except Exception:
            pass
