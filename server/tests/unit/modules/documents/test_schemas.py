"""tests/unit/modules/documents/test_schemas.py

Unit tests for document-domain Pydantic schemas:
  - documents (main): DocumentPatch, DocumentRead, PresignedDownloadResponse
  - folders:          FolderCreate, FolderPatch, FolderRead
  - tags:             TagCreate, TagPatch, TagRead
  - versions:         VersionRead
  - comments:         CommentCreate, CommentPatch, CommentRead
  - activities:       ActivityRead
  - favorites:        FavoriteRead
  - templates:        TemplateCreate, TemplatePatch, TemplateRead
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from telaios.modules.document_copilot.schemas import AskRequest, ChatRequest
from telaios.modules.document_llm.schemas import (
    CompareRequest,
    ConvertRequest,
    ExtractRequest,
    SummarizeRequest,
)
from telaios.modules.documents.activities.schemas import ActivityRead
from telaios.modules.documents.comments.schemas import CommentCreate, CommentPatch, CommentRead
from telaios.modules.documents.favorites.schemas import FavoriteRead
from telaios.modules.documents.folders.schemas import FolderCreate, FolderPatch, FolderRead
from telaios.modules.documents.schemas import (
    DocumentPatch,
    DocumentRead,
    PresignedDownloadResponse,
)
from telaios.modules.documents.tags.schemas import TagCreate, TagPatch, TagRead
from telaios.modules.documents.templates.schemas import TemplateCreate, TemplatePatch, TemplateRead
from telaios.modules.documents.versions.schemas import VersionRead


def _now() -> datetime:
    return datetime.now(UTC)


def _make_doc_orm(
    uid: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    status: str = "ready",
    file_type: str = "pdf",
) -> MagicMock:
    m = MagicMock()
    m.id = uid or uuid.uuid4()
    m.project_id = project_id or uuid.uuid4()
    m.folder_id = None
    m.current_version_id = None
    m.name = "report.pdf"
    m.file_type = file_type
    m.mime_type = "application/pdf"
    m.s3_key = "projects/abc/docs/report.pdf"
    m.size_bytes = 1024
    m.checksum_sha256 = "abc123"
    m.status = status
    m.error_message = None
    m.doc_metadata = None
    m.uploaded_by = None
    m.created_at = _now()
    m.updated_at = _now()
    return m


# ── DocumentPatch ─────────────────────────────────────────────────────────────


class TestDocumentPatch:
    def test_all_optional(self) -> None:
        patch = DocumentPatch()
        assert patch.name is None
        assert patch.folder_id is None
        assert patch.status is None
        assert patch.error_message is None
        assert patch.current_version_id is None

    def test_partial_set(self) -> None:
        patch = DocumentPatch(name="new_name.pdf", status="ready")
        assert patch.name == "new_name.pdf"
        assert patch.status == "ready"
        assert patch.folder_id is None

    def test_model_dump_exclude_unset(self) -> None:
        patch = DocumentPatch(name="x.pdf")
        dumped = patch.model_dump(exclude_unset=True)
        assert list(dumped.keys()) == ["name"]


# ── DocumentRead ──────────────────────────────────────────────────────────────


class TestDocumentRead:
    def test_from_orm(self) -> None:
        orm = _make_doc_orm()
        read = DocumentRead.model_validate(orm)
        assert read.id == orm.id
        assert read.project_id == orm.project_id
        assert read.name == "report.pdf"
        assert read.file_type == "pdf"
        assert read.status == "ready"

    def test_file_type_literals(self) -> None:
        for ft in ("pdf", "docx", "xlsx", "md", "txt", "csv", "json", "other"):
            orm = _make_doc_orm(file_type=ft)
            read = DocumentRead.model_validate(orm)
            assert read.file_type == ft

    def test_status_literals(self) -> None:
        for status in ("uploading", "processing", "ready", "error"):
            orm = _make_doc_orm(status=status)
            read = DocumentRead.model_validate(orm)
            assert read.status == status

    def test_optional_fields_none(self) -> None:
        orm = _make_doc_orm()
        read = DocumentRead.model_validate(orm)
        assert read.folder_id is None
        assert read.current_version_id is None
        assert read.error_message is None
        assert read.doc_metadata is None
        assert read.uploaded_by is None


# ── PresignedDownloadResponse ─────────────────────────────────────────────────


class TestPresignedDownloadResponse:
    def test_basic(self) -> None:
        resp = PresignedDownloadResponse(url="https://s3.example.com/file", expires_in=3600)
        assert resp.url.startswith("https://")
        assert resp.expires_in == 3600


# ── FolderCreate / FolderPatch / FolderRead ───────────────────────────────────


class TestFolderSchemas:
    def test_folder_create_defaults(self) -> None:
        fc = FolderCreate(name="docs")
        assert fc.name == "docs"
        assert fc.parent_folder_id is None

    def test_folder_create_with_parent(self) -> None:
        parent = uuid.uuid4()
        fc = FolderCreate(name="sub", parent_folder_id=parent)
        assert fc.parent_folder_id == parent

    def test_folder_patch_all_none(self) -> None:
        fp = FolderPatch()
        assert fp.name is None
        assert fp.parent_folder_id is None

    def test_folder_patch_exclude_unset(self) -> None:
        fp = FolderPatch(name="renamed")
        dumped = fp.model_dump(exclude_unset=True)
        assert list(dumped.keys()) == ["name"]

    def test_folder_read_from_orm(self) -> None:
        orm = MagicMock()
        orm.id = uuid.uuid4()
        orm.project_id = uuid.uuid4()
        orm.parent_folder_id = None
        orm.name = "docs"
        orm.path = "/docs"
        orm.created_by = None
        orm.created_at = _now()
        orm.updated_at = _now()
        read = FolderRead.model_validate(orm)
        assert read.name == "docs"
        assert read.path == "/docs"


# ── TagCreate / TagPatch / TagRead ────────────────────────────────────────────


class TestTagSchemas:
    def test_tag_create_defaults(self) -> None:
        tc = TagCreate(name="important")
        assert tc.name == "important"
        assert tc.color == "#3B82F6"

    def test_tag_create_custom_color(self) -> None:
        tc = TagCreate(name="urgent", color="#FF0000")
        assert tc.color == "#FF0000"

    def test_tag_patch_all_none(self) -> None:
        tp = TagPatch()
        assert tp.name is None
        assert tp.color is None

    def test_tag_patch_exclude_unset(self) -> None:
        tp = TagPatch(color="#00FF00")
        dumped = tp.model_dump(exclude_unset=True)
        assert list(dumped.keys()) == ["color"]

    def test_tag_read_from_orm(self) -> None:
        orm = MagicMock()
        orm.id = uuid.uuid4()
        orm.project_id = uuid.uuid4()
        orm.name = "finance"
        orm.color = "#3B82F6"
        orm.created_at = _now()
        read = TagRead.model_validate(orm)
        assert read.name == "finance"
        assert read.color == "#3B82F6"


# ── VersionRead ───────────────────────────────────────────────────────────────


class TestVersionRead:
    def test_from_orm(self) -> None:
        orm = MagicMock()
        orm.id = uuid.uuid4()
        orm.document_id = uuid.uuid4()
        orm.version_number = 3
        orm.s3_key = "projects/abc/docs/v3/file.pdf"
        orm.size_bytes = 2048
        orm.checksum_sha256 = "deadbeef"
        orm.change_description = "Updated charts"
        orm.created_by = uuid.uuid4()
        orm.created_at = _now()
        read = VersionRead.model_validate(orm)
        assert read.version_number == 3
        assert read.change_description == "Updated charts"

    def test_optional_fields_none(self) -> None:
        orm = MagicMock()
        orm.id = uuid.uuid4()
        orm.document_id = uuid.uuid4()
        orm.version_number = 1
        orm.s3_key = "k"
        orm.size_bytes = 0
        orm.checksum_sha256 = "x"
        orm.change_description = None
        orm.created_by = None
        orm.created_at = _now()
        read = VersionRead.model_validate(orm)
        assert read.change_description is None
        assert read.created_by is None


# ── CommentCreate / CommentPatch / CommentRead ────────────────────────────────


class TestCommentSchemas:
    def test_comment_create_defaults(self) -> None:
        cc = CommentCreate(content="Nice doc!")
        assert cc.content == "Nice doc!"
        assert cc.anchor_type == "general"
        assert cc.anchor_data is None
        assert cc.parent_comment_id is None

    def test_comment_create_full(self) -> None:
        parent = uuid.uuid4()
        cc = CommentCreate(
            content="See page 3",
            anchor_type="page",
            anchor_data={"page": 3},
            parent_comment_id=parent,
        )
        assert cc.anchor_type == "page"
        assert cc.anchor_data == {"page": 3}
        assert cc.parent_comment_id == parent

    def test_comment_patch_all_none(self) -> None:
        cp = CommentPatch()
        assert cp.content is None
        assert cp.resolved is None

    def test_comment_patch_exclude_unset(self) -> None:
        cp = CommentPatch(resolved=True)
        dumped = cp.model_dump(exclude_unset=True)
        assert list(dumped.keys()) == ["resolved"]

    def test_comment_read_from_orm(self) -> None:
        orm = MagicMock()
        orm.id = uuid.uuid4()
        orm.document_id = uuid.uuid4()
        orm.user_id = uuid.uuid4()
        orm.content = "LGTM"
        orm.anchor_type = "general"
        orm.anchor_data = None
        orm.resolved = False
        orm.parent_comment_id = None
        orm.created_at = _now()
        orm.updated_at = _now()
        read = CommentRead.model_validate(orm)
        assert read.content == "LGTM"
        assert read.resolved is False

    @pytest.mark.parametrize("anchor_type", ["page", "cell", "text_range", "general"])
    def test_anchor_type_literals(self, anchor_type: str) -> None:
        cc = CommentCreate(content="x", anchor_type=anchor_type)  # type: ignore[arg-type]
        assert cc.anchor_type == anchor_type


# ── ActivityRead ──────────────────────────────────────────────────────────────


class TestActivityRead:
    @pytest.mark.parametrize(
        "action",
        [
            "created",
            "viewed",
            "edited",
            "commented",
            "shared",
            "deleted",
            "restored",
            "version_created",
        ],
    )
    def test_action_literals(self, action: str) -> None:
        orm = MagicMock()
        orm.id = uuid.uuid4()
        orm.document_id = uuid.uuid4()
        orm.user_id = None
        orm.action = action
        orm.activity_metadata = None
        orm.created_at = _now()
        read = ActivityRead.model_validate(orm)
        assert read.action == action

    def test_from_orm(self) -> None:
        orm = MagicMock()
        orm.id = uuid.uuid4()
        orm.document_id = uuid.uuid4()
        orm.user_id = uuid.uuid4()
        orm.action = "edited"
        orm.activity_metadata = {"field": "name"}
        orm.created_at = _now()
        read = ActivityRead.model_validate(orm)
        assert read.activity_metadata == {"field": "name"}


# ── FavoriteRead ──────────────────────────────────────────────────────────────


class TestFavoriteRead:
    def test_from_orm(self) -> None:
        doc_id = uuid.uuid4()
        user_id = uuid.uuid4()
        orm = MagicMock()
        orm.document_id = doc_id
        orm.user_id = user_id
        orm.created_at = _now()
        read = FavoriteRead.model_validate(orm)
        assert read.document_id == doc_id
        assert read.user_id == user_id


# ── TemplateCreate / TemplatePatch / TemplateRead ─────────────────────────────


class TestTemplateSchemas:
    def test_template_create_defaults(self) -> None:
        tc = TemplateCreate(name="Invoice", file_type="pdf")
        assert tc.name == "Invoice"
        assert tc.file_type == "pdf"
        assert tc.description is None
        assert tc.category is None
        assert tc.is_global is True
        assert tc.project_id is None

    def test_template_create_project_scoped(self) -> None:
        pid = uuid.uuid4()
        tc = TemplateCreate(name="T", file_type="md", is_global=False, project_id=pid)
        assert tc.is_global is False
        assert tc.project_id == pid

    def test_template_patch_all_none(self) -> None:
        tp = TemplatePatch()
        assert tp.name is None
        assert tp.description is None
        assert tp.category is None

    def test_template_patch_exclude_unset(self) -> None:
        tp = TemplatePatch(category="finance")
        dumped = tp.model_dump(exclude_unset=True)
        assert list(dumped.keys()) == ["category"]

    def test_template_read_from_orm(self) -> None:
        orm = MagicMock()
        orm.id = uuid.uuid4()
        orm.name = "Report Template"
        orm.description = "Monthly report"
        orm.file_type = "docx"
        orm.s3_key = None
        orm.category = "finance"
        orm.is_global = True
        orm.project_id = None
        orm.created_by = None
        orm.created_at = _now()
        orm.updated_at = _now()
        read = TemplateRead.model_validate(orm)
        assert read.name == "Report Template"
        assert read.category == "finance"
        assert read.is_global is True


# ── AskRequest / ChatRequest (document_copilot) ───────────────────────────────


class TestDocumentCopilotSchemas:
    def test_ask_request_valid(self) -> None:
        req = AskRequest(question="What is the summary?")
        assert req.question == "What is the summary?"

    def test_ask_request_empty_raises(self) -> None:
        with pytest.raises(ValidationError):
            AskRequest(question="")

    def test_chat_request_valid(self) -> None:
        req = ChatRequest(session_id="sess-1", message="Hello!")
        assert req.session_id == "sess-1"
        assert req.message == "Hello!"

    def test_chat_request_empty_session_raises(self) -> None:
        with pytest.raises(ValidationError):
            ChatRequest(session_id="", message="Hi")

    def test_chat_request_empty_message_raises(self) -> None:
        with pytest.raises(ValidationError):
            ChatRequest(session_id="sess-1", message="")


# ── document_llm schemas ──────────────────────────────────────────────────────


class TestDocumentLLMSchemas:
    def test_convert_request(self) -> None:
        req = ConvertRequest(target_format="markdown")
        assert req.target_format == "markdown"

    def test_extract_request_via_alias(self) -> None:
        req = ExtractRequest.model_validate({"schema": {"type": "object"}, "focus": "tables"})
        assert req.schema_ == {"type": "object"}
        assert req.focus == "tables"

    def test_extract_request_focus_optional(self) -> None:
        req = ExtractRequest.model_validate({"schema": {"type": "object"}})
        assert req.focus is None

    def test_summarize_request_defaults(self) -> None:
        req = SummarizeRequest()
        assert req.level == "brief"
        assert req.focus is None

    def test_summarize_request_custom(self) -> None:
        req = SummarizeRequest(level="detailed", focus="financials")
        assert req.level == "detailed"
        assert req.focus == "financials"

    def test_compare_request(self) -> None:
        req = CompareRequest(other_document_id="some-uuid", mode="semantic")
        assert req.other_document_id == "some-uuid"
        assert req.mode == "semantic"

    def test_compare_request_default_mode(self) -> None:
        req = CompareRequest(other_document_id="abc")
        assert req.mode == "text"
