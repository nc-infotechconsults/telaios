"""
Unit tests for DocumentCopilotService.

All external I/O is mocked:
  - data_client.get_document   → returns a fake doc dict
  - _fetch_document_text       → returns plain text (patches aioboto3 + extract_text)
  - embed_texts                → returns fake embedding vectors
  - data_client.search_document_chunks → returns fake chunk list
  - build_chat_model           → returns a mock LLM

Tests cover each public function (summarize, ask, extract) including:
  - happy path (valid JSON response from LLM)
  - fallback when LLM returns non-JSON prose
  - empty document (no extractable text)
  - ask() fallback when embeddings fail
  - ask() filters document-specific chunks
  - _parse_json helper (valid JSON, with surrounding prose, no JSON)
"""
from __future__ import annotations

import json
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agent_service.agents.document_copilot.document_copilot_service import (
    DocumentCopilotConfig,
    _parse_json,
    summarize,
    ask,
    extract,
)

# ─── Shared fixtures ──────────────────────────────────────────────────────────

FAKE_DOC: Dict[str, Any] = {
    "id": "doc-1",
    "project_id": "proj-1",
    "name": "design-spec.pdf",
    "file_type": "pdf",
    "mime_type": "application/pdf",
    "s3_key": "projects/proj-1/documents/doc-1/design-spec.pdf",
    "size_bytes": 4096,
    "status": "ready",
}

FAKE_TEXT = "This document describes the system architecture. It has three main sections."

DEFAULT_CFG = DocumentCopilotConfig(
    llmProvider="openai",
    llmModel="gpt-4o",
    llmApiKey="test-key",
)


def _make_llm(response_json: dict) -> MagicMock:
    """Return a mock LLM whose ainvoke returns the given dict as JSON."""
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=MagicMock(content=json.dumps(response_json)))
    return llm


# ─── _parse_json ──────────────────────────────────────────────────────────────

class TestParseJson:
    def test_parses_clean_json_object(self):
        raw = '{"summary": "hello", "key_points": []}'
        result = _parse_json(raw)
        assert result["summary"] == "hello"

    def test_extracts_json_from_surrounding_prose(self):
        raw = 'Sure! Here is the result: {"answer": "42"} Hope that helps.'
        result = _parse_json(raw)
        assert result["answer"] == "42"

    def test_raises_on_no_json(self):
        with pytest.raises(Exception):
            _parse_json("No JSON here at all")

    def test_raises_on_invalid_json(self):
        with pytest.raises(Exception):
            _parse_json("{not valid json}")


# ─── summarize() ─────────────────────────────────────────────────────────────

class TestSummarize:
    @pytest.mark.asyncio
    async def test_happy_path(self):
        llm_payload = {
            "summary": "Three-section architecture doc.",
            "key_points": ["Section 1", "Section 2", "Section 3"],
            "word_count": 12,
        }
        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service._fetch_document_text",
                new=AsyncMock(return_value=FAKE_TEXT),
            ),
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.build_chat_model",
                return_value=_make_llm(llm_payload),
            ),
        ):
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)
            result = await summarize("proj-1", "doc-1", DEFAULT_CFG)

        assert result["summary"] == "Three-section architecture doc."
        assert len(result["key_points"]) == 3
        assert result["word_count"] == 12

    @pytest.mark.asyncio
    async def test_empty_document_returns_stub(self):
        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service._fetch_document_text",
                new=AsyncMock(return_value="   "),
            ),
        ):
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)
            result = await summarize("proj-1", "doc-1", DEFAULT_CFG)

        assert "no extractable text" in result["summary"]
        assert result["key_points"] == []
        assert result["word_count"] == 0

    @pytest.mark.asyncio
    async def test_non_json_llm_response_falls_back_gracefully(self):
        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service._fetch_document_text",
                new=AsyncMock(return_value=FAKE_TEXT),
            ),
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.build_chat_model",
                return_value=_make_llm.__wrapped__ if hasattr(_make_llm, "__wrapped__") else None,
            ),
        ):
            # Override build_chat_model to return prose (not JSON)
            llm = MagicMock()
            llm.ainvoke = AsyncMock(return_value=MagicMock(content="This is a great document about architecture."))
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)

            with patch(
                "agent_service.agents.document_copilot.document_copilot_service.build_chat_model",
                return_value=llm,
            ):
                result = await summarize("proj-1", "doc-1", DEFAULT_CFG)

        assert "summary" in result
        assert result["key_points"] == []
        # word_count should be computed from original text
        assert result["word_count"] > 0

    @pytest.mark.asyncio
    async def test_truncates_text_to_max_chars(self):
        long_text = "word " * 20_000  # 100k chars
        cfg = DocumentCopilotConfig(llmApiKey="k", maxDocumentChars=100)
        captured: list[str] = []

        async def fake_invoke(messages):
            captured.append(messages[-1].content)
            return MagicMock(content='{"summary":"s","key_points":[],"word_count":5}')

        llm = MagicMock()
        llm.ainvoke = fake_invoke

        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service._fetch_document_text",
                new=AsyncMock(return_value=long_text),
            ),
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.build_chat_model",
                return_value=llm,
            ),
        ):
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)
            await summarize("proj-1", "doc-1", cfg)

        # The human message content should not exceed maxDocumentChars + some overhead
        human_msg = captured[0]
        assert len(human_msg) <= 100 + len(f"Document: {FAKE_DOC['name']}\n\n") + 10


# ─── ask() ────────────────────────────────────────────────────────────────────

class TestAsk:
    @pytest.mark.asyncio
    async def test_happy_path_with_chunks(self):
        llm_payload = {"answer": "The system uses microservices.", "confidence": 0.9, "sources": ["Chunk 0"]}
        chunks = [
            {"document_id": "doc-1", "chunk_index": 0, "content": "microservices architecture"},
            {"document_id": "doc-1", "chunk_index": 1, "content": "three-tier design"},
        ]
        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.embed_texts",
                new=AsyncMock(return_value=[[0.1, 0.2, 0.3]]),
            ),
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.build_chat_model",
                return_value=_make_llm(llm_payload),
            ),
        ):
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)
            mock_dc.search_document_chunks = AsyncMock(return_value=chunks)
            result = await ask("proj-1", "doc-1", "What architecture is used?", DEFAULT_CFG)

        assert result["answer"] == "The system uses microservices."
        assert result["confidence"] == 0.9

    @pytest.mark.asyncio
    async def test_filters_to_document_specific_chunks(self):
        """Only chunks with document_id == document_id should be used as primary context."""
        llm_payload = {"answer": "42", "confidence": 0.8, "sources": []}
        chunks = [
            {"document_id": "doc-1", "chunk_index": 0, "content": "relevant content"},
            {"document_id": "doc-OTHER", "chunk_index": 0, "content": "other doc content"},
        ]
        captured_messages: list = []

        async def fake_invoke(messages):
            captured_messages.extend(messages)
            return MagicMock(content=json.dumps(llm_payload))

        llm = MagicMock()
        llm.ainvoke = fake_invoke

        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.embed_texts",
                new=AsyncMock(return_value=[[0.1]]),
            ),
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.build_chat_model",
                return_value=llm,
            ),
        ):
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)
            mock_dc.search_document_chunks = AsyncMock(return_value=chunks)
            await ask("proj-1", "doc-1", "question", DEFAULT_CFG)

        # The human message should contain "relevant content" but NOT "other doc content"
        human_content = captured_messages[-1].content
        assert "relevant content" in human_content
        assert "other doc content" not in human_content

    @pytest.mark.asyncio
    async def test_falls_back_to_full_text_when_embed_fails(self):
        llm_payload = {"answer": "Fallback answer.", "confidence": 0.5, "sources": []}
        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.embed_texts",
                new=AsyncMock(side_effect=RuntimeError("embedding service down")),
            ),
            patch(
                "agent_service.agents.document_copilot.document_copilot_service._fetch_document_text",
                new=AsyncMock(return_value=FAKE_TEXT),
            ),
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.build_chat_model",
                return_value=_make_llm(llm_payload),
            ),
        ):
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)
            result = await ask("proj-1", "doc-1", "What is this about?", DEFAULT_CFG)

        assert result["answer"] == "Fallback answer."

    @pytest.mark.asyncio
    async def test_empty_document_returns_stub(self):
        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.embed_texts",
                new=AsyncMock(return_value=[[]]),
            ),
            patch(
                "agent_service.agents.document_copilot.document_copilot_service._fetch_document_text",
                new=AsyncMock(return_value=""),
            ),
        ):
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)
            result = await ask("proj-1", "doc-1", "question", DEFAULT_CFG)

        assert result["confidence"] == 0.0
        assert result["sources"] == []
        assert "no extractable text" in result["answer"]

    @pytest.mark.asyncio
    async def test_non_json_llm_response_falls_back(self):
        llm = MagicMock()
        llm.ainvoke = AsyncMock(return_value=MagicMock(content="The answer is blue."))

        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.embed_texts",
                new=AsyncMock(return_value=[[0.1]]),
            ),
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.build_chat_model",
                return_value=llm,
            ),
        ):
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)
            mock_dc.search_document_chunks = AsyncMock(return_value=[
                {"document_id": "doc-1", "chunk_index": 0, "content": "some text"}
            ])
            result = await ask("proj-1", "doc-1", "q", DEFAULT_CFG)

        assert "answer" in result
        assert result["confidence"] == 0.5
        assert FAKE_DOC["name"] in result["sources"]


# ─── extract() ───────────────────────────────────────────────────────────────

class TestExtract:
    @pytest.mark.asyncio
    async def test_happy_path(self):
        llm_payload = {
            "entities": {"people": ["Alice"], "organizations": ["Acme"], "dates": [], "locations": []},
            "tables": [{"col1": "val1"}],
            "key_values": {"version": "1.0"},
        }
        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service._fetch_document_text",
                new=AsyncMock(return_value=FAKE_TEXT),
            ),
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.build_chat_model",
                return_value=_make_llm(llm_payload),
            ),
        ):
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)
            result = await extract("proj-1", "doc-1", DEFAULT_CFG)

        assert result["entities"]["people"] == ["Alice"]
        assert result["key_values"]["version"] == "1.0"
        assert len(result["tables"]) == 1

    @pytest.mark.asyncio
    async def test_empty_document_returns_empty_struct(self):
        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service._fetch_document_text",
                new=AsyncMock(return_value="  "),
            ),
        ):
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)
            result = await extract("proj-1", "doc-1", DEFAULT_CFG)

        assert result == {"entities": {}, "tables": [], "key_values": {}}

    @pytest.mark.asyncio
    async def test_non_json_llm_falls_back_with_raw(self):
        llm = MagicMock()
        llm.ainvoke = AsyncMock(return_value=MagicMock(content="Entity: Alice. Date: 2024-01-01."))

        with (
            patch("agent_service.agents.document_copilot.document_copilot_service.data_client") as mock_dc,
            patch(
                "agent_service.agents.document_copilot.document_copilot_service._fetch_document_text",
                new=AsyncMock(return_value=FAKE_TEXT),
            ),
            patch(
                "agent_service.agents.document_copilot.document_copilot_service.build_chat_model",
                return_value=llm,
            ),
        ):
            mock_dc.get_document = AsyncMock(return_value=FAKE_DOC)
            result = await extract("proj-1", "doc-1", DEFAULT_CFG)

        # Fallback should return empty structured fields + _raw
        assert result["entities"] == {}
        assert result["tables"] == []
        assert result["key_values"] == {}
        assert "_raw" in result
