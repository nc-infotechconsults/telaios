"""
src/core/providers/neo4j/graph_store.py
---------------------------------------
Neo4j-backed graph store implementation.

Uses the official Neo4j Python driver for property graph storage
and Cypher query execution.

Sources
~~~~~~~
- Neo4j Python driver: https://neo4j.com/docs/python-manual/current/
- Cypher query language: https://neo4j.com/docs/cypher-manual/current/
- Neo4j Graph RAG: https://neo4j.com/developer-blog/genai-applications-how-to/
"""

from __future__ import annotations

import logging
from typing import Any

from core.graph_store import GraphStore
from core.types import GraphStoreConfig

logger = logging.getLogger(__name__)


class Neo4jGraphStore(GraphStore):
    """
    Graph store backed by Neo4j property graph database.

    Stores entities as nodes with ``__Entity__`` label and relationships
    as typed edges. Supports full Cypher querying and subgraph traversal.

    Requires:
        pip install neo4j

    Args:
        config: GraphStoreConfig with provider="neo4j", uri, username, password.
    """

    def __init__(self, config: GraphStoreConfig) -> None:
        super().__init__(config)
        self._driver: Any | None = None
        self._init_driver()

    def _init_driver(self) -> None:
        """Initialize the Neo4j driver (sync)."""
        try:
            from neo4j import GraphDatabase
        except ImportError as exc:
            raise ImportError(
                "Neo4jGraphStore requires the neo4j Python driver. "
                "Install with: pip install neo4j"
            ) from exc

        uri = self.config.uri or "bolt://localhost:7687"
        auth = (
            self.config.username or "neo4j",
            self.config.password or "",
        )

        self._driver = GraphDatabase.driver(uri, auth=auth)

        # Verify connectivity
        try:
            self._driver.verify_connectivity()
        except Exception as exc:
            logger.warning("Neo4j connectivity check failed: %s", exc)

    def add_triplet(self, subject: str, predicate: str, object: str) -> None:
        """
        Add a single triplet as nodes and a relationship in Neo4j.

        Uses MERGE to avoid duplicate nodes, CREATE for relationships.
        """
        if self._driver is None:
            self._init_driver()

        cypher = """
        MERGE (s:__Entity__ {name: $subject})
        MERGE (o:__Entity__ {name: $object})
        CREATE (s)-[r:RELATION {type: $predicate}]->(o)
        RETURN s, r, o
        """

        with self._driver.session(database=self.config.database) as session:
            session.run(
                cypher,
                subject=subject,
                object=object,
                predicate=predicate,
            )

    def add_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        """Add multiple triplets efficiently using UNWIND."""
        if self._driver is None:
            self._init_driver()

        cypher = """
        UNWIND $triplets AS triplet
        MERGE (s:__Entity__ {name: triplet[0]})
        MERGE (o:__Entity__ {name: triplet[2]})
        CREATE (s)-[r:RELATION {type: triplet[1]}]->(o)
        """

        with self._driver.session(database=self.config.database) as session:
            session.run(cypher, triplets=triplets)

    def query(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        """
        Execute a Cypher query and return results as dictionaries.

        Args:
            cypher_or_pattern: Valid Cypher query string.

        Returns:
            List of dictionaries, one per result row.
        """
        if self._driver is None:
            self._init_driver()

        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher_or_pattern)
            records = []
            for record in result:
                row: dict[str, Any] = {}
                for key in record.keys():
                    value = record[key]
                    # Convert Neo4j Node/Relationship objects to dicts
                    if hasattr(value, "items"):
                        row[key] = dict(value.items())
                    else:
                        row[key] = value
                records.append(row)
            return records

    def get_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        """
        Extract a subgraph by traversing from center entities.

        Uses variable-length path matching in Cypher.
        """
        if self._driver is None:
            self._init_driver()

        triplets: set[tuple[str, str, str]] = set()

        cypher = f"""
        MATCH path = (center:__Entity__)-[:RELATION*1..{depth}]->(neighbor:__Entity__)
        WHERE center.name IN $center_entities
        UNWIND relationships(path) AS rel
        MATCH (start)-[rel]->(end)
        RETURN start.name AS subject, rel.type AS predicate, end.name AS object
        """

        with self._driver.session(database=self.config.database) as session:
            result = session.run(cypher, center_entities=center_entities)
            for record in result:
                triplet = (
                    record["subject"],
                    record["predicate"],
                    record["object"],
                )
                triplets.add(triplet)

        return list(triplets)

    def extract_entities(self, text: str) -> list[tuple[str, str, str]]:
        """
        Extract entity triplets from text using regex patterns.

        This is a simple fallback extractor. For production use with Neo4j,
        consider using an LLM-based extractor (e.g., LangChain's
        LLMGraphTransformer).
        """
        import re

        triplets: list[tuple[str, str, str]] = []

        # Simple patterns for common relationship types
        patterns = [
            (
                r"([A-Z][a-zA-Z\s]+?)\s+is\s+(?:a|an|the)\s+([a-zA-Z\s]+?)(?:[,.;]|$)",
                "is_a",
            ),
            (
                r"([A-Z][a-zA-Z\s]+?)\s+has\s+(?:a|an|the)?\s*([a-zA-Z\s]+?)(?:[,.;]|$)",
                "has",
            ),
            (
                r"([A-Z][a-zA-Z\s]+?)\s+(?:uses|supports|provides|requires)\s+(?:a|an|the)?\s*([a-zA-Z\s]+?)(?:[,.;]|$)",
                "uses",
            ),
        ]

        for pattern, default_relation in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                entity = match.group(1).strip()
                target = match.group(2).strip()
                triplets.append((entity, default_relation, target))

        return triplets

    async def aadd_triplet(self, subject: str, predicate: str, obj: str) -> None:
        """Async wrapper (Neo4j driver is synchronous)."""
        self.add_triplet(subject, predicate, obj)

    async def aadd_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        """Async wrapper (Neo4j driver is synchronous)."""
        self.add_triplets(triplets)

    async def aquery(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        """Async wrapper (Neo4j driver is synchronous)."""
        return self.query(cypher_or_pattern)

    async def aget_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        """Async wrapper (Neo4j driver is synchronous)."""
        return self.get_subgraph(center_entities, depth)

    async def aextract_entities(self, text: str) -> list[tuple[str, str, str]]:
        """Async wrapper (Neo4j driver is synchronous)."""
        return self.extract_entities(text)

    def close(self) -> None:
        """Close the Neo4j driver connection."""
        if self._driver is not None:
            self._driver.close()
            self._driver = None