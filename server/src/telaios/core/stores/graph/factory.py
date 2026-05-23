"""GraphStoreFactory — creates the correct GraphStore implementation from config."""

from __future__ import annotations

from typing import TYPE_CHECKING

from telaios.core.stores.graph.base import GraphStore

if TYPE_CHECKING:
    from telaios.core.knowledge.config import GraphStoreConfig

from telaios.domain.enums import GraphStoreProvider


class GraphStoreFactory:
    """Instantiate the correct GraphStore backend from a GraphStoreConfig."""

    @staticmethod
    def create(config: GraphStoreConfig) -> GraphStore:
        match config.provider:
            case GraphStoreProvider.NEO4J:
                from telaios.core.stores.graph.neo4j import Neo4jGraphStore
                return Neo4jGraphStore(config)
            case GraphStoreProvider.FALKORDB:
                from telaios.core.stores.graph.falkordb import FalkorDBGraphStore
                return FalkorDBGraphStore(config)
            case GraphStoreProvider.NETWORKX:
                from telaios.core.stores.graph.memory import InMemoryGraphStore
                return InMemoryGraphStore()
            case _:
                raise ValueError(f"Unsupported graph store provider: {config.provider!r}")


__all__ = ["GraphStoreFactory"]
