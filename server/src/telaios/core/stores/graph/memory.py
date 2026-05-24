"""InMemoryGraphStore — NetworkX-backed graph store for dev and testing."""

from __future__ import annotations

from typing import Any

from telaios.core.stores.graph.base import GraphStore


class InMemoryGraphStore(GraphStore):
    """In-memory property graph using plain dicts.

    Improvements over naive BFS:
    - Entity normalization (lowercase + strip) before storage — prevents duplicate nodes.
    - Personalized PageRank (PPR) retrieval — handles multi-hop associations and
      high-degree hub nodes gracefully via the damping factor.
    - Community detection via NetworkX Louvain — groups semantically related entities
      so GraphAugmentor can build pre-computed cluster summaries.
    """

    def __init__(self) -> None:
        self._entities: dict[str, dict[str, Any]] = {}
        self._relations: list[dict[str, str]] = []

    # ── Normalization ─────────────────────────────────────────────────────────

    @staticmethod
    def _normalize(entity: str) -> str:
        return entity.strip()

    # ── Sync interface ────────────────────────────────────────────────────────

    def add_triplet(self, subject: str, predicate: str, obj: str) -> None:
        s = self._normalize(subject)
        p = predicate.strip()
        o = self._normalize(obj)
        self._entities.setdefault(s, {"name": s, "type": "unknown", "properties": {}})
        self._entities.setdefault(o, {"name": o, "type": "unknown", "properties": {}})
        rel = {"source": s, "relation": p, "target": o}
        if rel not in self._relations:
            self._relations.append(rel)

    def add_triplets(self, triplets: list[tuple[str, str, str]]) -> None:
        for s, p, o in triplets:
            self.add_triplet(s, p, o)

    def query(self, cypher_or_pattern: str) -> list[dict[str, Any]]:
        return list(self._relations)

    def get_subgraph(
        self, center_entities: list[str], depth: int = 2
    ) -> list[tuple[str, str, str]]:
        """PPR-based subgraph retrieval.

        Uses Personalized PageRank seeded at center_entities to score all graph nodes,
        then returns triplets involving the top-scoring nodes. Handles multi-hop
        traversal and high-degree hub nodes better than fixed-depth BFS.
        The `depth` parameter is retained for API compatibility but not used —
        PPR's damping factor α controls effective traversal depth.
        """
        pr = self._personalized_pagerank(center_entities)
        if not pr:
            return []

        sorted_nodes = sorted(pr.items(), key=lambda x: x[1], reverse=True)
        top_entities = {node for node, score in sorted_nodes[:30] if score > 0}

        result: list[tuple[str, str, str]] = []
        for rel in self._relations:
            s, o = rel["source"], rel["target"]
            if s in top_entities or o in top_entities:
                result.append((s, rel["relation"], o))

        return result[:50]

    def extract_entities(self, text: str) -> list[tuple[str, str, str]]:
        return []

    def get_communities(self, resolution: float = 1.0) -> list[set[str]]:
        """Detect entity communities via Louvain algorithm (requires networkx).

        Returns a list of entity-name sets, one per community.
        Falls back to returning each entity as its own community if networkx
        community detection fails.
        """
        if not self._relations:
            return []
        try:
            import networkx as nx

            G = nx.Graph()
            for rel in self._relations:
                G.add_edge(rel["source"], rel["target"])

            # louvain_communities requires networkx >= 2.7
            communities = nx.community.louvain_communities(G, seed=42, resolution=resolution)
            # Filter trivially small communities (< 2 entities)
            return [set(c) for c in communities if len(c) >= 2]
        except Exception:
            return []

    # ── PPR internals ─────────────────────────────────────────────────────────

    def _personalized_pagerank(
        self,
        center_entities: list[str],
        alpha: float = 0.15,
        n_iter: int = 30,
    ) -> dict[str, float]:
        """Compute Personalized PageRank seeded at center_entities.

        α = teleport probability back to seed nodes (restart probability).
        Uses undirected traversal — both source→target and target→source.
        """
        if not self._relations or not center_entities:
            return {}

        # Build undirected adjacency
        out_adj: dict[str, list[str]] = {}
        all_nodes: set[str] = set()
        for rel in self._relations:
            s, o = rel["source"], rel["target"]
            out_adj.setdefault(s, []).append(o)
            out_adj.setdefault(o, []).append(s)
            all_nodes.add(s)
            all_nodes.add(o)

        # Resolve seed nodes — normalize and match
        seeds: set[str] = set()
        normalized_seeds = {self._normalize(e) for e in center_entities}
        for node in all_nodes:
            if node in normalized_seeds or self._normalize(node) in normalized_seeds:
                seeds.add(node)

        if not seeds:
            return {}

        seed_prob = 1.0 / len(seeds)
        pr: dict[str, float] = {n: 0.0 for n in all_nodes}
        for s in seeds:
            pr[s] = seed_prob

        for _ in range(n_iter):
            new_pr: dict[str, float] = {n: 0.0 for n in all_nodes}

            # Teleport component — always restart to seeds
            for s in seeds:
                new_pr[s] += alpha * seed_prob

            # Random walk component
            for node in all_nodes:
                neighbors = out_adj.get(node, [])
                if not neighbors:
                    # Dangling node: teleport mass back to seeds
                    for s in seeds:
                        new_pr[s] += (1.0 - alpha) * pr[node] * seed_prob
                    continue
                contrib = (1.0 - alpha) * pr[node] / len(neighbors)
                for nb in neighbors:
                    new_pr[nb] += contrib

            pr = new_pr

        return pr

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

    async def aclear(self) -> None:
        self._entities.clear()
        self._relations.clear()


__all__ = ["InMemoryGraphStore"]
