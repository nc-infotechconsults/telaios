"""FalkorDBGraphStore — lightweight production graph store (Redis-protocol)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from telaios.core.stores.graph.base import GraphStore

if TYPE_CHECKING:
    from telaios.core.knowledge.config import GraphStoreConfig

logger = logging.getLogger(__name__)


class FalkorDBGraphStore(GraphStore):
    """
    Production graph store backed by FalkorDB.

    FalkorDB is a property graph database with a Redis-compatible protocol.
    Requires the ``falkordb`` extra: ``uv sync --extra graph``
    Source: https://docs.falkordb.com/
    """

    def __init__(self, config: GraphStoreConfig) -> None:
        try:
            from falkordb import FalkorDB
        except ImportError as exc:
            raise ImportError(
                "falkordb driver not installed. Run: uv sync --extra graph"
            ) from exc

        host, port = self._parse_uri(config.uri or "redis://localhost:6380")
        self._client = FalkorDB(host=host, port=port)
        self._graph_name = config.database or "knowledge"
        self._graph = self._client.select_graph(self._graph_name)

    @staticmethod
    def _parse_uri(uri: str) -> tuple[str, int]:
        uri = uri.replace("redis://", "").replace("falkordb://", "")
        parts = uri.split(":")
        host = parts[0] or "localhost"
        port = int(parts[1]) if len(parts) > 1 else 6380
        return host, port

    # ── Sync interface ────────────────────────────────────────────────────────

    def add_triplet(self, subject: str, predicate: str, obj: str) -> None:
        self._graph.query(
            "MERGE (s:Entity {name: $s}) MERGE (o:Entity {name: $o}) "
            "MERGE (s)-[:RELATION {type: $p}]->(o)",
            {"s": subject, "p": predicate, "o": obj},
        )

    def add_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        for s, p, o in triplets:
            self.add_triplet(s, p, o)

    def query(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        result = self._graph.query(cypher_or_pattern)
        return [dict(zip(result.header, row)) for row in result.result_set]

    def get_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        entities_str = ", ".join(f"'{e}'" for e in center_entities)
        cypher = (
            f"MATCH (e:Entity)-[r*1..{depth}]-(n) WHERE e.name IN [{entities_str}] "
            "RETURN e.name, type(r[0]), n.name"
        )
        rows = self.query(cypher)
        return [(str(r.get("e.name", "")), str(r.get("type(r[0])", "")), str(r.get("n.name", ""))) for r in rows]

    def extract_entities(self, text: str) -> list[tuple[str, str, str]]:
        return []

    # ── Async interface (FalkorDB sync driver — wrap in executor) ─────────────

    async def aadd_triplet(self, subject: str, predicate: str, obj: str) -> None:
        import asyncio
        await asyncio.get_event_loop().run_in_executor(None, self.add_triplet, subject, predicate, obj)

    async def aadd_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        import asyncio
        await asyncio.get_event_loop().run_in_executor(None, self.add_triplets, triplets)

    async def aquery(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        import asyncio
        return await asyncio.get_event_loop().run_in_executor(None, self.query, cypher_or_pattern)

    async def aget_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        import asyncio
        return await asyncio.get_event_loop().run_in_executor(
            None, self.get_subgraph, center_entities, depth
        )

    async def aextract_entities(self, text: str) -> list[tuple[str, str, str]]:
        return []


__all__ = ["FalkorDBGraphStore"]
