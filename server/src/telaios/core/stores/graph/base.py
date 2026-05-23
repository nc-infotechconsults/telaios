"""GraphStore ABC — framework-agnostic knowledge graph interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


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


__all__ = ["GraphStore"]
