from __future__ import annotations

"""
Document Copilot v2 — persistent multi-turn chat agent.

Uses create_react_agent (LangGraph) with AsyncPostgresSaver so that
conversation history survives across HTTP requests.

Thread ID schema: "doc:{project_id}:{document_id}:{session_id}"
This namespace is distinct from planning threads ("plan:…") so the
same checkpointer instance can be shared without collisions.
"""

import logging
from typing import Any, Dict, Optional

import aioboto3
from langchain_core.messages import HumanMessage
from langchain_core.tools import StructuredTool
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel

from agent_service.config import config as app_config
from agent_service.services import data_client
from agent_service.services.document_extractor import extract_text
from agent_service.services.embedding_service import embed_texts

logger = logging.getLogger(__name__)

# Module-level graph — compiled once in lifespan via set_checkpointer().
_doc_graph = None

_SYSTEM_PROMPT = """\
You are an expert document assistant. Help users understand, query, and analyse their documents.

Available tools:
- fetch_document_content(project_id, document_id): download and extract the full text of a document.
- search_document_chunks(project_id, document_id, query, limit): semantic search over document chunks.

Workflow:
1. For questions about document content, call search_document_chunks first for targeted answers.
2. For summarisation or extraction tasks, call fetch_document_content to get the full text.
3. Always ground your answers in the retrieved content and cite relevant passages.
4. If the document has no content or the search returns nothing, say so explicitly."""


# ── Tool input schemas ────────────────────────────────────────────────────────

class FetchDocumentInput(BaseModel):
    project_id: str
    document_id: str


class SearchChunksInput(BaseModel):
    project_id: str
    document_id: str
    query: str
    limit: int = 5


# ── Tool implementations ──────────────────────────────────────────────────────

async def _fetch_document_content(project_id: str, document_id: str) -> str:
    doc = await data_client.get_document(project_id, document_id)
    session = aioboto3.Session()
    async with session.client(
        "s3",
        endpoint_url=app_config.S3_ENDPOINT,
        region_name=app_config.S3_REGION,
        aws_access_key_id=app_config.S3_ACCESS_KEY,
        aws_secret_access_key=app_config.S3_SECRET_KEY,
    ) as s3:
        response = await s3.get_object(Bucket=app_config.S3_BUCKET, Key=doc["s3_key"])
        buffer: bytes = await response["Body"].read()
    text = await extract_text(buffer, doc.get("mime_type", ""), doc.get("file_type"))
    max_chars = 40_000
    return text[:max_chars] if text else "(no extractable text)"


async def _search_document_chunks(
    project_id: str,
    document_id: str,
    query: str,
    limit: int = 5,
) -> str:
    try:
        embeddings = await embed_texts([query])
    except Exception as exc:
        return f"Embedding generation failed: {exc}"

    if not embeddings or not embeddings[0]:
        return "Could not generate embeddings for the query."

    chunks = await data_client.search_document_chunks(project_id, embeddings[0], limit)
    doc_chunks = [c for c in chunks if c.get("document_id") == document_id]
    if not doc_chunks:
        doc_chunks = chunks  # fall back to all project chunks

    if not doc_chunks:
        return "No relevant chunks found."

    return "\n\n".join(
        f"[Chunk {c.get('chunk_index', i)}]\n{c.get('content', '')}"
        for i, c in enumerate(doc_chunks)
    )


def _build_tools() -> list[StructuredTool]:
    return [
        StructuredTool.from_function(
            coroutine=_fetch_document_content,
            name="fetch_document_content",
            description="Download and extract the full text of a document.",
            args_schema=FetchDocumentInput,
        ),
        StructuredTool.from_function(
            coroutine=_search_document_chunks,
            name="search_document_chunks",
            description="Search for relevant document sections using semantic similarity.",
            args_schema=SearchChunksInput,
        ),
    ]


# ── Public API ────────────────────────────────────────────────────────────────

def set_checkpointer(checkpointer) -> None:
    """Build and cache the document copilot graph.  Called from main.py lifespan."""
    global _doc_graph

    from agent_service.core.llm import build_chat_model

    llm = build_chat_model(
        provider=app_config.LLM_PROVIDER,
        model=app_config.LLM_MODEL,
        api_key=app_config.LLM_API_KEY,
        base_url=app_config.LLM_BASE_URL,
    )
    _doc_graph = create_react_agent(
        llm,
        _build_tools(),
        prompt=_SYSTEM_PROMPT,
        checkpointer=checkpointer,
    )
    logger.info("Document copilot v2 graph compiled with checkpointer.")


async def chat(
    project_id: str,
    document_id: str,
    session_id: str,
    message: str,
) -> Dict[str, Any]:
    """Send a message and return the agent's reply.

    The thread_id encodes the project, document, and session so that:
    - different sessions on the same document are isolated,
    - the same session accumulates history across calls.
    """
    if _doc_graph is None:
        raise RuntimeError(
            "Document copilot graph is not initialised. "
            "set_checkpointer() must be called during application startup."
        )

    thread_id = f"doc:{project_id}:{document_id}:{session_id}"
    result = await _doc_graph.ainvoke(
        {"messages": [HumanMessage(content=message)]},
        {"configurable": {"thread_id": thread_id}},
    )

    last = result["messages"][-1]
    reply = last.content if isinstance(last.content, str) else str(last.content)

    return {
        "reply": reply,
        "thread_id": thread_id,
        "project_id": project_id,
        "document_id": document_id,
        "session_id": session_id,
    }
