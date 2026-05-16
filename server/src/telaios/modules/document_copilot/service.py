"""Document copilot service — AI-powered operations on a single document.

Rewired from ``agent-service/src/telaios/domain/agents/document_assistant.py``:
- ``aioboto3`` replaced by ``infra.s3.download_from_s3``
- ``data_client`` replaced by ``DocumentService`` + ``ChunkService``
- ``config.*`` replaced by ``settings.*``
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.config.settings import get_settings
from telaios.core.factory import create_llm
from telaios.core.types import LLMConfig, Message, MessageRole
from telaios.infra.s3 import download_from_s3
from telaios.modules.documents.chunks.service import ChunkService
from telaios.modules.documents.service import DocumentService
from telaios.tools.builtin.documents.extraction import extract_text

logger = logging.getLogger(__name__)

_MAX_CHARS = 40_000
_MAX_CHUNKS = 8


def _parse_json(raw: str) -> Any:
    match = re.search(r"\{[\s\S]*\}", raw)
    return json.loads(match.group(0) if match else raw)


def _llm() -> Any:
    s = get_settings()
    return create_llm(
        LLMConfig(
            provider=s.LLM_PROVIDER,
            model=s.LLM_MODEL,
            api_key=s.LLM_API_KEY,
            base_url=s.LLM_BASE_URL,
        )
    )


async def _fetch_document_text(session: AsyncSession, document_id: uuid.UUID) -> tuple[str, str]:
    """Download and extract document text. Returns (text, doc_name)."""
    doc = await DocumentService(session).get_orm(document_id)
    raw: bytes = await download_from_s3(doc.s3_key)
    text = await extract_text(raw, doc.mime_type, doc.file_type)
    return text, doc.name


async def copilot_summarize(
    session: AsyncSession,
    project_id: uuid.UUID,
    document_id: uuid.UUID,
) -> dict[str, Any]:
    """Generate a summary (summary, key_points, word_count)."""
    text, doc_name = await _fetch_document_text(session, document_id)
    text = text[:_MAX_CHARS]
    if not text.strip():
        return {"summary": "Document has no extractable text.", "key_points": [], "word_count": 0}

    response = await _llm().invoke(
        [
            Message(
                role=MessageRole.SYSTEM,
                content=(
                    "Produce JSON with keys summary, key_points, and word_count. "
                    "Respond only with valid JSON."
                ),
            ),
            Message(
                role=MessageRole.HUMAN,
                content=f"Document: {doc_name}\n\n{text}",
            ),
        ]
    )
    try:
        result: dict[str, Any] = _parse_json(response.content)
    except Exception:
        result = {"summary": response.content[:500], "key_points": []}
    result.setdefault("word_count", len(text.split()))
    return result


async def copilot_ask(
    session: AsyncSession,
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    question: str,
) -> dict[str, Any]:
    """Answer a question via RAG over the document (answer, confidence, sources)."""
    doc = await DocumentService(session).get_orm(document_id)
    doc_name = doc.name
    chunk_context = ""

    try:
        chunks = await ChunkService(session).search_by_embedding(
            project_id, question, limit=_MAX_CHUNKS, document_id=document_id
        )
        if not chunks:
            chunks = await ChunkService(session).search_by_embedding(
                project_id, question, limit=_MAX_CHUNKS
            )
            chunks = [c for c in chunks if c.get("document_id") == str(document_id)]
        chunk_context = "\n\n".join(
            f"[Chunk {c.get('chunk_index', i)}]\n{c['content']}" for i, c in enumerate(chunks)
        )
    except Exception as exc:
        logger.warning("Chunk search failed: %s", exc)

    if not chunk_context:
        text, _ = await _fetch_document_text(session, document_id)
        chunk_context = text[:_MAX_CHARS]
    if not chunk_context.strip():
        return {
            "answer": "Document has no extractable text to answer questions.",
            "confidence": 0.0,
            "sources": [],
        }

    response = await _llm().invoke(
        [
            Message(
                role=MessageRole.SYSTEM,
                content=(
                    "Answer using only the provided document context. Respond only with "
                    "valid JSON containing answer, confidence, and sources."
                ),
            ),
            Message(
                role=MessageRole.HUMAN,
                content=f"Document: {doc_name}\n\nContext:\n{chunk_context}\n\nQuestion: {question}",
            ),
        ]
    )
    try:
        return _parse_json(response.content)  # type: ignore[no-any-return]
    except Exception:
        return {"answer": response.content[:1000], "confidence": 0.5, "sources": [doc_name]}


async def copilot_extract(
    session: AsyncSession,
    project_id: uuid.UUID,
    document_id: uuid.UUID,
) -> dict[str, Any]:
    """Extract entities, tables, key-values (entities, tables, key_values)."""
    text, doc_name = await _fetch_document_text(session, document_id)
    text = text[:_MAX_CHARS]
    if not text.strip():
        return {"entities": {}, "tables": [], "key_values": {}}

    response = await _llm().invoke(
        [
            Message(
                role=MessageRole.SYSTEM,
                content=(
                    "Extract entities, tables, and key_values from the document. "
                    "Respond only with valid JSON."
                ),
            ),
            Message(
                role=MessageRole.HUMAN,
                content=f"Document: {doc_name}\n\n{text}",
            ),
        ]
    )
    try:
        return _parse_json(response.content)  # type: ignore[no-any-return]
    except Exception:
        return {
            "entities": {},
            "tables": [],
            "key_values": {},
            "_raw": response.content[:500],
        }


async def copilot_chat(
    session: AsyncSession,
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    session_id: str,
    message: str,
) -> dict[str, Any]:
    """Stateless chat turn against a document (no persistent history in MVP)."""
    doc = await DocumentService(session).get_orm(document_id)
    thread_id = f"doc:{project_id}:{document_id}:{session_id}"

    response = await _llm().invoke(
        [
            Message(
                role=MessageRole.SYSTEM,
                content=(
                    "You are an expert document assistant. "
                    "Answer clearly and cite document context when available."
                ),
            ),
            Message(role=MessageRole.HUMAN, content=message),
        ]
    )
    return {
        "reply": response.content,
        "thread_id": thread_id,
        "project_id": str(project_id),
        "document_id": str(document_id),
        "session_id": session_id,
        "document_name": doc.name,
    }


__all__ = [
    "copilot_ask",
    "copilot_chat",
    "copilot_extract",
    "copilot_summarize",
]
