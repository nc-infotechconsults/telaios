"""Knowledge base API router."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal
from telaios.auth.project_access import require_project_access
from telaios.core.knowledge.factory import KnowledgePipelineFactory
from telaios.core.knowledge.pipeline import KnowledgeQueryResult
from telaios.core.knowledge.retrieval import score_to_tier
from telaios.db.session import get_session
from telaios.modules.knowledge.schemas import (
    CitationRead,
    IngestDocumentsRequest,
    IngestRepositoryRequest,
    IngestResponse,
    KnowledgeChunkRead,
    KnowledgeQueryRequest,
    KnowledgeQueryResponse,
)


class KnowledgeStatusResponse(BaseModel):
    document_count: int
    repo_count: int
    vector_count: int
    last_indexed_at: str | None


knowledge_router = APIRouter(
    prefix="/projects/{project_id}/knowledge",
    tags=["knowledge"],
)


async def _get_pipeline():
    return await KnowledgePipelineFactory.get()


@knowledge_router.get(
    "/status",
    response_model=KnowledgeStatusResponse,
    dependencies=[Depends(require_project_access("viewer"))],
)
async def get_knowledge_status(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> KnowledgeStatusResponse:
    """Return knowledge base statistics for a project."""
    from sqlalchemy import func
    from telaios.db.models.documents import Document
    from telaios.db.models.repositories import Repository

    doc_count = (await session.execute(
        select(func.count()).select_from(Document).where(
            Document.project_id == project_id,
            Document.deleted_at.is_(None),
        )
    )).scalar_one()
    repo_count = (await session.execute(
        select(func.count()).select_from(Repository).where(
            Repository.project_id == project_id,
        )
    )).scalar_one()

    vector_count = 0
    try:
        pipeline = await _get_pipeline()
        doc_vecs = await pipeline._vs.count_by_project("documents", str(project_id))
        repo_vecs = await pipeline._vs.count_by_project("repositories", str(project_id))
        vector_count = doc_vecs + repo_vecs
    except Exception:
        pass

    return KnowledgeStatusResponse(
        document_count=doc_count,
        repo_count=repo_count,
        vector_count=vector_count,
        last_indexed_at=None,
    )


@knowledge_router.post("/query", response_model=KnowledgeQueryResponse)
async def query_knowledge(
    project_id: uuid.UUID,
    body: KnowledgeQueryRequest,
    principal: CurrentPrincipal,
) -> KnowledgeQueryResponse:
    """Hybrid search across documents and/or repository code for a project."""
    pipeline = await _get_pipeline()
    result: KnowledgeQueryResult = await pipeline.query(
        project_id=str(project_id),
        text=body.text,
        source=body.source,
        top_k=body.top_k,
    )
    chunks = [
        KnowledgeChunkRead(
            content=chunk.content,
            source_collection=chunk.metadata.get("_collection", ""),
            metadata={k: v for k, v in chunk.metadata.items() if k != "_collection"},
            relevance=score_to_tier(score),
        )
        for chunk, score in zip(result.chunks, result.scores, strict=False)
    ]
    citations = [
        CitationRead(
            index=c.index,
            source_path=c.source_path,
            symbol_name=c.symbol_name,
            start_line=c.start_line,
            collection=c.collection,
        )
        for c in result.citations
    ]
    return KnowledgeQueryResponse(
        query=result.query,
        answer=result.answer,
        citations=citations,
        chunks=chunks,
        sources_searched=result.sources_searched,
        total=len(chunks),
    )


@knowledge_router.post(
    "/documents/ingest",
    response_model=IngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def ingest_documents(
    project_id: uuid.UUID,
    body: IngestDocumentsRequest,
    principal: CurrentPrincipal,
) -> IngestResponse:
    """Ingest documents (text, URL, GitHub, or Docling-parsed file) into the knowledge base."""
    pipeline = await _get_pipeline()
    source = _build_document_source(body)
    result = await pipeline.ingest_documents(project_id=str(project_id), source=source)
    return IngestResponse(
        collection=result.collection,
        project_id=result.project_id,
        document_count=result.document_count,
        chunk_count=result.chunk_count,
        triplet_count=result.triplet_count,
    )


@knowledge_router.post(
    "/repositories/ingest",
    response_model=IngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def ingest_repository(
    project_id: uuid.UUID,
    body: IngestRepositoryRequest,
    principal: CurrentPrincipal,
) -> IngestResponse:
    """Ingest a code repository (GitHub or local path) into the knowledge base."""
    pipeline = await _get_pipeline()
    source = _build_repository_source(body)
    result = await pipeline.ingest_repository(
        project_id=str(project_id),
        source=source,
    )
    return IngestResponse(
        collection=result.collection,
        project_id=result.project_id,
        document_count=result.document_count,
        chunk_count=result.chunk_count,
        triplet_count=result.triplet_count,
    )


@knowledge_router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_knowledge(
    project_id: uuid.UUID,
    principal: CurrentPrincipal,
) -> None:
    """Delete all knowledge base data for a project."""
    pipeline = await _get_pipeline()
    await pipeline.delete_project_data(project_id=str(project_id))


# ── Source builder helpers ────────────────────────────────────────────────────


def _build_document_source(body: IngestDocumentsRequest) -> Any:
    from telaios.core.knowledge_source import (
        DoclingSource,
        GitHubSource,
        TextSource,
        URLSource,
    )

    match body.source_type:
        case "text":
            if not body.content:
                raise HTTPException(status_code=400, detail="content required for source_type=text")
            return TextSource(text=body.content)
        case "url":
            if not body.url:
                raise HTTPException(status_code=400, detail="url required for source_type=url")
            return URLSource(url=body.url)
        case "github":
            if not body.repo_url:
                raise HTTPException(status_code=400, detail="repo_url required for source_type=github")
            return GitHubSource(repo_url=body.repo_url, branch=body.branch, subpath=body.subpath, token=body.token)
        case "docling":
            if not body.url:
                raise HTTPException(status_code=400, detail="url required for source_type=docling")
            return DoclingSource(path=body.url)
        case _:
            raise HTTPException(status_code=400, detail=f"Unsupported source_type: {body.source_type}")


def _build_repository_source(body: IngestRepositoryRequest) -> Any:
    from telaios.core.knowledge_source import FileSource, GitHubSource, GitSource

    match body.source_type:
        case "github":
            if not body.repo_url:
                raise HTTPException(status_code=400, detail="repo_url required")
            return GitHubSource(
                repo_url=body.repo_url,
                branch=body.branch,
                subpath=body.subpath,
                token=body.token,
            )
        case "git":
            source = body.repo_url or body.local_path
            if not source:
                raise HTTPException(status_code=400, detail="repo_url or local_path required for source_type=git")
            return GitSource(
                source=source,
                branch=body.branch or None,
                subpath=body.subpath,
                token=body.token,
                ssh_key=body.ssh_key,
            )
        case "file":
            if not body.local_path:
                raise HTTPException(status_code=400, detail="local_path required for source_type=file")
            return FileSource(body.local_path)
        case _:
            raise HTTPException(status_code=400, detail=f"Unsupported source_type: {body.source_type}")
