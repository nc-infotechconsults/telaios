"""tests/unit/modules/documents/test_service.py

Unit tests for:
  - DocumentService (main)
  - FolderService
  - TagService
  - ChunkService
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from telaios.modules.documents.folders.schemas import FolderCreate, FolderPatch, FolderRead
from telaios.modules.documents.folders.service import FolderService, _build_path
from telaios.modules.documents.schemas import DocumentPatch, DocumentRead, PresignedDownloadResponse
from telaios.modules.documents.service import DocumentService, _mime_to_file_type
from telaios.modules.documents.tags.schemas import TagCreate, TagPatch, TagRead
from telaios.modules.documents.tags.service import TagService
from telaios.utils.errors import NotFoundError


def _now() -> datetime:
    return datetime.now(UTC)


def _make_doc_mock(
    uid: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    status: str = "ready",
    file_type: str = "pdf",
    s3_key: str = "proj/doc/file.pdf",
) -> MagicMock:
    m = MagicMock()
    m.id = uid or uuid.uuid4()
    m.project_id = project_id or uuid.uuid4()
    m.folder_id = None
    m.current_version_id = None
    m.name = "report.pdf"
    m.file_type = file_type
    m.mime_type = "application/pdf"
    m.s3_key = s3_key
    m.size_bytes = 1024
    m.checksum_sha256 = "abc"
    m.status = status
    m.error_message = None
    m.doc_metadata = None
    m.uploaded_by = None
    m.created_at = _now()
    m.updated_at = _now()
    return m


def _make_folder_mock(
    uid: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    name: str = "docs",
    path: str = "/docs",
    parent_folder_id: uuid.UUID | None = None,
) -> MagicMock:
    m = MagicMock()
    m.id = uid or uuid.uuid4()
    m.project_id = project_id or uuid.uuid4()
    m.parent_folder_id = parent_folder_id
    m.name = name
    m.path = path
    m.created_by = None
    m.created_at = _now()
    m.updated_at = _now()
    return m


def _make_tag_mock(
    uid: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    name: str = "urgent",
    color: str = "#3B82F6",
) -> MagicMock:
    m = MagicMock()
    m.id = uid or uuid.uuid4()
    m.project_id = project_id or uuid.uuid4()
    m.name = name
    m.color = color
    m.created_at = _now()
    return m


def _make_doc_service() -> tuple[DocumentService, AsyncMock]:
    session = AsyncMock()
    svc = DocumentService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


def _make_folder_service() -> tuple[FolderService, AsyncMock]:
    session = AsyncMock()
    svc = FolderService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


def _make_tag_service() -> tuple[TagService, AsyncMock]:
    session = AsyncMock()
    svc = TagService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ── _mime_to_file_type helper ─────────────────────────────────────────────────


class TestMimeToFileType:
    @pytest.mark.parametrize(
        ("mime", "expected"),
        [
            ("application/pdf", "pdf"),
            ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
            ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
            ("text/markdown", "md"),
            ("text/plain", "txt"),
            ("text/csv", "csv"),
            ("application/json", "json"),
            ("application/octet-stream", "other"),
            ("image/png", "other"),
        ],
    )
    def test_known_and_fallback(self, mime: str, expected: str) -> None:
        assert _mime_to_file_type(mime) == expected


# ── _build_path helper ────────────────────────────────────────────────────────


class TestBuildPath:
    def test_root_level(self) -> None:
        assert _build_path(None, "docs") == "/docs"

    def test_nested(self) -> None:
        assert _build_path("/docs", "sub") == "/docs/sub"

    def test_deeply_nested(self) -> None:
        assert _build_path("/a/b", "c") == "/a/b/c"


# ── DocumentService.list_by_project ──────────────────────────────────────────


class TestDocumentServiceListByProject:
    @pytest.mark.asyncio
    async def test_empty(self) -> None:
        svc, repo = _make_doc_service()
        repo.list_by_project.return_value = []
        result = await svc.list_by_project(uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_read_list(self) -> None:
        svc, repo = _make_doc_service()
        mocks = [_make_doc_mock() for _ in range(3)]
        repo.list_by_project.return_value = mocks
        result = await svc.list_by_project(uuid.uuid4())
        assert len(result) == 3
        assert all(isinstance(r, DocumentRead) for r in result)

    @pytest.mark.asyncio
    async def test_passes_filters(self) -> None:
        svc, repo = _make_doc_service()
        repo.list_by_project.return_value = []
        pid = uuid.uuid4()
        fid = uuid.uuid4()
        await svc.list_by_project(pid, folder_id=fid, status="ready")
        repo.list_by_project.assert_awaited_once_with(pid, folder_id=fid, status="ready")


# ── DocumentService.get ───────────────────────────────────────────────────────


class TestDocumentServiceGet:
    @pytest.mark.asyncio
    async def test_found(self) -> None:
        svc, repo = _make_doc_service()
        doc_id = uuid.uuid4()
        repo.find.return_value = _make_doc_mock(uid=doc_id)
        result = await svc.get(doc_id)
        assert isinstance(result, DocumentRead)
        assert result.id == doc_id

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_doc_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.get(uuid.uuid4())


# ── DocumentService.get_orm ───────────────────────────────────────────────────


class TestDocumentServiceGetOrm:
    @pytest.mark.asyncio
    async def test_returns_orm_object(self) -> None:
        svc, repo = _make_doc_service()
        mock = _make_doc_mock()
        repo.find_with_deleted.return_value = mock
        result = await svc.get_orm(mock.id)
        assert result is mock

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_doc_service()
        repo.find_with_deleted.return_value = None
        with pytest.raises(NotFoundError):
            await svc.get_orm(uuid.uuid4())


# ── DocumentService.patch ─────────────────────────────────────────────────────


class TestDocumentServicePatch:
    @pytest.mark.asyncio
    async def test_patches_name(self) -> None:
        svc, repo = _make_doc_service()
        mock = _make_doc_mock()
        repo.find.return_value = mock
        repo.save.return_value = mock
        dto = DocumentPatch(name="updated.pdf")
        result = await svc.patch(mock.id, dto)
        assert isinstance(result, DocumentRead)
        assert mock.name == "updated.pdf"

    @pytest.mark.asyncio
    async def test_exclude_unset(self) -> None:
        svc, repo = _make_doc_service()
        mock = _make_doc_mock(status="ready")
        repo.find.return_value = mock
        repo.save.return_value = mock
        dto = DocumentPatch(status="error")
        await svc.patch(mock.id, dto)
        assert mock.status == "error"
        # name should be untouched
        assert mock.name == "report.pdf"

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_doc_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.patch(uuid.uuid4(), DocumentPatch(name="x"))


# ── DocumentService.update_status ────────────────────────────────────────────


class TestDocumentServiceUpdateStatus:
    @pytest.mark.asyncio
    async def test_updates_status(self) -> None:
        svc, repo = _make_doc_service()
        mock = _make_doc_mock(status="processing")
        repo.find.return_value = mock
        repo.save.return_value = mock
        result = await svc.update_status(mock.id, "ready")
        assert isinstance(result, DocumentRead)
        assert mock.status == "ready"
        assert mock.error_message is None

    @pytest.mark.asyncio
    async def test_updates_status_with_error(self) -> None:
        svc, repo = _make_doc_service()
        mock = _make_doc_mock(status="processing")
        repo.find.return_value = mock
        repo.save.return_value = mock
        await svc.update_status(mock.id, "error", "parsing failed")
        assert mock.status == "error"
        assert mock.error_message == "parsing failed"

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_doc_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.update_status(uuid.uuid4(), "ready")


# ── DocumentService.delete ────────────────────────────────────────────────────


class TestDocumentServiceDelete:
    @pytest.mark.asyncio
    async def test_soft_deletes(self) -> None:
        svc, repo = _make_doc_service()
        mock = _make_doc_mock()
        repo.find.return_value = mock
        await svc.delete(mock.id)
        repo.soft_delete.assert_awaited_once_with(mock)

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_doc_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.delete(uuid.uuid4())


# ── DocumentService.trash / restore ──────────────────────────────────────────


class TestDocumentServiceTrashRestore:
    @pytest.mark.asyncio
    async def test_trash(self) -> None:
        svc, repo = _make_doc_service()
        mock = _make_doc_mock()
        repo.find.return_value = mock
        repo.trash.return_value = mock
        result = await svc.trash(mock.id)
        assert isinstance(result, DocumentRead)
        repo.trash.assert_awaited_once_with(mock)

    @pytest.mark.asyncio
    async def test_trash_not_found(self) -> None:
        svc, repo = _make_doc_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.trash(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_restore(self) -> None:
        svc, repo = _make_doc_service()
        mock = _make_doc_mock()
        repo.find_with_deleted.return_value = mock
        repo.restore.return_value = mock
        result = await svc.restore(mock.id)
        assert isinstance(result, DocumentRead)
        repo.restore.assert_awaited_once_with(mock)

    @pytest.mark.asyncio
    async def test_restore_not_found(self) -> None:
        svc, repo = _make_doc_service()
        repo.find_with_deleted.return_value = None
        with pytest.raises(NotFoundError):
            await svc.restore(uuid.uuid4())


# ── DocumentService.presigned_download ───────────────────────────────────────


class TestDocumentServicePresignedDownload:
    @pytest.mark.asyncio
    async def test_returns_presigned_response(self) -> None:
        svc, repo = _make_doc_service()
        mock = _make_doc_mock(s3_key="proj/doc/file.pdf")
        repo.find.return_value = mock
        with patch(
            "telaios.modules.documents.service.get_presigned_download_url",
            new=AsyncMock(return_value="https://s3.example.com/signed"),
        ):
            result = await svc.presigned_download(mock.id, expires_in=1800)
        assert isinstance(result, PresignedDownloadResponse)
        assert result.url == "https://s3.example.com/signed"
        assert result.expires_in == 1800

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_doc_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.presigned_download(uuid.uuid4())


# ── DocumentService.delete_s3 ─────────────────────────────────────────────────


class TestDocumentServiceDeleteS3:
    @pytest.mark.asyncio
    async def test_calls_delete_when_found(self) -> None:
        svc, repo = _make_doc_service()
        mock = _make_doc_mock(s3_key="proj/doc/file.pdf")
        repo.find_with_deleted.return_value = mock
        with patch(
            "telaios.modules.documents.service.delete_from_s3",
            new=AsyncMock(),
        ) as mock_del:
            await svc.delete_s3(mock.id)
        mock_del.assert_awaited_once_with("proj/doc/file.pdf")

    @pytest.mark.asyncio
    async def test_no_op_when_not_found(self) -> None:
        svc, repo = _make_doc_service()
        repo.find_with_deleted.return_value = None
        with patch(
            "telaios.modules.documents.service.delete_from_s3",
            new=AsyncMock(),
        ) as mock_del:
            await svc.delete_s3(uuid.uuid4())
        mock_del.assert_not_awaited()


# ── FolderService ─────────────────────────────────────────────────────────────


class TestFolderServiceListByProject:
    @pytest.mark.asyncio
    async def test_empty(self) -> None:
        svc, repo = _make_folder_service()
        repo.list_by_project.return_value = []
        result = await svc.list_by_project(uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_folder_reads(self) -> None:
        svc, repo = _make_folder_service()
        repo.list_by_project.return_value = [_make_folder_mock(), _make_folder_mock()]
        result = await svc.list_by_project(uuid.uuid4())
        assert len(result) == 2
        assert all(isinstance(r, FolderRead) for r in result)


class TestFolderServiceGet:
    @pytest.mark.asyncio
    async def test_found(self) -> None:
        svc, repo = _make_folder_service()
        fid = uuid.uuid4()
        repo.find.return_value = _make_folder_mock(uid=fid)
        result = await svc.get(fid)
        assert isinstance(result, FolderRead)
        assert result.id == fid

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_folder_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.get(uuid.uuid4())


class TestFolderServiceCreate:
    @pytest.mark.asyncio
    async def test_creates_root_folder(self) -> None:
        svc, repo = _make_folder_service()
        pid = uuid.uuid4()
        dto = FolderCreate(name="docs")
        mock = _make_folder_mock(project_id=pid, name="docs", path="/docs")
        repo.create.return_value = mock
        result = await svc.create(pid, dto)
        assert isinstance(result, FolderRead)
        repo.create.assert_awaited_once_with(
            pid,
            name="docs",
            parent_folder_id=None,
            path="/docs",
            created_by=None,
        )

    @pytest.mark.asyncio
    async def test_creates_nested_folder(self) -> None:
        svc, repo = _make_folder_service()
        pid = uuid.uuid4()
        parent_id = uuid.uuid4()
        parent_mock = _make_folder_mock(uid=parent_id, path="/docs")
        dto = FolderCreate(name="sub", parent_folder_id=parent_id)
        child_mock = _make_folder_mock(path="/docs/sub", parent_folder_id=parent_id)
        repo.find.return_value = parent_mock
        repo.create.return_value = child_mock
        result = await svc.create(pid, dto)
        assert isinstance(result, FolderRead)
        repo.create.assert_awaited_once_with(
            pid,
            name="sub",
            parent_folder_id=parent_id,
            path="/docs/sub",
            created_by=None,
        )

    @pytest.mark.asyncio
    async def test_parent_not_found_raises(self) -> None:
        svc, repo = _make_folder_service()
        repo.find.return_value = None
        dto = FolderCreate(name="sub", parent_folder_id=uuid.uuid4())
        with pytest.raises(NotFoundError):
            await svc.create(uuid.uuid4(), dto)


class TestFolderServicePatch:
    @pytest.mark.asyncio
    async def test_patches_name_recomputes_path(self) -> None:
        svc, repo = _make_folder_service()
        fid = uuid.uuid4()
        mock = _make_folder_mock(uid=fid, name="old", path="/old")
        mock.parent_folder_id = None
        repo.find.return_value = mock
        repo.save.return_value = mock
        dto = FolderPatch(name="new")
        await svc.patch(fid, dto)
        assert mock.path == "/new"
        assert mock.name == "new"

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_folder_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.patch(uuid.uuid4(), FolderPatch(name="x"))


class TestFolderServiceDelete:
    @pytest.mark.asyncio
    async def test_soft_deletes(self) -> None:
        svc, repo = _make_folder_service()
        mock = _make_folder_mock()
        repo.find.return_value = mock
        await svc.delete(mock.id)
        repo.soft_delete.assert_awaited_once_with(mock)

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_folder_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.delete(uuid.uuid4())


# ── TagService ────────────────────────────────────────────────────────────────


class TestTagServiceListByProject:
    @pytest.mark.asyncio
    async def test_empty(self) -> None:
        svc, repo = _make_tag_service()
        repo.list_by_project.return_value = []
        result = await svc.list_by_project(uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_tag_reads(self) -> None:
        svc, repo = _make_tag_service()
        repo.list_by_project.return_value = [_make_tag_mock(), _make_tag_mock()]
        result = await svc.list_by_project(uuid.uuid4())
        assert len(result) == 2
        assert all(isinstance(r, TagRead) for r in result)


class TestTagServiceGet:
    @pytest.mark.asyncio
    async def test_found(self) -> None:
        svc, repo = _make_tag_service()
        tid = uuid.uuid4()
        repo.find.return_value = _make_tag_mock(uid=tid)
        result = await svc.get(tid)
        assert isinstance(result, TagRead)
        assert result.id == tid

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_tag_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.get(uuid.uuid4())


class TestTagServiceCreate:
    @pytest.mark.asyncio
    async def test_creates_tag(self) -> None:
        svc, repo = _make_tag_service()
        pid = uuid.uuid4()
        dto = TagCreate(name="urgent", color="#FF0000")
        mock = _make_tag_mock(project_id=pid, name="urgent", color="#FF0000")
        repo.create.return_value = mock
        result = await svc.create(pid, dto)
        assert isinstance(result, TagRead)
        repo.create.assert_awaited_once_with(pid, name="urgent", color="#FF0000")

    @pytest.mark.asyncio
    async def test_default_color(self) -> None:
        svc, repo = _make_tag_service()
        dto = TagCreate(name="info")
        mock = _make_tag_mock(name="info")
        repo.create.return_value = mock
        pid = uuid.uuid4()
        await svc.create(pid, dto)
        repo.create.assert_awaited_once_with(pid, name="info", color="#3B82F6")


class TestTagServicePatch:
    @pytest.mark.asyncio
    async def test_patches_name(self) -> None:
        svc, repo = _make_tag_service()
        mock = _make_tag_mock(name="old")
        repo.find.return_value = mock
        repo.save.return_value = mock
        dto = TagPatch(name="new")
        result = await svc.patch(mock.id, dto)
        assert isinstance(result, TagRead)
        assert mock.name == "new"

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_tag_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.patch(uuid.uuid4(), TagPatch(name="x"))


class TestTagServiceDelete:
    @pytest.mark.asyncio
    async def test_deletes(self) -> None:
        svc, repo = _make_tag_service()
        mock = _make_tag_mock()
        repo.find.return_value = mock
        await svc.delete(mock.id)
        repo.delete_tag.assert_awaited_once_with(mock)

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_tag_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.delete(uuid.uuid4())


class TestTagServiceDocumentAssociation:
    @pytest.mark.asyncio
    async def test_add_to_document(self) -> None:
        svc, repo = _make_tag_service()
        doc_id = uuid.uuid4()
        tag_id = uuid.uuid4()
        repo.find.return_value = _make_tag_mock(uid=tag_id)
        await svc.add_to_document(doc_id, tag_id)
        repo.add_to_document.assert_awaited_once_with(doc_id, tag_id)

    @pytest.mark.asyncio
    async def test_add_to_document_tag_not_found(self) -> None:
        svc, repo = _make_tag_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.add_to_document(uuid.uuid4(), uuid.uuid4())

    @pytest.mark.asyncio
    async def test_remove_from_document(self) -> None:
        svc, repo = _make_tag_service()
        doc_id = uuid.uuid4()
        tag_id = uuid.uuid4()
        await svc.remove_from_document(doc_id, tag_id)
        repo.remove_from_document.assert_awaited_once_with(doc_id, tag_id)
