"""Knowledge base API router."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status

from telaios.auth.dependencies import CurrentPrincipal
from telaios.core.knowledge.factory import KnowledgePipelineFactory
from telaios.core.knowledge.pipeline import KnowledgeQueryResult
from telaios.modules.knowledge.schemas import (
    IngestDocumentsRequest,
    IngestRepositoryRequest,
    IngestResponse,
    KnowledgeChunkRead,
    KnowledgeQueryRequest,
    KnowledgeQueryResponse,
)

knowledge_router = APIRouter(
    prefix="/projects/{project_id}/knowledge",
    tags=["knowledge"],
)


async def _get_pipeline():
    return await KnowledgePipelineFactory.get()


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
            score=score,
        )
        for chunk, score in zip(result.chunks, result.scores, strict=False)
    ]
    return KnowledgeQueryResponse(
        query=result.query,
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
        language=body.language,
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
    from telaios.core.knowledge_source import FileSource, GitHubSource

    match body.source_type:
        case "github":
            if not body.repo_url:
                raise HTTPException(status_code=400, detail="repo_url required")
            return GitHubSource(repo_url=body.repo_url, branch=body.branch, subpath=body.subpath, token=body.token)
        case "file":
            if not body.local_path:
                raise HTTPException(status_code=400, detail="local_path required for source_type=file")
            return FileSource(path=body.local_path)
        case _:
            raise HTTPException(status_code=400, detail=f"Unsupported source_type: {body.source_type}")
