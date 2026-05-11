"""
src/core/providers/networkx/graph_store.py
------------------------------------------
In-memory graph store implementation using NetworkX.

Provides a lightweight, dependency-free graph database for testing
and small datasets. Uses regex-based entity extraction as a fallback
when spaCy is not available.

Sources
~~~~~~~
- NetworkX documentation: https://networkx.org/documentation/stable/
- NetworkX Graph types: https://networkx.org/documentation/stable/reference/classes/index.html
"""

from __future__ import annotations

import logging
import re
from typing import Any

from telaios.core.graph_store import GraphStore
from telaios.core.types import GraphStoreConfig

logger = logging.getLogger(__name__)


class NetworkXGraphStore(GraphStore):
    """
    In-memory graph store backed by NetworkX MultiDiGraph.

    Stores entities as nodes and relationships as labeled edges.
    Supports multi-edges (multiple relationships between the same pair).

    Entity extraction uses a simple regex-based approach as fallback
    when NLP libraries are unavailable.
    """

    def __init__(self, config: GraphStoreConfig) -> None:
        super().__init__(config)
        self._graph: Any | None = None
        self._init_graph()

    def _init_graph(self) -> None:
        """Lazy-initialize the NetworkX graph."""
        try:
            import networkx as nx

            self._graph = nx.MultiDiGraph()
        except ImportError as exc:
            raise ImportError(
                "NetworkXGraphStore requires networkx. Install with: pip install networkx"
            ) from exc

    def add_triplet(self, subject: str, predicate: str, object: str) -> None:
        """Add a single triplet as nodes and a labeled edge."""
        if self._graph is None:
            self._init_graph()
        assert self._graph is not None

        # Add nodes with entity type metadata
        if not self._graph.has_node(subject):
            self._graph.add_node(subject, entity_type="unknown")
        if not self._graph.has_node(object):
            self._graph.add_node(object, entity_type="unknown")

        # Add labeled edge (allows duplicates)
        self._graph.add_edge(subject, object, relation=predicate)

    def add_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        """Add multiple triplets in a batch."""
        for subj, pred, obj in triplets:
            self.add_triplet(subj, pred, obj)

    def query(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        """
        Query the graph using a simplified pattern syntax.

        Supports patterns like:
        - "entity1--relation->entity2"  (find specific path)
        - "entity1->*"                  (find outgoing edges)
        - "*->entity2"                  (find incoming edges)
        - "entity1"                     (find node)
        """
        if self._graph is None:
            self._init_graph()
        assert self._graph is not None

        results: list[dict[str, Any]] = []

        # Simple node lookup
        if "->" not in cypher_or_pattern and "--" not in cypher_or_pattern:
            node = cypher_or_pattern.strip()
            if self._graph.has_node(node):
                attrs = dict(self._graph.nodes[node])
                results.append({"node": node, **attrs})
            return results

        # Parse pattern: source --relation-> target
        # or: source -> target
        pattern = cypher_or_pattern.strip()

        if "--" in pattern and "->" in pattern:
            # Format: "source --relation-> target"
            parts = pattern.split("--")
            source = parts[0].strip()
            rest = parts[1].split("->")
            relation = rest[0].strip()
            target = rest[1].strip() if len(rest) > 1 else "*"
        elif "->" in pattern:
            # Format: "source -> target"
            parts = pattern.split("->")
            source = parts[0].strip()
            target = parts[1].strip() if len(parts) > 1 else "*"
            relation = "*"
        else:
            return results

        # Collect matching edges
        for u, v, key, data in self._graph.edges(keys=True, data=True):
            match_source = source == "*" or u == source
            match_target = target == "*" or v == target
            match_relation = relation == "*" or data.get("relation") == relation

            if match_source and match_target and match_relation:
                results.append(
                    {
                        "subject": u,
                        "predicate": data.get("relation", "unknown"),
                        "object": v,
                        "edge_key": key,
                    }
                )

        return results

    def get_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        """
        Extract a subgraph by BFS traversal from center entities.

        Returns all triplets reachable within ``depth`` hops.
        """
        if self._graph is None:
            self._init_graph()
        assert self._graph is not None

        import networkx as nx

        triplets: set[tuple[str, str, str]] = set()

        for center in center_entities:
            if not self._graph.has_node(center):
                continue

            # BFS up to depth hops
            for node in nx.single_source_shortest_path_length(self._graph, center, cutoff=depth):
                # Collect all edges from this node
                for _, v, data in self._graph.out_edges(node, data=True):
                    triplet = (node, data.get("relation", "unknown"), v)
                    triplets.add(triplet)

        return list(triplets)

    def extract_entities(self, text: str) -> list[tuple[str, str, str]]:
        """
        Extract entity triplets from text using regex patterns.

        This is a simple fallback extractor that looks for patterns like:
        - "X is a Y"
        - "X has Y"
        - "X uses Y"

        For production use, consider using spaCy or an LLM-based extractor.
        """
        triplets: list[tuple[str, str, str]] = []

        # Pattern: "X is a/an Y" or "X are Y"
        is_pattern = re.compile(
            r"([A-Z][a-zA-Z\s]+?)\s+is\s+(?:a|an|the)\s+([a-zA-Z\s]+?)(?:[,.;]|$)",
            re.IGNORECASE,
        )
        for match in is_pattern.finditer(text):
            entity = match.group(1).strip()
            type_ = match.group(2).strip()
            triplets.append((entity, "is_a", type_))

        # Pattern: "X has Y"
        has_pattern = re.compile(
            r"([A-Z][a-zA-Z\s]+?)\s+has\s+(?:a|an|the)?\s*([a-zA-Z\s]+?)(?:[,.;]|$)",
            re.IGNORECASE,
        )
        for match in has_pattern.finditer(text):
            entity = match.group(1).strip()
            attr = match.group(2).strip()
            triplets.append((entity, "has", attr))

        # Pattern: "X uses Y" or "X supports Y"
        verb_pattern = re.compile(
            r"([A-Z][a-zA-Z\s]+?)\s+(?:uses|supports|provides|requires|implements)\s+(?:a|an|the)?\s*([a-zA-Z\s]+?)(?:[,.;]|$)",
            re.IGNORECASE,
        )
        for match in verb_pattern.finditer(text):
            entity = match.group(1).strip()
            target = match.group(2).strip()
            relation = match.group(0).split()[1].lower()
            triplets.append((entity, relation, target))

        return triplets

    async def aadd_triplet(self, subject: str, predicate: str, obj: str) -> None:
        """Async wrapper (NetworkX is synchronous)."""
        self.add_triplet(subject, predicate, obj)

    async def aadd_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        """Async wrapper (NetworkX is synchronous)."""
        self.add_triplets(triplets)

    async def aquery(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        """Async wrapper (NetworkX is synchronous)."""
        return self.query(cypher_or_pattern)

    async def aget_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        """Async wrapper (NetworkX is synchronous)."""
        return self.get_subgraph(center_entities, depth)

    async def aextract_entities(self, text: str) -> list[tuple[str, str, str]]:
        """Async wrapper (NetworkX is synchronous)."""
        return self.extract_entities(text)

    def close(self) -> None:
        """No-op for in-memory store."""
        pass
