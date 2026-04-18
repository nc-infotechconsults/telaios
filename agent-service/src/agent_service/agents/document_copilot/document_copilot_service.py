"""
DocumentCopilotService — stateless helpers for document AI operations.

Capabilities:
  summarize   — Generate a concise summary + key points from document content
  ask         — Answer a question about a document using RAG (pgvector search)
  extract     — Pull structured data (entities, tables, key-value pairs)

Each function downloads the document from S3, extracts text, then calls the LLM.
For Q&A, it augments the context with nearby chunk search via pgvector.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

import aioboto3
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from agent_service.config import config
from agent_service.core.llm import build_chat_model
from agent_service.services import data_client
from agent_service.services.document_extractor import extract_text
from agent_service.services.embedding_service import embed_texts

logger = logging.getLogger(__name__)


# ─── Config model (mirrors configurable fields from AgentProfile) ──────────────

class DocumentCopilotConfig(BaseModel):
    llmProvider: str = "openai"
    llmModel: str = "gpt-4o"
    llmApiKey: str = ""
    llmBaseUrl: Optional[str] = None
    maxDocumentChars: int = 40_000   # chars sent to the LLM; ~10k tokens
    maxChunks: int = 8               # pgvector results for Q&A context


# ─── LLM helpers ──────────────────────────────────────────────────────────────

def _parse_json(raw: str) -> Any:
    """Extract the first JSON object from a model response."""
    m = re.search(r"\{[\s\S]*\}", raw)
    return json.loads(m.group(0) if m else raw)


async def _fetch_document_text(doc: Dict[str, Any]) -> str:
    """Download from S3 and extract text."""
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


# ─── Summarize ────────────────────────────────────────────────────────────────

SUMMARIZE_SYSTEM = """\
You are an expert document analyst. You will receive the full or partial text of a document.

Produce a structured summary as JSON:
{
  "summary": "2-4 sentence summary of the document",
  "key_points": ["point 1", "point 2", "..."],
  "word_count": 1234
}

Be concise. key_points should be 3-8 most important takeaways.
Respond with ONLY valid JSON. No markdown fences."""


async def summarize(
    project_id: str,
    document_id: str,
    cfg: DocumentCopilotConfig,
) -> Dict[str, Any]:
    """Generate a document summary with key points."""
    doc = await data_client.get_document(project_id, document_id)
    text = await _fetch_document_text(doc)
    text = text[: cfg.maxDocumentChars]

    if not text.strip():
        return {"summary": "Document has no extractable text.", "key_points": [], "word_count": 0}

    llm = build_chat_model(
        provider=cfg.llmProvider,
        model=cfg.llmModel,
        api_key=cfg.llmApiKey,
        base_url=cfg.llmBaseUrl,
    )
    word_count = len(text.split())
    response = await llm.ainvoke([
        SystemMessage(content=SUMMARIZE_SYSTEM),
        HumanMessage(content=f"Document: {doc.get('name', 'unknown')}\n\n{text}"),
    ])
    raw = response.content if isinstance(response.content, str) else json.dumps(response.content)

    try:
        result = _parse_json(raw)
    except Exception:
        result = {
            "summary": raw[:500],
            "key_points": [],
        }

    result.setdefault("word_count", word_count)
    return result


# ─── Q&A ─────────────────────────────────────────────────────────────────────

ASK_SYSTEM = """\
You are an expert document analyst. Answer the user's question using only the provided document context.

If the answer is not in the context, say so explicitly.
Cite specific parts of the document when possible.

Respond with ONLY valid JSON:
{
  "answer": "detailed answer",
  "confidence": 0.85,
  "sources": ["Document section or chunk reference"]
}
No markdown fences."""


async def ask(
    project_id: str,
    document_id: str,
    question: str,
    cfg: DocumentCopilotConfig,
) -> Dict[str, Any]:
    """Answer a question about a document using RAG."""
    doc = await data_client.get_document(project_id, document_id)

    # Build context: vector-search relevant chunks + truncated full text fallback
    chunk_context = ""
    try:
        embeddings = await embed_texts([question])
        if embeddings and embeddings[0]:
            chunks = await data_client.search_document_chunks(project_id, embeddings[0], cfg.maxChunks)
            # Filter to only chunks for this document
            doc_chunks = [c for c in chunks if c.get("document_id") == document_id]
            if not doc_chunks:
                # Fall back to all chunks from this project if none match
                doc_chunks = chunks[: cfg.maxChunks]
            chunk_context = "\n\n".join(
                f"[Chunk {c.get('chunk_index', i)}]\n{c.get('content', '')}"
                for i, c in enumerate(doc_chunks)
            )
    except Exception as e:
        logger.warning("Chunk search failed: %s", e)

    if not chunk_context:
        # Fall back to full text
        full_text = await _fetch_document_text(doc)
        chunk_context = full_text[: cfg.maxDocumentChars]

    if not chunk_context.strip():
        return {
            "answer": "Document has no extractable text to answer questions.",
            "confidence": 0.0,
            "sources": [],
        }

    llm = build_chat_model(
        provider=cfg.llmProvider,
        model=cfg.llmModel,
        api_key=cfg.llmApiKey,
        base_url=cfg.llmBaseUrl,
    )
    response = await llm.ainvoke([
        SystemMessage(content=ASK_SYSTEM),
        HumanMessage(content=f"Document: {doc.get('name')}\n\nContext:\n{chunk_context}\n\nQuestion: {question}"),
    ])
    raw = response.content if isinstance(response.content, str) else json.dumps(response.content)

    try:
        return _parse_json(raw)
    except Exception:
        return {"answer": raw[:1000], "confidence": 0.5, "sources": [doc.get("name", "")]}


# ─── Extract ──────────────────────────────────────────────────────────────────

EXTRACT_SYSTEM = """\
You are an expert information extractor. Extract structured data from the given document.

Respond with ONLY valid JSON:
{
  "entities": {
    "people": [],
    "organizations": [],
    "dates": [],
    "locations": []
  },
  "tables": [],
  "key_values": {
    "key": "value"
  }
}

For tables, each entry should be an array of row objects with consistent keys.
For key_values, extract important facts like version numbers, dates, statuses, owners, etc.
No markdown fences."""


async def extract(
    project_id: str,
    document_id: str,
    cfg: DocumentCopilotConfig,
) -> Dict[str, Any]:
    """Extract structured data (entities, tables, key-values) from a document."""
    doc = await data_client.get_document(project_id, document_id)
    text = await _fetch_document_text(doc)
    text = text[: cfg.maxDocumentChars]

    if not text.strip():
        return {"entities": {}, "tables": [], "key_values": {}}

    llm = build_chat_model(
        provider=cfg.llmProvider,
        model=cfg.llmModel,
        api_key=cfg.llmApiKey,
        base_url=cfg.llmBaseUrl,
    )
    response = await llm.ainvoke([
        SystemMessage(content=EXTRACT_SYSTEM),
        HumanMessage(content=f"Document: {doc.get('name', 'unknown')}\n\n{text}"),
    ])
    raw = response.content if isinstance(response.content, str) else json.dumps(response.content)

    try:
        return _parse_json(raw)
    except Exception:
        return {"entities": {}, "tables": [], "key_values": {}, "_raw": raw[:500]}
