"""GraphStore ABC — framework-agnostic knowledge graph interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from telaios.core.knowledge.code_graph import CodeEntities


class GraphStore(ABC):
    """
    Framework-agnostic interface for a knowledge graph store.

    Implementations: InMemoryGraphStore (dev), Neo4jGraphStore (prod), FalkorDBGraphStore (prod).
    Callers depend only on this interface.
    """

    @abstractmethod
    def add_triplet(self, subject: str, predicate: str, obj: str) -> None:
        """Add a single (subject → predicate → object) triplet."""
        ...

    @abstractmethod
    def add_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        """Add multiple triplets in a batch."""
        ...

    @abstractmethod
    def query(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        """Query the graph. Neo4j/FalkorDB expect Cypher; NetworkX expects a pattern."""
        ...

    @abstractmethod
    def get_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        """Traverse up to *depth* hops from each entity; return reachable triplets."""
        ...

    @abstractmethod
    def extract_entities(self, text: str) -> list[tuple[str, str, str]]:
        """Extract entity triplets from raw text via NLP/LLM."""
        ...

    @abstractmethod
    async def aadd_triplet(self, subject: str, predicate: str, obj: str) -> None:
        """Async add_triplet."""
        ...

    @abstractmethod
    async def aadd_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        """Async add_triplets."""
        ...

    @abstractmethod
    async def aquery(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        """Async query."""
        ...

    @abstractmethod
    async def aget_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        """Async get_subgraph."""
        ...

    @abstractmethod
    async def aextract_entities(self, text: str) -> list[tuple[str, str, str]]:
        """Async extract_entities."""
        ...

    def close(self) -> None:  # noqa: B027
        """Release resources. Override when needed."""

    async def aclose(self) -> None:
        """Async close."""
        self.close()

    async def aclear(self) -> None:
        """Delete all nodes and relationships. Override in implementations that support it."""

    def get_communities(self, resolution: float = 1.0) -> list[set[str]]:
        """Return entity clusters detected via community detection.

        Each set contains entity names belonging to the same community.
        Default implementation returns an empty list (no community detection).
        Override in stores that support graph topology analysis.
        """
        return []

    # ── Typed code-graph operations (optional, default no-ops) ───────────────

    def upsert_code_entities(self, entities: "CodeEntities", project_id: str) -> None:
        """Upsert typed code entities (classes, endpoints, relations) into the graph.

        Override in stores that support a typed code schema (e.g. FalkorDB).
        Default is a no-op so existing stores don't break.
        """

    async def aupsert_code_entities(self, entities: "CodeEntities", project_id: str) -> None:
        """Async upsert_code_entities."""
        import asyncio
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.upsert_code_entities, entities, project_id)

    def query_structural(self, intent: str, params: dict[str, str], project_id: str) -> list[dict[str, Any]]:
        """Run a structured code-graph query and return raw rows.

        *intent* is a QueryIntent string value. Override in typed-schema stores.
        Default returns empty list (no structural graph available).
        """
        return []

    async def aquery_structural(
        self, intent: str, params: dict[str, str], project_id: str
    ) -> list[dict[str, Any]]:
        """Async query_structural."""
        import asyncio
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.query_structural, intent, params, project_id)


__all__ = ["GraphStore"]
