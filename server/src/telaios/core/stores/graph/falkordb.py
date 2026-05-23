"""FalkorDBGraphStore — lightweight production graph store (Redis-protocol)."""

from __future__ import annotations

import asyncio
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

    Async methods wrap the synchronous FalkorDB driver in the default
    thread-pool executor to avoid blocking the event loop.
    """

    def __init__(self, config: GraphStoreConfig) -> None:
        try:
            from falkordb import FalkorDB
        except ImportError as exc:
            raise ImportError(
                "falkordb driver not installed. Run: uv sync --extra graph"
            ) from exc

        host, port = self._parse_uri(config.uri or "redis://localhost:6380")
        kwargs: dict[str, Any] = {"host": host, "port": port}
        if config.username:
            kwargs["username"] = config.username
        if config.password:
            kwargs["password"] = config.password
        self._client = FalkorDB(**kwargs)
        self._graph_name = config.database or "knowledge"
        self._graph = self._client.select_graph(self._graph_name)

    @staticmethod
    def _parse_uri(uri: str) -> tuple[str, int]:
        uri = uri.replace("redis://", "").replace("falkordb://", "")
        # strip any auth portion (user:pass@host:port)
        if "@" in uri:
            uri = uri.split("@", 1)[1]
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

    def query(self, cypher_or_pattern: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        result = self._graph.query(cypher_or_pattern, params or {})
        return [dict(zip(result.header, row)) for row in result.result_set]

    def get_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        """BFS expansion from seed entities up to *depth* hops.

        Each hop fetches all direct edges involving the current frontier,
        which avoids the Cypher variable-length path decomposition complexity.
        """
        visited: set[str] = set(center_entities)
        frontier: set[str] = set(center_entities)
        result: list[tuple[str, str, str]] = []

        for _ in range(depth):
            if not frontier:
                break
            # Build inline list; FalkorDB does not support $param in WHERE IN
            entities_list = "[" + ", ".join(f'"{e}"' for e in frontier) + "]"
            cypher = (
                f"MATCH (s:Entity)-[r:RELATION]->(o:Entity) "
                f"WHERE s.name IN {entities_list} OR o.name IN {entities_list} "
                "RETURN s.name AS s, r.type AS p, o.name AS o"
            )
            rows = self.query(cypher)
            next_frontier: set[str] = set()
            for row in rows:
                s, p, o = str(row.get("s", "")), str(row.get("p", "")), str(row.get("o", ""))
                if not s or not o:
                    continue
                result.append((s, p, o))
                for node in (s, o):
                    if node not in visited:
                        next_frontier.add(node)
                        visited.add(node)
            frontier = next_frontier

        # Deduplicate while preserving order
        seen: set[tuple[str, str, str]] = set()
        deduped: list[tuple[str, str, str]] = []
        for t in result:
            if t not in seen:
                seen.add(t)
                deduped.append(t)
        return deduped

    def extract_entities(self, text: str) -> list[tuple[str, str, str]]:
        return []

    def clear(self) -> None:
        """Delete all nodes and relationships (used in tests)."""
        self._graph.query("MATCH (n) DETACH DELETE n")

    # ── Async interface (sync driver — offload to thread pool) ────────────────

    async def aadd_triplet(self, subject: str, predicate: str, obj: str) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.add_triplet, subject, predicate, obj)

    async def aadd_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.add_triplets, triplets)

    async def aquery(self, cypher_or_pattern: str, **params: Any) -> list[dict[str, Any]]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.query, cypher_or_pattern, params or None)

    async def aget_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.get_subgraph, center_entities, depth)

    async def aextract_entities(self, text: str) -> list[tuple[str, str, str]]:
        return []

    async def aclear(self) -> None:
        """Async clear (used in tests)."""
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.clear)


__all__ = ["FalkorDBGraphStore"]
