"""QdrantVectorStore — async wrapper over qdrant-client with project_id filtering.

Accepts any ``Embedder`` implementation (fastembed, TEI, …) so the vector
store is fully decoupled from the embedding provider.

Source: https://qdrant.tech/documentation/concepts/filtering/
"""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from telaios.core.embedders.base import Embedder

logger = logging.getLogger(__name__)


class QdrantVectorStore:
    """
    Manages two global Qdrant collections (``documents``, ``repositories``).
    All operations accept an optional *project_id* applied as a payload filter
    so collections remain logically partitioned per project.
    """

    def __init__(
        self,
        client: Any,  # qdrant_client.AsyncQdrantClient
        embedder: Embedder,
    ) -> None:
        self._client = client
        self._embedder = embedder

    # ── Collection lifecycle ──────────────────────────────────────────────────

    async def ensure_collection(self, collection: str) -> None:
        """Create collection if it does not exist."""
        from qdrant_client.models import Distance, VectorParams

        existing = {c.name for c in (await self._client.get_collections()).collections}
        if collection not in existing:
            await self._client.create_collection(
                collection_name=collection,
                vectors_config=VectorParams(
                    size=self._embedder.dimensions,
                    distance=Distance.COSINE,
                ),
            )
            logger.info(
                "Created Qdrant collection %r (dims=%d)",
                collection, self._embedder.dimensions,
            )

    # ── Ingestion ─────────────────────────────────────────────────────────────

    async def upsert(
        self,
        collection: str,
        texts: list[str],
        payloads: list[dict[str, Any]],
        ids: list[str] | None = None,
    ) -> list[str]:
        """Embed *texts* and upsert into *collection*. Returns point IDs."""
        from qdrant_client.models import PointStruct

        await self.ensure_collection(collection)

        vectors = await self._embedder.embed(texts)
        point_ids = ids or [str(uuid.uuid4()) for _ in texts]

        points = [
            PointStruct(id=pid, vector=vec, payload=payload)
            for pid, vec, payload in zip(point_ids, vectors, payloads, strict=True)
        ]
        await self._client.upsert(collection_name=collection, points=points)
        return point_ids

    # ── Retrieval ─────────────────────────────────────────────────────────────

    async def search(
        self,
        collection: str,
        vector: list[float],
        project_id: str | None,
        top_k: int = 5,
        extra_filter: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Cosine similarity search with optional project_id payload filter."""
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        must: list[Any] = []
        if project_id:
            must.append(FieldCondition(key="project_id", match=MatchValue(value=project_id)))
        if extra_filter:
            for key, val in extra_filter.items():
                must.append(FieldCondition(key=key, match=MatchValue(value=val)))

        query_filter = Filter(must=must) if must else None

        existing = {c.name for c in (await self._client.get_collections()).collections}
        if collection not in existing:
            return []

        response = await self._client.query_points(
            collection_name=collection,
            query=vector,
            query_filter=query_filter,
            limit=top_k,
            with_payload=True,
        )
        return [
            {
                "id": str(hit.id),
                "score": hit.score,
                "content": (hit.payload or {}).get("content", ""),
                "metadata": {k: v for k, v in (hit.payload or {}).items() if k != "content"},
            }
            for hit in response.points
        ]

    async def embed_query(self, text: str) -> list[float]:
        """Embed a single query string."""
        return await self._embedder.embed_query(text)

    # ── Scroll (for BM25 rebuild) ─────────────────────────────────────────────

    async def scroll_all(
        self,
        collection: str,
        project_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Load all records from a collection for BM25 index rebuild."""
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        query_filter = None
        if project_id:
            query_filter = Filter(
                must=[FieldCondition(key="project_id", match=MatchValue(value=project_id))]
            )

        existing = {c.name for c in (await self._client.get_collections()).collections}
        if collection not in existing:
            return []

        records, _ = await self._client.scroll(
            collection_name=collection,
            scroll_filter=query_filter,
            limit=10_000,
            with_payload=True,
        )
        return [
            {
                "id": str(r.id),
                "content": (r.payload or {}).get("content", ""),
                "metadata": {k: v for k, v in (r.payload or {}).items() if k != "content"},
            }
            for r in records
        ]

    # ── Delete ────────────────────────────────────────────────────────────────

    async def delete_by_project(self, collection: str, project_id: str) -> None:
        """Delete all points belonging to *project_id*. No-op if collection doesn't exist."""
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        existing = {c.name for c in (await self._client.get_collections()).collections}
        if collection not in existing:
            logger.debug("Collection %r does not exist — skip delete for project %r", collection, project_id)
            return

        await self._client.delete(
            collection_name=collection,
            points_selector=Filter(
                must=[FieldCondition(key="project_id", match=MatchValue(value=project_id))]
            ),
        )
        logger.info("Deleted project %r data from collection %r", project_id, collection)

    async def get_generated_doc_sha(
        self, collection: str, project_id: str, repo_path: str
    ) -> str | None:
        """Return the git SHA stored with previously generated docs for this repo, or None."""
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        existing = {c.name for c in (await self._client.get_collections()).collections}
        if collection not in existing:
            return None

        records, _ = await self._client.scroll(
            collection_name=collection,
            scroll_filter=Filter(
                must=[
                    FieldCondition(key="project_id", match=MatchValue(value=project_id)),
                    FieldCondition(key="source_type", match=MatchValue(value="generated_doc")),
                    FieldCondition(key="repo_path", match=MatchValue(value=repo_path)),
                ]
            ),
            limit=1,
            with_payload=True,
        )
        if records:
            return (records[0].payload or {}).get("git_sha")
        return None

    async def delete_generated_docs(
        self, collection: str, project_id: str, repo_path: str
    ) -> None:
        """Delete all previously generated doc chunks for this repo+project."""
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        existing = {c.name for c in (await self._client.get_collections()).collections}
        if collection not in existing:
            return

        await self._client.delete(
            collection_name=collection,
            points_selector=Filter(
                must=[
                    FieldCondition(key="project_id", match=MatchValue(value=project_id)),
                    FieldCondition(key="source_type", match=MatchValue(value="generated_doc")),
                    FieldCondition(key="repo_path", match=MatchValue(value=repo_path)),
                ]
            ),
        )
        logger.info("Deleted generated docs for repo %r project %r", repo_path, project_id)


__all__ = ["QdrantVectorStore"]
