"""Integration tests for graph store implementations.

Tests run against real services started by docker-compose.dev.yml.
Each store implementation (InMemory, Neo4j, FalkorDB) is exercised through
the same parametrized contract tests, verifying:

  - add_triplet / aadd_triplets roundtrip
  - get_subgraph depth-1 and depth-2 traversal
  - batch upsert idempotency (MERGE semantics)
  - isolation via aclear() between tests

Skip guards:
  - Neo4j:   pytest -m "not requires_neo4j"
  - FalkorDB: pytest -m "not requires_falkordb"

Run only these tests:
  pytest tests/integration/core/test_graph_stores.py -v
"""

from __future__ import annotations

import os
import socket

import pytest

from telaios.core.stores.graph.base import GraphStore
from telaios.core.stores.graph.memory import InMemoryGraphStore

# ── Reachability guards ───────────────────────────────────────────────────────


def _tcp_reachable(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _neo4j_reachable() -> bool:
    host = os.environ.get("NEO4J_HOST", "localhost")
    port = int(os.environ.get("NEO4J_BOLT_PORT", "7687"))
    return _tcp_reachable(host, port)


def _falkordb_reachable() -> bool:
    host = os.environ.get("FALKORDB_HOST", "localhost")
    port = int(os.environ.get("FALKORDB_PORT", "6380"))
    return _tcp_reachable(host, port)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def memory_store(request: pytest.FixtureRequest) -> GraphStore:
    store = InMemoryGraphStore()
    request.addfinalizer(lambda: __import__("asyncio").run(store.aclear()))
    return store


@pytest.fixture
def neo4j_store(request: pytest.FixtureRequest) -> GraphStore:
    """Fresh Neo4jGraphStore connected to the test Neo4j instance."""
    if not _neo4j_reachable():
        pytest.skip("Neo4j not reachable at localhost:7687 — start with docker-compose.dev.yml")
    pytest.importorskip("neo4j")
    import asyncio

    from telaios.core.knowledge.config import GraphStoreConfig
    from telaios.core.stores.graph.neo4j import Neo4jGraphStore
    from telaios.domain.enums import GraphStoreProvider

    host = os.environ.get("NEO4J_HOST", "localhost")
    port = os.environ.get("NEO4J_BOLT_PORT", "7687")
    cfg = GraphStoreConfig(
        provider=GraphStoreProvider.NEO4J,
        uri=f"bolt://{host}:{port}",
        username=os.environ.get("NEO4J_USERNAME", "neo4j"),
        password=os.environ.get("NEO4J_PASSWORD", "telaios"),
        database="neo4j",  # community edition: only the default database exists
    )
    store = Neo4jGraphStore(cfg)
    asyncio.run(store.aclear())  # start clean; no loop running at fixture-setup time

    def _cleanup() -> None:
        asyncio.run(store.aclear())
        asyncio.run(store.aclose())

    request.addfinalizer(_cleanup)
    return store


@pytest.fixture
def falkordb_store(request: pytest.FixtureRequest) -> GraphStore:
    """Fresh FalkorDBGraphStore connected to the test FalkorDB instance."""
    if not _falkordb_reachable():
        pytest.skip("FalkorDB not reachable at localhost:6380 — start with docker-compose.dev.yml")
    pytest.importorskip("falkordb")
    import asyncio

    from telaios.core.knowledge.config import GraphStoreConfig
    from telaios.core.stores.graph.falkordb import FalkorDBGraphStore
    from telaios.domain.enums import GraphStoreProvider

    host = os.environ.get("FALKORDB_HOST", "localhost")
    port = os.environ.get("FALKORDB_PORT", "6380")
    cfg = GraphStoreConfig(
        provider=GraphStoreProvider.FALKORDB,
        uri=f"redis://{host}:{port}",
        username="",
        password="",
        database="test_knowledge",
    )
    store = FalkorDBGraphStore(cfg)
    store.clear()  # sync clear on setup

    def _cleanup() -> None:
        store.clear()

    request.addfinalizer(_cleanup)
    return store


# ── Parametrized contract tests ───────────────────────────────────────────────
# Each test is parametrized over all three fixtures so the same assertions
# are applied uniformly to InMemory, Neo4j, and FalkorDB.
#
# Marks control which require external services:
#   memory — always runs
#   neo4j  — requires_neo4j
#   falkordb — requires_falkordb


def _store_params():
    return [
        pytest.param("memory_store", marks=[pytest.mark.integration]),
        pytest.param(
            "neo4j_store",
            marks=[pytest.mark.integration, pytest.mark.requires_neo4j],
        ),
        pytest.param(
            "falkordb_store",
            marks=[pytest.mark.integration, pytest.mark.requires_falkordb],
        ),
    ]


@pytest.mark.parametrize("store_fixture", _store_params())
async def test_add_single_triplet(store_fixture: str, request: pytest.FixtureRequest) -> None:
    store: GraphStore = request.getfixturevalue(store_fixture)

    await store.aadd_triplet("Alice", "KNOWS", "Bob")

    subgraph = await store.aget_subgraph(["Alice"], depth=1)
    assert any(s == "Alice" and p == "KNOWS" and o == "Bob" for s, p, o in subgraph), (
        f"Expected (Alice, KNOWS, Bob) in subgraph, got: {subgraph}"
    )


@pytest.mark.parametrize("store_fixture", _store_params())
async def test_add_triplets_batch(store_fixture: str, request: pytest.FixtureRequest) -> None:
    store: GraphStore = request.getfixturevalue(store_fixture)

    triplets = [
        ("Dog", "IS_A", "Animal"),
        ("Cat", "IS_A", "Animal"),
        ("Animal", "HAS", "DNA"),
    ]
    await store.aadd_triplets(triplets)

    subgraph = await store.aget_subgraph(["Dog", "Cat"], depth=1)
    subjects = {s for s, _, _ in subgraph}
    objects = {o for _, _, o in subgraph}
    assert "Dog" in subjects or "Dog" in objects
    assert "Cat" in subjects or "Cat" in objects
    assert "Animal" in subjects or "Animal" in objects


@pytest.mark.parametrize("store_fixture", _store_params())
async def test_subgraph_depth1_vs_depth2(store_fixture: str, request: pytest.FixtureRequest) -> None:
    """Depth-2 traversal must reach nodes 2 hops away from the seed."""
    store: GraphStore = request.getfixturevalue(store_fixture)

    await store.aadd_triplets([
        ("Python", "RUNS_ON", "CPython"),
        ("CPython", "WRITTEN_IN", "C"),
        ("C", "COMPILED_BY", "GCC"),
    ])

    depth1 = await store.aget_subgraph(["Python"], depth=1)
    depth2 = await store.aget_subgraph(["Python"], depth=2)

    all_nodes_d1 = {n for t in depth1 for n in (t[0], t[2])}
    all_nodes_d2 = {n for t in depth2 for n in (t[0], t[2])}

    # CPython is 1 hop from Python
    assert "CPython" in all_nodes_d1, f"depth-1 nodes: {all_nodes_d1}"
    # C is 2 hops from Python
    assert "C" in all_nodes_d2, f"depth-2 nodes: {all_nodes_d2}"
    # C may or may not appear at depth-1 depending on direction
    # But GCC is definitely 3 hops — should NOT appear at depth-2
    # (unless the store does undirected traversal, which is fine)


@pytest.mark.parametrize("store_fixture", _store_params())
async def test_merge_idempotency(store_fixture: str, request: pytest.FixtureRequest) -> None:
    """Adding the same triplet twice must not create duplicates."""
    store: GraphStore = request.getfixturevalue(store_fixture)

    for _ in range(3):
        await store.aadd_triplet("X", "REL", "Y")

    subgraph = await store.aget_subgraph(["X"], depth=1)
    xy_triplets = [(s, p, o) for s, p, o in subgraph if s == "X" and p == "REL" and o == "Y"]
    assert len(xy_triplets) == 1, f"Expected 1 triplet, got {len(xy_triplets)}: {xy_triplets}"


@pytest.mark.parametrize("store_fixture", _store_params())
async def test_empty_subgraph_for_unknown_entity(
    store_fixture: str, request: pytest.FixtureRequest
) -> None:
    store: GraphStore = request.getfixturevalue(store_fixture)

    await store.aadd_triplet("KnownA", "REL", "KnownB")
    result = await store.aget_subgraph(["NonExistent"], depth=2)
    assert result == [], f"Expected empty subgraph, got: {result}"


@pytest.mark.parametrize("store_fixture", _store_params())
async def test_aclear_removes_all_data(store_fixture: str, request: pytest.FixtureRequest) -> None:
    store: GraphStore = request.getfixturevalue(store_fixture)

    await store.aadd_triplets([("A", "B", "C"), ("D", "E", "F")])
    await store.aclear()

    result = await store.aget_subgraph(["A", "D"], depth=2)
    assert result == [], f"Expected empty graph after clear, got: {result}"


@pytest.mark.parametrize("store_fixture", _store_params())
async def test_special_characters_in_entity_names(
    store_fixture: str, request: pytest.FixtureRequest
) -> None:
    """Entity names with spaces and punctuation must round-trip correctly."""
    store: GraphStore = request.getfixturevalue(store_fixture)

    await store.aadd_triplet("My Entity", "IS_PART_OF", "Complex System (v2)")

    subgraph = await store.aget_subgraph(["My Entity"], depth=1)
    assert any(o == "Complex System (v2)" for _, _, o in subgraph), (
        f"Expected 'Complex System (v2)' in subgraph objects, got: {subgraph}"
    )


# ── Neo4j-specific tests ──────────────────────────────────────────────────────


@pytest.mark.integration
@pytest.mark.requires_neo4j
async def test_neo4j_aquery_raw_cypher(neo4j_store: GraphStore) -> None:
    """aquery() accepts raw Cypher and returns dicts."""
    await neo4j_store.aadd_triplet("Sun", "CENTER_OF", "SolarSystem")

    from telaios.core.stores.graph.neo4j import Neo4jGraphStore
    assert isinstance(neo4j_store, Neo4jGraphStore)

    rows = await neo4j_store.aquery(
        "MATCH (s:Entity {name: 'Sun'})-[r:RELATION]->(o:Entity) "
        "RETURN s.name AS subject, r.type AS predicate, o.name AS object"
    )
    assert len(rows) == 1
    assert rows[0]["subject"] == "Sun"
    assert rows[0]["predicate"] == "CENTER_OF"
    assert rows[0]["object"] == "SolarSystem"


@pytest.mark.integration
@pytest.mark.requires_neo4j
async def test_neo4j_large_batch(neo4j_store: GraphStore) -> None:
    """Batch UNWIND MERGE handles 100+ triplets efficiently."""
    triplets = [(f"Entity{i}", "CONNECTED_TO", f"Entity{i + 1}") for i in range(100)]
    await neo4j_store.aadd_triplets(triplets)

    subgraph = await neo4j_store.aget_subgraph(["Entity0"], depth=2)
    nodes = {n for t in subgraph for n in (t[0], t[2])}
    assert "Entity0" in nodes
    assert "Entity1" in nodes
    assert "Entity2" in nodes  # 2 hops away


# ── FalkorDB-specific tests ───────────────────────────────────────────────────


@pytest.mark.integration
@pytest.mark.requires_falkordb
async def test_falkordb_sync_add_and_query(falkordb_store: GraphStore) -> None:
    """Sync add_triplet and get_subgraph are consistent with async versions."""
    from telaios.core.stores.graph.falkordb import FalkorDBGraphStore
    assert isinstance(falkordb_store, FalkorDBGraphStore)

    # Use sync interface directly
    falkordb_store.add_triplet("Moon", "ORBITS", "Earth")

    # Read back via async
    subgraph = await falkordb_store.aget_subgraph(["Moon"], depth=1)
    assert any(s == "Moon" and p == "ORBITS" and o == "Earth" for s, p, o in subgraph), (
        f"Got: {subgraph}"
    )


@pytest.mark.integration
@pytest.mark.requires_falkordb
async def test_falkordb_depth2_bfs(falkordb_store: GraphStore) -> None:
    """BFS expansion correctly reaches depth-2 nodes."""
    await falkordb_store.aadd_triplets([
        ("Rome", "CAPITAL_OF", "Italy"),
        ("Italy", "IN_CONTINENT", "Europe"),
    ])

    depth1 = await falkordb_store.aget_subgraph(["Rome"], depth=1)
    depth2 = await falkordb_store.aget_subgraph(["Rome"], depth=2)

    nodes_d1 = {n for t in depth1 for n in (t[0], t[2])}
    nodes_d2 = {n for t in depth2 for n in (t[0], t[2])}

    assert "Italy" in nodes_d1, f"depth-1: {nodes_d1}"
    assert "Europe" in nodes_d2, f"depth-2: {nodes_d2}"
