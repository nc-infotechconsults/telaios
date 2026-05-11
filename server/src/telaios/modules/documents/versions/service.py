"""Document versions business-logic service."""

from __future__ import annotations

import hashlib
import uuid

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.infra.s3 import build_s3_key, upload_to_s3
from telaios.modules.documents.versions.repository import VersionRepository
from telaios.modules.documents.versions.schemas import VersionRead
from telaios.utils.errors import NotFoundError


class VersionService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = VersionRepository(session)

    async def list_by_document(self, document_id: uuid.UUID) -> list[VersionRead]:
        versions = await self._repo.list_by_document(document_id)
        return [VersionRead.model_validate(v) for v in versions]

    async def get(self, version_id: uuid.UUID) -> VersionRead:
        version = await self._repo.find(version_id)
        if version is None:
            raise NotFoundError("Version not found")
        return VersionRead.model_validate(version)

    async def create(
        self,
        project_id: uuid.UUID,
        document_id: uuid.UUID,
        file: UploadFile,
        *,
        created_by: uuid.UUID | None = None,
        change_description: str | None = None,
    ) -> VersionRead:
        content = await file.read()
        checksum = hashlib.sha256(content).hexdigest()
        mime_type = file.content_type or "application/octet-stream"
        filename = file.filename or "upload"

        next_number = (await self._repo.max_version_number(document_id)) + 1
        s3_key = build_s3_key(str(project_id), str(document_id), f"v{next_number}/{filename}")

        await upload_to_s3(s3_key, content, mime_type)

        version = await self._repo.create(
            document_id,
            version_number=next_number,
            s3_key=s3_key,
            size_bytes=len(content),
            checksum_sha256=checksum,
            change_description=change_description,
            created_by=created_by,
        )
        return VersionRead.model_validate(version)


__all__ = ["VersionService"]
