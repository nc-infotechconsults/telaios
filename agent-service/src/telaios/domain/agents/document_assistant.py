from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional

import aioboto3
from pydantic import BaseModel

from telaios.core.factory import create_llm
from telaios.core.types import LLMConfig, Message, MessageRole
from telaios.infra import data_client
from telaios.infra.settings import config
from telaios.tools.builtin.documents.embedding import embed_texts
from telaios.tools.builtin.documents.extraction import extract_text

logger = logging.getLogger(__name__)

_doc_checkpointer: Any = None


class DocumentCopilotConfig(BaseModel):
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o"
    llm_api_key: str = ""
    llm_base_url: Optional[str] = None
    max_document_chars: int = 40_000
    max_chunks: int = 8


def set_checkpointer(checkpointer: Any) -> None:
    global _doc_checkpointer
    _doc_checkpointer = checkpointer
    logger.info("Document copilot checkpointer set.")


def _parse_json(raw: str) -> Any:
    match = re.search(r"\{[\s\S]*\}", raw)
    return json.loads(match.group(0) if match else raw)


def _llm(cfg: DocumentCopilotConfig):
    return create_llm(
        LLMConfig(
            provider=cfg.llm_provider,
            model=cfg.llm_model,
            api_key=cfg.llm_api_key,
            base_url=cfg.llm_base_url,
        )
    )


async def _fetch_document_text(doc: Dict[str, Any]) -> str:
    session = aioboto3.Session()
    async with session.client(
        "s3",
        endpoint_url=config.S3_ENDPOINT,
        region_name=config.S3_REGION,
        aws_access_key_id=config.S3_ACCESS_KEY,
        aws_secret_access_key=config.S3_SECRET_KEY,
    ) as s3:
        response = await s3.get_object(Bucket=config.S3_BUCKET, Key=doc["s3_key"])
        buffer: bytes = await response["Body"].read()
    return await extract_text(buffer, doc.get("mime_type", ""), doc.get("file_type"))


async def summarize(project_id: str, document_id: str, cfg: DocumentCopilotConfig) -> Dict[str, Any]:
    doc = await data_client.get_document(project_id, document_id)
    text = (await _fetch_document_text(doc))[:cfg.max_document_chars]
    if not text.strip():
        return {"summary": "Document has no extractable text.", "key_points": [], "word_count": 0}

    response = await _llm(cfg).invoke([
        Message(
            role=MessageRole.SYSTEM,
            content=(
                "Produce JSON with keys summary, key_points, and word_count. "
                "Respond only with valid JSON."
            ),
        ),
        Message(role=MessageRole.HUMAN, content=f"Document: {doc.get('name', 'unknown')}\n\n{text}"),
    ])
    try:
        result = _parse_json(response.content)
    except Exception:
        result = {"summary": response.content[:500], "key_points": []}
    result.setdefault("word_count", len(text.split()))
    return result


async def ask(project_id: str, document_id: str, question: str, cfg: DocumentCopilotConfig) -> Dict[str, Any]:
    doc = await data_client.get_document(project_id, document_id)
    chunk_context = ""
    try:
        embeddings = await embed_texts([question])
        if embeddings and embeddings[0]:
            chunks = await data_client.search_document_chunks(project_id, embeddings[0], cfg.max_chunks)
            doc_chunks = [chunk for chunk in chunks if chunk.get("document_id") == document_id] or chunks[:cfg.max_chunks]
            chunk_context = "\n\n".join(
                f"[Chunk {chunk.get('chunk_index', index)}]\n{chunk.get('content', '')}"
                for index, chunk in enumerate(doc_chunks)
            )
    except Exception as exc:
        logger.warning("Chunk search failed: %s", exc)

    if not chunk_context:
        chunk_context = (await _fetch_document_text(doc))[:cfg.max_document_chars]
    if not chunk_context.strip():
        return {"answer": "Document has no extractable text to answer questions.", "confidence": 0.0, "sources": []}

    response = await _llm(cfg).invoke([
        Message(
            role=MessageRole.SYSTEM,
            content=(
                "Answer using only the provided document context. Respond only with "
                "valid JSON containing answer, confidence, and sources."
            ),
        ),
        Message(
            role=MessageRole.HUMAN,
            content=f"Document: {doc.get('name')}\n\nContext:\n{chunk_context}\n\nQuestion: {question}",
        ),
    ])
    try:
        return _parse_json(response.content)
    except Exception:
        return {"answer": response.content[:1000], "confidence": 0.5, "sources": [doc.get("name", "")]}


async def extract(project_id: str, document_id: str, cfg: DocumentCopilotConfig) -> Dict[str, Any]:
    doc = await data_client.get_document(project_id, document_id)
    text = (await _fetch_document_text(doc))[:cfg.max_document_chars]
    if not text.strip():
        return {"entities": {}, "tables": [], "key_values": {}}

    response = await _llm(cfg).invoke([
        Message(
            role=MessageRole.SYSTEM,
            content=(
                "Extract entities, tables, and key_values from the document. "
                "Respond only with valid JSON."
            ),
        ),
        Message(role=MessageRole.HUMAN, content=f"Document: {doc.get('name', 'unknown')}\n\n{text}"),
    ])
    try:
        return _parse_json(response.content)
    except Exception:
        return {"entities": {}, "tables": [], "key_values": {}, "_raw": response.content[:500]}


async def chat(project_id: str, document_id: str, session_id: str, message: str) -> Dict[str, Any]:
    cfg = DocumentCopilotConfig(
        llm_provider=config.LLM_PROVIDER,
        llm_model=config.LLM_MODEL,
        llm_api_key=config.LLM_API_KEY,
        llm_base_url=config.LLM_BASE_URL,
    )
    thread_id = f"doc:{project_id}:{document_id}:{session_id}"
    response = await _llm(cfg).invoke([
        Message(
            role=MessageRole.SYSTEM,
            content="You are an expert document assistant. Answer clearly and cite document context when available.",
        ),
        Message(role=MessageRole.HUMAN, content=message),
    ])
    if _doc_checkpointer is not None:
        try:
            state = await _doc_checkpointer.get(thread_id) or {}
            history = state.get("messages", [])
            history.extend([{"role": "human", "content": message}, {"role": "ai", "content": response.content}])
            state["messages"] = history
            await _doc_checkpointer.put(thread_id, state)
        except Exception as exc:
            logger.warning("Document chat checkpoint write failed: %s", exc)
    return {
        "reply": response.content,
        "thread_id": thread_id,
        "project_id": project_id,
        "document_id": document_id,
        "session_id": session_id,
    }
