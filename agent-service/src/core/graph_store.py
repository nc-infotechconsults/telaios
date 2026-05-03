"""
src/core/graph_store.py
-----------------------
Framework-agnostic graph database abstraction for Graph RAG.

This module defines the ``GraphStore`` abstract base class for storing
and querying knowledge graphs. Concrete implementations handle specific
graph databases (Neo4j, NetworkX, FalkorDB, etc.).

Sources
~~~~~~~
- LangChain Graph RAG: https://python.langchain.com/docs/integrations/graphs/
- Neo4j Cypher: https://neo4j.com/docs/cypher-manual/current/
- NetworkX: https://networkx.org/documentation/stable/
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from core.types import Chunk, GraphStoreConfig, RetrievalResult


class GraphStore(ABC):
    """
    Framework-agnostic interface for a knowledge graph store.

    Implementations may wrap:
    - Neo4j (property graph with Cypher queries)
    - NetworkX (in-memory graph for testing)
    - FalkorDB (property graph with custom queries)
    - Memgraph (property graph)

    Callers depend only on this interface; they never import a concrete class.
    """

    def __init__(self, config: GraphStoreConfig) -> None:
        self.config = config

    @abstractmethod
    def add_triplet(self, subject: str, predicate: str, object: str) -> None:
        """
        Add a single triplet (subject → predicate → object) to the graph.

        Args:
            subject: The source entity (e.g., "LangChain")
            predicate: The relationship type (e.g., "is_a")
            object: The target entity (e.g., "framework")
        """
        ...

    @abstractmethod
    def add_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        """
        Add multiple triplets in a batch.

        Args:
            triplets: List of (subject, predicate, object) tuples.
        """
        ...

    @abstractmethod
    def query(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        """
        Query the graph and return results.

        For Neo4j/FalkorDB: expects a Cypher query string.
        For NetworkX: expects a pattern like "subject--predicate->object".

        Args:
            cypher_or_pattern: Query string in the graph's query language.

        Returns:
            List of result dictionaries with keys corresponding to the query.
        """
        ...

    @abstractmethod
    def get_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        """
        Extract a subgraph centered around the given entities.

        Traverses up to *depth* hops from each center entity and returns
        all reachable triplets as a list of (subject, predicate, object).

        Args:
            center_entities: List of entity names to start traversal from.
            depth: Maximum number of hops to traverse (default: 2).

        Returns:
            List of triplets (subject, predicate, object) in the subgraph.
        """
        ...

    @abstractmethod
    def extract_entities(self, text: str) -> list[tuple[str, str, str]]:
        """
        Extract entity triplets from raw text.

        Uses an LLM or NLP pipeline to identify entities and their
        relationships in unstructured text, returning triplets.

        Args:
            text: Raw text to extract entities from.

        Returns:
            List of (entity1, relationship, entity2) triplets.
        """
        ...

    @abstractmethod
    async def aadd_triplet(self, subject: str, predicate: str, obj: str) -> None:
        """Async version of add_triplet."""
        ...

    @abstractmethod
    async def aadd_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        """Async version of add_triplets."""
        ...

    @abstractmethod
    async def aquery(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        """Async version of query."""
        ...

    @abstractmethod
    async def aget_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        """Async version of get_subgraph."""
        ...

    @abstractmethod
    async def aextract_entities(self, text: str) -> list[tuple[str, str, str]]:
        """Async version of extract_entities."""
        ...

    def close(self) -> None:
        """Clean up resources (override in subclasses that need it)."""
        pass

    async def aclose(self) -> None:
        """Async version of close."""
        self.close()