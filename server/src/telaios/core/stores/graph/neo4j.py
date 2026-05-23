"""Neo4jGraphStore — production graph store backed by Neo4j."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from telaios.core.stores.graph.base import GraphStore

if TYPE_CHECKING:
    from telaios.core.knowledge.config import GraphStoreConfig

logger = logging.getLogger(__name__)

_MERGE_TRIPLETS_CYPHER = """
UNWIND $triplets AS t
MERGE (s:Entity {name: t.subject})
MERGE (o:Entity {name: t.object})
MERGE (s)-[r:RELATION {type: t.predicate}]->(o)
"""

# Undirected traversal: expand up to $depth hops from any seed entity,
# decompose each path into individual edges and return unique triplets.
_SUBGRAPH_CYPHER = (
    "MATCH path = (e:Entity)-[*1..{depth}]-(n) "
    "WHERE e.name IN $entities "
    "WITH relationships(path) AS rels "
    "UNWIND rels AS r "
    "RETURN DISTINCT "
    "startNode(r).name AS subject, r.type AS predicate, endNode(r).name AS object"
)


class Neo4jGraphStore(GraphStore):
    """
    Production graph store backed by Neo4j via the official async driver.

    Requires the ``neo4j`` extra: ``uv sync --extra graph``
    Source: https://neo4j.com/docs/python-manual/current/
    """

    def __init__(self, config: GraphStoreConfig) -> None:
        try:
            from neo4j import AsyncGraphDatabase
        except ImportError as exc:
            raise ImportError(
                "neo4j driver not installed. Run: uv sync --extra graph"
            ) from exc

        auth = (config.username, config.password) if config.username else None
        self._driver = AsyncGraphDatabase.driver(config.uri or "bolt://localhost:7687", auth=auth)
        self._database = config.database

    # ── Sync stubs — Neo4j driver is async-first ──────────────────────────────

    def add_triplet(self, subject: str, predicate: str, obj: str) -> None:
        raise NotImplementedError("Use aadd_triplet for Neo4jGraphStore.")

    def add_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        raise NotImplementedError("Use aadd_triplets for Neo4jGraphStore.")

    def query(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        raise NotImplementedError("Use aquery for Neo4jGraphStore.")

    def get_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        raise NotImplementedError("Use aget_subgraph for Neo4jGraphStore.")

    def extract_entities(self, text: str) -> list[tuple[str, str, str]]:
        raise NotImplementedError("Use aextract_entities for Neo4jGraphStore.")

    # ── Async interface ───────────────────────────────────────────────────────

    async def aadd_triplet(self, subject: str, predicate: str, obj: str) -> None:
        await self.aadd_triplets([(subject, predicate, obj)])

    async def aadd_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        payload = [{"subject": s, "predicate": p, "object": o} for s, p, o in triplets]
        async with self._driver.session(database=self._database) as session:
            await session.run(_MERGE_TRIPLETS_CYPHER, triplets=payload)

    async def aquery(
        self, cypher_or_pattern: str, **params: Any
    ) -> list[dict[str, Any]]:
        async with self._driver.session(database=self._database) as session:
            result = await session.run(cypher_or_pattern, **params)
            return [dict(record) async for record in result]

    async def aget_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        cypher = _SUBGRAPH_CYPHER.format(depth=depth)
        async with self._driver.session(database=self._database) as session:
            result = await session.run(cypher, entities=center_entities)
            rows = [dict(r) async for r in result]
        return [(r["subject"], r["predicate"], r["object"]) for r in rows]

    async def aextract_entities(self, text: str) -> list[tuple[str, str, str]]:
        return []

    async def aclear(self) -> None:
        """Delete all nodes and relationships (used in tests)."""
        await self.aquery("MATCH (n) DETACH DELETE n")

    async def aclose(self) -> None:
        await self._driver.close()


__all__ = ["Neo4jGraphStore"]
