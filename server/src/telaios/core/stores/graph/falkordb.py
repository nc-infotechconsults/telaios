"""FalkorDBGraphStore — lightweight production graph store (Redis-protocol)."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from telaios.core.stores.graph.base import GraphStore

if TYPE_CHECKING:
    from telaios.core.knowledge.code_graph import CodeEntities
    from telaios.core.knowledge.config import GraphStoreConfig

_PRIMITIVE_TYPES = frozenset({
    "void", "int", "long", "short", "byte", "char", "float", "double", "boolean",
    "String", "Integer", "Long", "Short", "Byte", "Character", "Float", "Double",
    "Boolean", "Object", "Number", "List", "Map", "Set", "Collection",
    "Optional", "ResponseEntity", "HttpStatus", "Pageable", "Page",
})

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
        header = [self._col_name(h) for h in result.header]
        return [dict(zip(header, row)) for row in result.result_set]

    @staticmethod
    def _col_name(h: Any) -> str:
        """Extract column alias from a FalkorDB header entry.

        The Python client may return (ColumnType, name), [name, type], or a plain string
        depending on driver version. Find the first string element to be version-agnostic.
        """
        if isinstance(h, (list, tuple)):
            for item in h:
                if isinstance(item, str):
                    return item
            return str(h[0])
        return str(h)

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

    # ── Typed code-graph operations ───────────────────────────────────────────

    def upsert_code_entities(self, entities: "CodeEntities", project_id: str) -> None:
        """Create/update typed nodes and edges from AST-extracted code entities."""
        pid = project_id

        # 1. Class nodes
        for cls in entities.classes:
            self._graph.query(
                "MERGE (c:CodeClass {name: $name, project_id: $pid}) "
                "SET c.package = $pkg, c.file_path = $fp, c.qualified_name = $qname, "
                "c.is_abstract = $abstract, c.is_interface = $iface, c.is_enum = $enum, "
                "c.component_type = $comp",
                {
                    "name": cls.name, "pid": pid,
                    "pkg": cls.package, "fp": cls.file_path,
                    "qname": cls.qualified_name,
                    "abstract": cls.is_abstract, "iface": cls.is_interface,
                    "enum": cls.is_enum, "comp": cls.component_type or "",
                },
            )

        # 2. Inheritance edges
        for cls in entities.classes:
            if cls.superclass and cls.superclass not in _PRIMITIVE_TYPES:
                self._safe_query(
                    "MERGE (a:CodeClass {name: $a, project_id: $pid}) "
                    "MERGE (b:CodeClass {name: $b, project_id: $pid}) "
                    "MERGE (a)-[:EXTENDS]->(b)",
                    {"a": cls.name, "b": cls.superclass, "pid": pid},
                )
            for iface in cls.interfaces:
                if iface not in _PRIMITIVE_TYPES:
                    self._safe_query(
                        "MERGE (a:CodeClass {name: $a, project_id: $pid}) "
                        "MERGE (b:CodeClass {name: $b, project_id: $pid}) "
                        "MERGE (a)-[:IMPLEMENTS]->(b)",
                        {"a": cls.name, "b": iface, "pid": pid},
                    )

        # 3. Import edges (class-level dependency)
        for imp in entities.imports:
            sn = imp.simple_name
            if sn and sn not in _PRIMITIVE_TYPES and sn[0].isupper():
                self._safe_query(
                    "MERGE (a:CodeClass {name: $a, project_id: $pid}) "
                    "MERGE (b:CodeClass {name: $b, project_id: $pid}) "
                    "MERGE (a)-[:IMPORTS]->(b)",
                    {"a": imp.importing_class, "b": sn, "pid": pid},
                )

        # 4. Field dependency edges
        for fld in entities.fields:
            ft = fld.field_type
            if ft and ft not in _PRIMITIVE_TYPES and ft[0].isupper():
                self._safe_query(
                    "MERGE (a:CodeClass {name: $a, project_id: $pid}) "
                    "MERGE (b:CodeClass {name: $b, project_id: $pid}) "
                    "MERGE (a)-[:DEPENDS_ON {via: 'field', field_name: $fn}]->(b)",
                    {"a": fld.class_name, "b": ft, "pid": pid, "fn": fld.name},
                )

        # 5. REST endpoint nodes + edges
        for ep in entities.endpoints:
            self._graph.query(
                "MERGE (e:RestEndpoint {http_method: $method, path: $path, project_id: $pid}) "
                "SET e.handler_class = $hc, e.handler_method = $hm, "
                "e.request_body_type = $rbt, e.response_type = $rt",
                {
                    "method": ep.http_method, "path": ep.path, "pid": pid,
                    "hc": ep.handler_class, "hm": ep.handler_method,
                    "rbt": ep.request_body_type or "", "rt": ep.response_type or "",
                },
            )
            # RestEndpoint → HANDLED_BY → CodeClass
            self._safe_query(
                "MERGE (e:RestEndpoint {http_method: $method, path: $path, project_id: $pid}) "
                "MERGE (c:CodeClass {name: $hc, project_id: $pid}) "
                "MERGE (e)-[:HANDLED_BY]->(c)",
                {"method": ep.http_method, "path": ep.path, "pid": pid, "hc": ep.handler_class},
            )
            # RestEndpoint → TAKES_BODY → CodeClass (request DTO)
            rbt = ep.request_body_type
            if rbt and rbt not in _PRIMITIVE_TYPES and rbt[0].isupper():
                self._safe_query(
                    "MERGE (e:RestEndpoint {http_method: $method, path: $path, project_id: $pid}) "
                    "MERGE (b:CodeClass {name: $bt, project_id: $pid}) "
                    "MERGE (e)-[:TAKES_BODY]->(b)",
                    {"method": ep.http_method, "path": ep.path, "pid": pid, "bt": rbt},
                )

        logger.debug(
            "Upserted %d classes, %d fields, %d imports, %d endpoints for project %s in %s",
            len(entities.classes), len(entities.fields), len(entities.imports),
            len(entities.endpoints), project_id, entities.file_path,
        )

    def query_structural(self, intent: str, params: dict[str, str], project_id: str) -> list[dict[str, Any]]:
        """Run a Cypher query for structural code information."""
        match intent:
            case "dependency":
                return self._query_dependencies(params, project_id)
            case "inheritance":
                return self._query_inheritance(params, project_id)
            case "endpoint_count":
                return self._query_endpoint_list(project_id)  # count in formatter
            case "endpoint_list":
                return self._query_endpoint_list(project_id)
            case "endpoint_detail":
                return self._query_endpoint_detail(params, project_id)
            case _:
                return []

    def _query_dependencies(self, params: dict[str, str], project_id: str) -> list[dict[str, Any]]:
        class_name = params.get("class_name", "")
        if not class_name:
            return []
        cypher = (
            "MATCH (c:CodeClass {project_id: $pid})-[r]->(t:CodeClass) "
            "WHERE (t.name = $cn OR t.name CONTAINS $cn) "
            "AND type(r) IN ['DEPENDS_ON', 'IMPORTS'] "
            "RETURN c.name AS class_name, c.file_path AS file_path, "
            "c.package AS package, type(r) AS relation_type"
        )
        return self.query(cypher, {"pid": project_id, "cn": class_name})

    def _query_inheritance(self, params: dict[str, str], project_id: str) -> list[dict[str, Any]]:
        class_name = params.get("class_name", "")
        if not class_name:
            return []
        cypher = (
            "MATCH (c:CodeClass {project_id: $pid})-[r]->(t:CodeClass) "
            "WHERE (t.name = $cn OR t.name CONTAINS $cn) "
            "AND type(r) IN ['EXTENDS', 'IMPLEMENTS'] "
            "RETURN c.name AS class_name, c.file_path AS file_path, "
            "c.package AS package, type(r) AS relation_type"
        )
        return self.query(cypher, {"pid": project_id, "cn": class_name})

    def _query_endpoint_list(self, project_id: str) -> list[dict[str, Any]]:
        cypher = (
            "MATCH (e:RestEndpoint {project_id: $pid}) "
            "RETURN e.http_method AS http_method, e.path AS path, "
            "e.handler_class AS handler_class, e.handler_method AS handler_method, "
            "e.request_body_type AS request_body_type, e.response_type AS response_type "
            "ORDER BY e.path"
        )
        return self.query(cypher, {"pid": project_id})

    def _query_endpoint_detail(self, params: dict[str, str], project_id: str) -> list[dict[str, Any]]:
        http_method = params.get("http_method", "")
        path = params.get("path", "")

        conditions = ["e.project_id = $pid"]
        qparams: dict[str, Any] = {"pid": project_id}

        if http_method:
            conditions.append("e.http_method = $method")
            qparams["method"] = http_method
        if path:
            conditions.append("(e.path = $path OR e.path CONTAINS $seg)")
            qparams["path"] = path
            # use first non-empty segment for partial match
            qparams["seg"] = next((s for s in path.strip("/").split("/") if s and "{" not in s), path)

        where = " AND ".join(conditions)
        cypher = (
            f"MATCH (e:RestEndpoint) WHERE {where} "
            "RETURN e.http_method AS http_method, e.path AS path, "
            "e.handler_class AS handler_class, e.handler_method AS handler_method, "
            "e.request_body_type AS request_body_type, e.response_type AS response_type"
        )
        return self.query(cypher, qparams)

    def _safe_query(self, cypher: str, params: dict[str, Any]) -> None:
        try:
            self._graph.query(cypher, params)
        except Exception as exc:
            logger.debug("Graph edge query skipped: %s — %s", exc, cypher[:80])

    async def aupsert_code_entities(self, entities: "CodeEntities", project_id: str) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.upsert_code_entities, entities, project_id)

    async def aquery_structural(
        self, intent: str, params: dict[str, str], project_id: str
    ) -> list[dict[str, Any]]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.query_structural, intent, params, project_id)


__all__ = ["FalkorDBGraphStore"]
