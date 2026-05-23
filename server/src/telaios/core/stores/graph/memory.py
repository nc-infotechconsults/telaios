"""InMemoryGraphStore — NetworkX-backed graph store for dev and testing."""

from __future__ import annotations

from typing import Any

from telaios.core.stores.graph.base import GraphStore


class InMemoryGraphStore(GraphStore):
    """In-memory property graph using plain dicts. No external dependencies."""

    def __init__(self) -> None:
        self._entities: dict[str, dict[str, Any]] = {}
        self._relations: list[dict[str, str]] = []

    # ── Sync interface ────────────────────────────────────────────────────────

    def add_triplet(self, subject: str, predicate: str, obj: str) -> None:
        self._entities.setdefault(subject, {"name": subject, "type": "unknown", "properties": {}})
        self._entities.setdefault(obj, {"name": obj, "type": "unknown", "properties": {}})
        self._relations.append({"source": subject, "relation": predicate, "target": obj})

    def add_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        for s, p, o in triplets:
            self.add_triplet(s, p, o)

    def query(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        return list(self._relations)

    def get_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        visited: set[str] = set(center_entities)
        frontier: set[str] = set(center_entities)
        result: list[tuple[str, str, str]] = []

        for _ in range(depth):
            next_frontier: set[str] = set()
            for rel in self._relations:
                s, p, o = rel["source"], rel["relation"], rel["target"]
                if s in frontier or o in frontier:
                    result.append((s, p, o))
                    if s not in visited:
                        next_frontier.add(s)
                    if o not in visited:
                        next_frontier.add(o)
            visited |= next_frontier
            frontier = next_frontier
            if not frontier:
                break

        return result

    def extract_entities(self, text: str) -> list[tuple[str, str, str]]:
        return []

    # ── Async interface (delegates to sync) ───────────────────────────────────

    async def aadd_triplet(self, subject: str, predicate: str, obj: str) -> None:
        self.add_triplet(subject, predicate, obj)

    async def aadd_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        self.add_triplets(triplets)

    async def aquery(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        return self.query(cypher_or_pattern)

    async def aget_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        return self.get_subgraph(center_entities, depth)

    async def aextract_entities(self, text: str) -> list[tuple[str, str, str]]:
        return self.extract_entities(text)


__all__ = ["InMemoryGraphStore"]
