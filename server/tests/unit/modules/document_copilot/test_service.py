"""tests/unit/modules/document_copilot/test_service.py

Unit tests for the document copilot service functions:
  - copilot_summarize
  - copilot_ask
  - copilot_extract
  - copilot_chat

All external dependencies (LLM, S3, DocumentService, ChunkService,
embed_texts, extract_text) are mocked so no network/DB is needed.
"""

from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_session() -> AsyncMock:
    return AsyncMock()


def _make_doc_orm(name: str = "report.pdf") -> MagicMock:
    m = MagicMock()
    m.id = uuid.uuid4()
    m.name = name
    m.s3_key = "proj/doc/file.pdf"
    m.mime_type = "application/pdf"
    m.file_type = "pdf"
    return m


def _make_llm_response(content: str) -> MagicMock:
    resp = MagicMock()
    resp.content = content
    return resp


# ── copilot_summarize ─────────────────────────────────────────────────────────


class TestCopilotSummarize:
    @pytest.mark.asyncio
    async def test_returns_json_summary(self) -> None:
        from telaios.modules.document_copilot.service import copilot_summarize

        session = _make_session()
        doc = _make_doc_orm()
        llm_content = json.dumps(
            {"summary": "A report", "key_points": ["p1", "p2"], "word_count": 100}
        )

        with (
            patch(
                "telaios.modules.document_copilot.service.DocumentService",
            ) as mock_doc_svc,
            patch(
                "telaios.modules.document_copilot.service.download_from_s3",
                new=AsyncMock(return_value=b"content"),
            ),
            patch(
                "telaios.modules.document_copilot.service.extract_text",
                new=AsyncMock(return_value="The full document text."),
            ),
            patch(
                "telaios.modules.document_copilot.service._llm",
                return_value=MagicMock(
                    invoke=AsyncMock(return_value=_make_llm_response(llm_content))
                ),
            ),
        ):
            mock_doc_svc.return_value.get_orm = AsyncMock(return_value=doc)
            result = await copilot_summarize(session, uuid.uuid4(), doc.id)

        assert result["summary"] == "A report"
        assert result["key_points"] == ["p1", "p2"]
        assert result["word_count"] == 100

    @pytest.mark.asyncio
    async def test_empty_text_returns_default(self) -> None:
        from telaios.modules.document_copilot.service import copilot_summarize

        session = _make_session()
        doc = _make_doc_orm()

        with (
            patch(
                "telaios.modules.document_copilot.service.DocumentService",
            ) as mock_doc_svc,
            patch(
                "telaios.modules.document_copilot.service.download_from_s3",
                new=AsyncMock(return_value=b""),
            ),
            patch(
                "telaios.modules.document_copilot.service.extract_text",
                new=AsyncMock(return_value="   "),
            ),
        ):
            mock_doc_svc.return_value.get_orm = AsyncMock(return_value=doc)
            result = await copilot_summarize(session, uuid.uuid4(), doc.id)

        assert "no extractable text" in result["summary"]
        assert result["key_points"] == []
        assert result["word_count"] == 0

    @pytest.mark.asyncio
    async def test_invalid_json_falls_back(self) -> None:
        from telaios.modules.document_copilot.service import copilot_summarize

        session = _make_session()
        doc = _make_doc_orm()

        with (
            patch(
                "telaios.modules.document_copilot.service.DocumentService",
            ) as mock_doc_svc,
            patch(
                "telaios.modules.document_copilot.service.download_from_s3",
                new=AsyncMock(return_value=b"hello world"),
            ),
            patch(
                "telaios.modules.document_copilot.service.extract_text",
                new=AsyncMock(return_value="hello world"),
            ),
            patch(
                "telaios.modules.document_copilot.service._llm",
                return_value=MagicMock(
                    invoke=AsyncMock(return_value=_make_llm_response("not json at all"))
                ),
            ),
        ):
            mock_doc_svc.return_value.get_orm = AsyncMock(return_value=doc)
            result = await copilot_summarize(session, uuid.uuid4(), doc.id)

        # fallback: summary is truncated raw content
        assert "summary" in result
        assert "word_count" in result


# ── copilot_ask ───────────────────────────────────────────────────────────────


class TestCopilotAsk:
    @pytest.mark.asyncio
    async def test_returns_answer_from_chunks(self) -> None:
        from telaios.modules.document_copilot.service import copilot_ask

        session = _make_session()
        doc = _make_doc_orm()
        project_id = uuid.uuid4()
        llm_content = json.dumps({"answer": "42", "confidence": 0.9, "sources": ["report.pdf"]})

        with (
            patch(
                "telaios.modules.document_copilot.service.DocumentService",
            ) as mock_doc_svc,
            patch(
                "telaios.modules.document_copilot.service.ChunkService",
            ) as mock_chunk_svc,
            patch(
                "telaios.modules.document_copilot.service.embed_texts",
                new=AsyncMock(return_value=[[0.1, 0.2, 0.3]]),
            ),
            patch(
                "telaios.modules.document_copilot.service._llm",
                return_value=MagicMock(
                    invoke=AsyncMock(return_value=_make_llm_response(llm_content))
                ),
            ),
        ):
            mock_doc_svc.return_value.get_orm = AsyncMock(return_value=doc)
            mock_chunk_svc.return_value.search_by_embedding = AsyncMock(
                return_value=[{"chunk_index": 0, "content": "The answer is 42."}]
            )
            result = await copilot_ask(session, project_id, doc.id, "What is the answer?")

        assert result["answer"] == "42"
        assert result["confidence"] == 0.9

    @pytest.mark.asyncio
    async def test_falls_back_to_full_text_when_no_chunks(self) -> None:
        from telaios.modules.document_copilot.service import copilot_ask

        session = _make_session()
        doc = _make_doc_orm()
        project_id = uuid.uuid4()

        with (
            patch(
                "telaios.modules.document_copilot.service.DocumentService",
            ) as mock_doc_svc,
            patch(
                "telaios.modules.document_copilot.service.ChunkService",
            ) as mock_chunk_svc,
            patch(
                "telaios.modules.document_copilot.service.embed_texts",
                new=AsyncMock(return_value=[[0.1]]),
            ),
            patch(
                "telaios.modules.document_copilot.service.download_from_s3",
                new=AsyncMock(return_value=b"full text"),
            ),
            patch(
                "telaios.modules.document_copilot.service.extract_text",
                new=AsyncMock(return_value="full text"),
            ),
            patch(
                "telaios.modules.document_copilot.service._llm",
                return_value=MagicMock(
                    invoke=AsyncMock(
                        return_value=_make_llm_response(
                            json.dumps({"answer": "ok", "confidence": 0.5, "sources": []})
                        )
                    )
                ),
            ),
        ):
            mock_doc_svc.return_value.get_orm = AsyncMock(return_value=doc)
            mock_chunk_svc.return_value.search_by_embedding = AsyncMock(return_value=[])
            result = await copilot_ask(session, project_id, doc.id, "question?")

        assert "answer" in result

    @pytest.mark.asyncio
    async def test_empty_text_returns_default(self) -> None:
        from telaios.modules.document_copilot.service import copilot_ask

        session = _make_session()
        doc = _make_doc_orm()
        project_id = uuid.uuid4()

        with (
            patch(
                "telaios.modules.document_copilot.service.DocumentService",
            ) as mock_doc_svc,
            patch(
                "telaios.modules.document_copilot.service.ChunkService",
            ) as mock_chunk_svc,
            patch(
                "telaios.modules.document_copilot.service.embed_texts",
                new=AsyncMock(return_value=[[0.1]]),
            ),
            patch(
                "telaios.modules.document_copilot.service.download_from_s3",
                new=AsyncMock(return_value=b""),
            ),
            patch(
                "telaios.modules.document_copilot.service.extract_text",
                new=AsyncMock(return_value="  "),
            ),
        ):
            mock_doc_svc.return_value.get_orm = AsyncMock(return_value=doc)
            mock_chunk_svc.return_value.search_by_embedding = AsyncMock(return_value=[])
            result = await copilot_ask(session, project_id, doc.id, "?")

        assert "no extractable text" in result["answer"]
        assert result["confidence"] == 0.0


# ── copilot_extract ───────────────────────────────────────────────────────────


class TestCopilotExtract:
    @pytest.mark.asyncio
    async def test_returns_entities(self) -> None:
        from telaios.modules.document_copilot.service import copilot_extract

        session = _make_session()
        doc = _make_doc_orm()
        llm_content = json.dumps(
            {"entities": {"persons": ["Alice"]}, "tables": [], "key_values": {"date": "2024"}}
        )

        with (
            patch(
                "telaios.modules.document_copilot.service.DocumentService",
            ) as mock_doc_svc,
            patch(
                "telaios.modules.document_copilot.service.download_from_s3",
                new=AsyncMock(return_value=b"text"),
            ),
            patch(
                "telaios.modules.document_copilot.service.extract_text",
                new=AsyncMock(return_value="Some doc text with Alice"),
            ),
            patch(
                "telaios.modules.document_copilot.service._llm",
                return_value=MagicMock(
                    invoke=AsyncMock(return_value=_make_llm_response(llm_content))
                ),
            ),
        ):
            mock_doc_svc.return_value.get_orm = AsyncMock(return_value=doc)
            result = await copilot_extract(session, uuid.uuid4(), doc.id)

        assert result["entities"] == {"persons": ["Alice"]}
        assert result["key_values"] == {"date": "2024"}

    @pytest.mark.asyncio
    async def test_empty_text_returns_defaults(self) -> None:
        from telaios.modules.document_copilot.service import copilot_extract

        session = _make_session()
        doc = _make_doc_orm()

        with (
            patch(
                "telaios.modules.document_copilot.service.DocumentService",
            ) as mock_doc_svc,
            patch(
                "telaios.modules.document_copilot.service.download_from_s3",
                new=AsyncMock(return_value=b""),
            ),
            patch(
                "telaios.modules.document_copilot.service.extract_text",
                new=AsyncMock(return_value="  "),
            ),
        ):
            mock_doc_svc.return_value.get_orm = AsyncMock(return_value=doc)
            result = await copilot_extract(session, uuid.uuid4(), doc.id)

        assert result == {"entities": {}, "tables": [], "key_values": {}}


# ── copilot_chat ──────────────────────────────────────────────────────────────


class TestCopilotChat:
    @pytest.mark.asyncio
    async def test_returns_reply(self) -> None:
        from telaios.modules.document_copilot.service import copilot_chat

        session = _make_session()
        doc = _make_doc_orm(name="contract.pdf")
        project_id = uuid.uuid4()
        document_id = doc.id

        with (
            patch(
                "telaios.modules.document_copilot.service.DocumentService",
            ) as mock_doc_svc,
            patch(
                "telaios.modules.document_copilot.service._llm",
                return_value=MagicMock(
                    invoke=AsyncMock(return_value=_make_llm_response("Here is the answer."))
                ),
            ),
        ):
            mock_doc_svc.return_value.get_orm = AsyncMock(return_value=doc)
            result = await copilot_chat(
                session, project_id, document_id, "sess-abc", "What does it say?"
            )

        assert result["reply"] == "Here is the answer."
        assert result["session_id"] == "sess-abc"
        assert result["document_name"] == "contract.pdf"
        assert "thread_id" in result

    @pytest.mark.asyncio
    async def test_thread_id_format(self) -> None:
        from telaios.modules.document_copilot.service import copilot_chat

        session = _make_session()
        doc = _make_doc_orm()
        project_id = uuid.uuid4()
        document_id = doc.id

        with (
            patch(
                "telaios.modules.document_copilot.service.DocumentService",
            ) as mock_doc_svc,
            patch(
                "telaios.modules.document_copilot.service._llm",
                return_value=MagicMock(invoke=AsyncMock(return_value=_make_llm_response("ok"))),
            ),
        ):
            mock_doc_svc.return_value.get_orm = AsyncMock(return_value=doc)
            result = await copilot_chat(session, project_id, document_id, "s1", "hi")

        expected_prefix = f"doc:{project_id}:{document_id}:s1"
        assert result["thread_id"] == expected_prefix
