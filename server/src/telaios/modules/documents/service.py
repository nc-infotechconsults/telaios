"""Documents business-logic service."""

from __future__ import annotations

import contextlib
import hashlib
import logging
import uuid
from typing import Any

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.documents import Document
from telaios.domain.enums import DocumentStatus
from telaios.infra.s3 import (
    build_s3_key,
    delete_from_s3,
    download_from_s3,
    get_presigned_download_url,
    upload_to_s3,
)
from telaios.modules.documents.repository import DocumentRepository
from telaios.modules.documents.schemas import DocumentPatch, DocumentRead, PresignedDownloadResponse
from telaios.utils.errors import NotFoundError

logger = logging.getLogger(__name__)

_MIME_TO_FILE_TYPE: dict[str, str] = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/markdown": "md",
    "text/plain": "txt",
    "text/csv": "csv",
    "application/json": "json",
}


def _mime_to_file_type(mime_type: str) -> str:
    return _MIME_TO_FILE_TYPE.get(mime_type, "other")


class DocumentService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = DocumentRepository(session)

    async def list_by_project(
        self,
        project_id: uuid.UUID,
        *,
        folder_id: uuid.UUID | None = None,
        status: str | None = None,
    ) -> list[DocumentRead]:
        docs = await self._repo.list_by_project(project_id, folder_id=folder_id, status=status)
        return [DocumentRead.model_validate(d) for d in docs]

    async def get(self, document_id: uuid.UUID) -> DocumentRead:
        doc = await self._repo.find(document_id)
        if doc is None:
            raise NotFoundError("Document not found")
        return DocumentRead.model_validate(doc)

    async def get_orm(self, document_id: uuid.UUID) -> Document:
        doc = await self._repo.find_with_deleted(document_id)
        if doc is None:
            raise NotFoundError("Document not found")
        return doc

    async def upload(
        self,
        project_id: uuid.UUID,
        file: UploadFile,
        *,
        uploaded_by: uuid.UUID | None = None,
        folder_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> DocumentRead:
        content = await file.read()
        checksum = hashlib.sha256(content).hexdigest()
        mime_type = file.content_type or "application/octet-stream"
        file_type = _mime_to_file_type(mime_type)
        filename = file.filename or "upload"

        # Create DB record first so we have an ID for the S3 key.
        doc = await self._repo.create(
            project_id,
            name=filename,
            file_type=file_type,
            mime_type=mime_type,
            s3_key="__placeholder__",
            size_bytes=len(content),
            checksum_sha256=checksum,
            status=DocumentStatus.UPLOADING,
            doc_metadata=metadata,
            uploaded_by=uploaded_by,
            folder_id=folder_id,
        )

        s3_key = build_s3_key(str(project_id), str(doc.id), filename)
        doc.s3_key = s3_key
        doc.status = DocumentStatus.PROCESSING
        doc = await self._repo.save(doc)

        await upload_to_s3(s3_key, content, mime_type)
        return DocumentRead.model_validate(doc)

    async def patch(self, document_id: uuid.UUID, dto: DocumentPatch) -> DocumentRead:
        doc = await self._repo.find(document_id)
        if doc is None:
            raise NotFoundError("Document not found")
        for key, value in dto.model_dump(exclude_unset=True).items():
            setattr(doc, key, value)
        doc = await self._repo.save(doc)
        return DocumentRead.model_validate(doc)

    async def update_status(
        self,
        document_id: uuid.UUID,
        status: DocumentStatus,
        error_message: str | None = None,
    ) -> DocumentRead:
        doc = await self._repo.find(document_id)
        if doc is None:
            raise NotFoundError("Document not found")
        doc.status = status
        doc.error_message = error_message
        doc = await self._repo.save(doc)
        return DocumentRead.model_validate(doc)

    async def delete(self, document_id: uuid.UUID) -> None:
        doc = await self._repo.find(document_id)
        if doc is None:
            raise NotFoundError("Document not found")
        await self._repo.soft_delete(doc)

    async def trash(self, document_id: uuid.UUID) -> DocumentRead:
        doc = await self._repo.find(document_id)
        if doc is None:
            raise NotFoundError("Document not found")
        doc = await self._repo.trash(doc)
        return DocumentRead.model_validate(doc)

    async def restore(self, document_id: uuid.UUID) -> DocumentRead:
        doc = await self._repo.find_with_deleted(document_id)
        if doc is None:
            raise NotFoundError("Document not found")
        doc = await self._repo.restore(doc)
        return DocumentRead.model_validate(doc)

    async def presigned_download(
        self, document_id: uuid.UUID, expires_in: int = 3600
    ) -> PresignedDownloadResponse:
        doc = await self._repo.find(document_id)
        if doc is None:
            raise NotFoundError("Document not found")
        url = await get_presigned_download_url(doc.s3_key, expires_in)
        return PresignedDownloadResponse(url=url, expires_in=expires_in)

    async def delete_s3(self, document_id: uuid.UUID) -> None:
        """Permanently remove the S3 object (used in hard-delete flows)."""
        doc = await self._repo.find_with_deleted(document_id)
        if doc is not None:
            await delete_from_s3(doc.s3_key)

    async def process(self, document_id: uuid.UUID, project_id: uuid.UUID) -> None:
        """Run the full extraction pipeline for a document.

        Steps:
        1. Fetch document ORM record.
        2. Download raw bytes from S3.
        3. Extract text → chunk → embed (pure tools layer).
        4. Store chunks via :class:`~telaios.modules.documents.chunks.service.ChunkService`.
        5. Set status to ``"ready"``; on any error set status to ``"error"``.

        *project_id* is accepted for symmetry with the background-job signature
        but is not used (the document record already contains the project).
        """
        # Lazy imports to keep the module importable without the tools deps
        # loaded at startup, and to avoid a hard coupling at module level.
        from telaios.modules.documents.chunks.service import ChunkService
        from telaios.tools.builtin.documents.processing import extract_chunks

        _ = project_id

        try:
            doc = await self._repo.find_with_deleted(document_id)
            if doc is None:
                raise NotFoundError("Document not found")

            content = await download_from_s3(doc.s3_key)
            chunks = await extract_chunks(
                content, doc.mime_type or "application/octet-stream", doc.file_type
            )
            await ChunkService(self._repo._s).store(document_id, chunks)
            await self.update_status(document_id, DocumentStatus.READY)
        except Exception as err:
            message = str(err)
            logger.error("[document_processor] Error processing %s: %s", document_id, message)
            with contextlib.suppress(Exception):
                await self.update_status(document_id, DocumentStatus.ERROR, message)


__all__ = ["DocumentService"]
