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

_EXTENSION_LANGUAGE: dict[str, str] = {
    ".py": "python", ".java": "java", ".ts": "typescript",
    ".tsx": "tsx", ".js": "javascript", ".jsx": "javascript",
}

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

    def delete_project(self, project_id: str) -> None:
        """Delete all nodes tagged with *project_id* (preserves other projects)."""
        self._graph.query(
            "MATCH (n {project_id: $pid}) DETACH DELETE n",
            {"pid": project_id},
        )

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
        from pathlib import Path
        pid = project_id
        fp = entities.file_path

        # ── 0. CodeFile node ──────────────────────────────────────────────────
        lang = _EXTENSION_LANGUAGE.get(Path(fp).suffix.lower(), "")
        self._graph.query(
            "MERGE (f:CodeFile {file_path: $fp, project_id: $pid}) "
            "SET f.language = $lang",
            {"fp": fp, "pid": pid, "lang": lang},
        )

        # ── 1. Class nodes (enriched with start_line/end_line) ────────────────
        for cls in entities.classes:
            self._graph.query(
                "MERGE (c:CodeClass {name: $name, project_id: $pid}) "
                "SET c.package = $pkg, c.file_path = $fp, c.qualified_name = $qname, "
                "c.is_abstract = $abstract, c.is_interface = $iface, c.is_enum = $enum, "
                "c.component_type = $comp, c.request_mapping_prefix = $prefix, "
                "c.start_line = $sl, c.end_line = $el",
                {
                    "name": cls.name, "pid": pid,
                    "pkg": cls.package, "fp": cls.file_path,
                    "qname": cls.qualified_name,
                    "abstract": cls.is_abstract, "iface": cls.is_interface,
                    "enum": cls.is_enum, "comp": cls.component_type or "",
                    "prefix": cls.request_mapping_prefix,
                    "sl": cls.start_line, "el": cls.end_line,
                },
            )
            # CodeFile -[:CONTAINS]-> CodeClass
            self._safe_query(
                "MATCH (f:CodeFile {file_path: $fp, project_id: $pid}) "
                "MATCH (c:CodeClass {name: $cn, project_id: $pid}) "
                "MERGE (f)-[:CONTAINS]->(c)",
                {"fp": fp, "pid": pid, "cn": cls.name},
            )

        # ── 2. Inheritance edges ──────────────────────────────────────────────
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

        # ── 3. Import edges (class-level dependency) ──────────────────────────
        for imp in entities.imports:
            sn = imp.simple_name
            if sn and sn not in _PRIMITIVE_TYPES and sn[0].isupper():
                self._safe_query(
                    "MERGE (a:CodeClass {name: $a, project_id: $pid}) "
                    "MERGE (b:CodeClass {name: $b, project_id: $pid}) "
                    "MERGE (a)-[:IMPORTS]->(b)",
                    {"a": imp.importing_class, "b": sn, "pid": pid},
                )

        # ── 4. Field dependency edges ─────────────────────────────────────────
        for fld in entities.fields:
            ft = fld.field_type
            if ft and ft not in _PRIMITIVE_TYPES and ft[0].isupper():
                self._safe_query(
                    "MERGE (a:CodeClass {name: $a, project_id: $pid}) "
                    "MERGE (b:CodeClass {name: $b, project_id: $pid}) "
                    "MERGE (a)-[:DEPENDS_ON {via: 'field', field_name: $fn}]->(b)",
                    {"a": fld.class_name, "b": ft, "pid": pid, "fn": fld.name},
                )

        # ── 5. REST endpoint nodes + edges ────────────────────────────────────
        for ep in entities.endpoints:
            self._graph.query(
                "MERGE (e:RestEndpoint {http_method: $method, path: $path, project_id: $pid}) "
                "SET e.handler_class = $hc, e.handler_method = $hm, "
                "e.request_body_type = $rbt, e.response_type = $rt, "
                "e.method_path = $mp",
                {
                    "method": ep.http_method, "path": ep.path, "pid": pid,
                    "hc": ep.handler_class, "hm": ep.handler_method,
                    "rbt": ep.request_body_type or "", "rt": ep.response_type or "",
                    "mp": ep.method_path,
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

        # ── 6. CodeFunction nodes + HAS_METHOD edges ──────────────────────────
        for method in entities.methods:
            self._graph.query(
                "MERGE (fn:CodeFunction {name: $name, class_name: $cn, "
                "file_path: $fp, project_id: $pid}) "
                "SET fn.start_line = $sl, fn.end_line = $el, "
                "fn.return_type = $rt, fn.visibility = $vis, fn.is_static = $static",
                {
                    "name": method.name, "cn": method.class_name,
                    "fp": fp, "pid": pid,
                    "sl": method.start_line, "el": method.end_line,
                    "rt": method.return_type, "vis": method.visibility,
                    "static": method.is_static,
                },
            )
            if method.class_name:
                self._safe_query(
                    "MATCH (c:CodeClass {name: $cn, project_id: $pid}) "
                    "MATCH (fn:CodeFunction {name: $fn, class_name: $cn, project_id: $pid}) "
                    "MERGE (c)-[:HAS_METHOD]->(fn)",
                    {"cn": method.class_name, "fn": method.name, "pid": pid},
                )
            else:
                # Module-level function: CodeFile -[:CONTAINS]-> CodeFunction
                self._safe_query(
                    "MATCH (f:CodeFile {file_path: $fp, project_id: $pid}) "
                    "MATCH (fn:CodeFunction {name: $fn, class_name: '', project_id: $pid}) "
                    "MERGE (f)-[:CONTAINS]->(fn)",
                    {"fp": fp, "fn": method.name, "pid": pid},
                )

        # ── 7. CALLS edges (caller function → callee function) ────────────────
        # Callee MERGE uses only {name, project_id} — if callee hasn't been indexed
        # yet (cross-file, different processing order), a ghost node is created with
        # those two properties only (no class_name/file_path).
        # resolve_cross_file_calls() post-pass re-wires ghosts to real nodes.
        for call in entities.calls:
            callee = call.callee_name
            if not callee or callee[0].islower() is False and len(callee) < 3:
                continue
            self._safe_query(
                "MERGE (caller:CodeFunction {name: $caller_m, class_name: $caller_c, project_id: $pid}) "
                "MERGE (callee:CodeFunction {name: $callee, project_id: $pid}) "
                "ON CREATE SET callee.is_ghost = true "
                "MERGE (caller)-[:CALLS]->(callee)",
                {
                    "caller_m": call.caller_method,
                    "caller_c": call.caller_class,
                    "callee": callee,
                    "pid": pid,
                },
            )

        logger.debug(
            "Upserted %d classes, %d methods, %d fields, %d imports, %d endpoints, %d calls "
            "for project %s in %s",
            len(entities.classes), len(entities.methods), len(entities.fields),
            len(entities.imports), len(entities.endpoints), len(entities.calls),
            project_id, entities.file_path,
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
            case "callers_of":
                return self._query_callers_of(params, project_id)
            case "dependents_of":
                return self._query_dependents_of(params, project_id)
            case "impact_set":
                return self._query_impact_set(params, project_id)
            case _:
                return []

    def _query_dependencies(self, params: dict[str, str], project_id: str) -> list[dict[str, Any]]:
        class_name = params.get("class_name", "")
        if not class_name:
            return []
        # Class-level dependency (DEPENDS_ON, IMPORTS)
        class_rows = self.query(
            "MATCH (c:CodeClass {project_id: $pid})-[r]->(t:CodeClass) "
            "WHERE (t.name = $cn OR t.name CONTAINS $cn) "
            "AND type(r) IN ['DEPENDS_ON', 'IMPORTS'] "
            "RETURN c.name AS class_name, c.file_path AS file_path, "
            "c.package AS package, type(r) AS relation_type",
            {"pid": project_id, "cn": class_name},
        )
        # Function-level CALLS edges
        fn_rows = self.query(
            "MATCH (caller:CodeFunction {project_id: $pid})-[:CALLS]->(callee:CodeFunction) "
            "WHERE callee.name = $cn OR callee.name CONTAINS $cn "
            "RETURN caller.class_name AS class_name, caller.name AS method_name, "
            "caller.file_path AS file_path, 'CALLS' AS relation_type",
            {"pid": project_id, "cn": class_name},
        )
        return class_rows + fn_rows

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

    def _query_callers_of(self, params: dict[str, str], project_id: str) -> list[dict[str, Any]]:
        """Find all functions/methods that call a given function."""
        name = params.get("function_name") or params.get("name") or params.get("class_name", "")
        if not name:
            return []
        return self.query(
            "MATCH (caller:CodeFunction {project_id: $pid})-[:CALLS]->(callee:CodeFunction {project_id: $pid}) "
            "WHERE callee.name = $fn OR callee.name CONTAINS $fn "
            "RETURN caller.name AS caller_name, caller.class_name AS class_name, "
            "caller.file_path AS file_path, callee.name AS callee_name, "
            "callee.class_name AS callee_class, callee.file_path AS callee_file",
            {"pid": project_id, "fn": name},
        )

    def _query_dependents_of(self, params: dict[str, str], project_id: str) -> list[dict[str, Any]]:
        """Find all classes/files that depend on a given class or file."""
        name = params.get("class_name") or params.get("name", "")
        if not name:
            return []
        class_rows = self.query(
            "MATCH (dep:CodeClass {project_id: $pid})-[r]->(target:CodeClass {project_id: $pid}) "
            "WHERE (target.name = $cn OR target.name CONTAINS $cn) "
            "AND type(r) IN ['IMPORTS', 'DEPENDS_ON', 'EXTENDS', 'IMPLEMENTS'] "
            "RETURN dep.name AS class_name, dep.file_path AS file_path, type(r) AS relation_type",
            {"pid": project_id, "cn": name},
        )
        file_rows = self.query(
            "MATCH (fa:CodeFile {project_id: $pid})-[:IMPORTS_FILE]->(fb:CodeFile {project_id: $pid}) "
            "WHERE fb.file_path CONTAINS $name "
            "RETURN fa.file_path AS file_path, 'IMPORTS_FILE' AS relation_type, '' AS class_name",
            {"pid": project_id, "name": name},
        )
        return class_rows + file_rows

    def _query_impact_set(self, params: dict[str, str], project_id: str) -> list[dict[str, Any]]:
        """BFS impact analysis: which entities would break if this entity changed?"""
        name = (
            params.get("name")
            or params.get("class_name")
            or params.get("function_name", "")
        )
        if not name:
            return []

        direct_class = self.query(
            "MATCH (dep)-[r]->(target:CodeClass {project_id: $pid}) "
            "WHERE (target.name = $name OR target.name CONTAINS $name) "
            "AND type(r) IN ['IMPORTS', 'DEPENDS_ON', 'EXTENDS', 'IMPLEMENTS'] "
            "RETURN labels(dep)[0] AS entity_type, dep.name AS name, "
            "dep.file_path AS file_path, type(r) AS relation_type, 1 AS depth",
            {"pid": project_id, "name": name},
        )
        direct_fn = self.query(
            "MATCH (caller:CodeFunction {project_id: $pid})-[:CALLS]->(callee:CodeFunction {project_id: $pid}) "
            "WHERE callee.name = $name OR callee.name CONTAINS $name "
            "RETURN 'CodeFunction' AS entity_type, caller.name AS name, "
            "caller.file_path AS file_path, 'CALLS' AS relation_type, 1 AS depth",
            {"pid": project_id, "name": name},
        )
        direct = direct_class + direct_fn

        # Second hop: files that import the impacted files
        impacted_fps = list({row.get("file_path", "") for row in direct if row.get("file_path")})
        if not impacted_fps:
            return direct

        fps_list = "[" + ", ".join(f'"{fp}"' for fp in impacted_fps) + "]"
        indirect = self.query(
            f"MATCH (fa:CodeFile {{project_id: $pid}})-[:IMPORTS_FILE]->(fb:CodeFile {{project_id: $pid}}) "
            f"WHERE fb.file_path IN {fps_list} "
            "RETURN 'CodeFile' AS entity_type, fa.file_path AS name, "
            "fa.file_path AS file_path, 'IMPORTS_FILE' AS relation_type, 2 AS depth",
            {"pid": project_id},
        )
        return direct + indirect

    def resolve_cross_file_calls(self, project_id: str) -> int:
        """Re-wire CALLS edges from ghost CodeFunction nodes to real nodes.

        Ghost nodes are created by step 7 MERGE when the callee file hasn't been
        indexed yet. They have no file_path or class_name. This post-pass finds
        them, links callers to real nodes, and deletes the ghosts.
        """
        pid = project_id
        ghosts = self.query(
            "MATCH (ghost:CodeFunction {project_id: $pid}) "
            "WHERE ghost.class_name IS NULL OR ghost.is_ghost = true "
            "RETURN ghost.name AS name",
            {"pid": pid},
        )
        if not ghosts:
            return 0

        resolved = 0
        for ghost_row in ghosts:
            ghost_name = ghost_row.get("name", "")
            if not ghost_name:
                continue

            reals = self.query(
                "MATCH (real:CodeFunction {name: $name, project_id: $pid}) "
                "WHERE real.file_path IS NOT NULL AND (real.class_name IS NOT NULL OR real.class_name <> '') "
                "RETURN real.name AS name, real.class_name AS class_name, real.file_path AS file_path",
                {"name": ghost_name, "pid": pid},
            )
            if not reals:
                continue

            callers = self.query(
                "MATCH (caller:CodeFunction {project_id: $pid})-[:CALLS]->"
                "(ghost:CodeFunction {name: $gname, project_id: $pid}) "
                "WHERE ghost.class_name IS NULL OR ghost.is_ghost = true "
                "RETURN caller.name AS caller_name, caller.class_name AS caller_class",
                {"pid": pid, "gname": ghost_name},
            )

            for caller_row in callers:
                caller_name = caller_row.get("caller_name", "")
                caller_class = caller_row.get("caller_class", "")
                for real_row in reals:
                    self._safe_query(
                        "MATCH (caller:CodeFunction {name: $cn, class_name: $cc, project_id: $pid}) "
                        "MATCH (real:CodeFunction {name: $rn, class_name: $rc, project_id: $pid}) "
                        "MERGE (caller)-[:CALLS]->(real)",
                        {
                            "cn": caller_name, "cc": caller_class,
                            "rn": real_row.get("name", ""), "rc": real_row.get("class_name", ""),
                            "pid": pid,
                        },
                    )
                    resolved += 1

            self._safe_query(
                "MATCH (ghost:CodeFunction {name: $gname, project_id: $pid}) "
                "WHERE ghost.class_name IS NULL OR ghost.is_ghost = true "
                "DETACH DELETE ghost",
                {"pid": pid, "gname": ghost_name},
            )

        if resolved:
            logger.info("Resolved %d cross-file CALLS edges for project %s", resolved, project_id)
        return resolved

    def resolve_import_file_edges(self, project_id: str) -> int:
        """Create IMPORTS_FILE edges between CodeFile nodes.

        Derives file-level dependencies from:
        1. CodeClass IMPORTS edges: if class A imports class B, A's file imports B's file.
        2. Cross-file CALLS edges: if function in file A calls function in file B.
        Run after resolve_cross_file_calls so CALLS edges are clean.
        """
        pid = project_id
        pairs: set[tuple[str, str]] = set()

        cls_rows = self.query(
            "MATCH (a:CodeClass {project_id: $pid})-[:IMPORTS]->(b:CodeClass {project_id: $pid}) "
            "WHERE a.file_path IS NOT NULL AND b.file_path IS NOT NULL "
            "AND a.file_path <> b.file_path "
            "RETURN DISTINCT a.file_path AS afp, b.file_path AS bfp",
            {"pid": pid},
        )
        for row in cls_rows:
            afp, bfp = row.get("afp", ""), row.get("bfp", "")
            if afp and bfp:
                pairs.add((afp, bfp))

        fn_rows = self.query(
            "MATCH (a:CodeFunction {project_id: $pid})-[:CALLS]->(b:CodeFunction {project_id: $pid}) "
            "WHERE a.file_path IS NOT NULL AND b.file_path IS NOT NULL "
            "AND a.file_path <> b.file_path "
            "RETURN DISTINCT a.file_path AS afp, b.file_path AS bfp",
            {"pid": pid},
        )
        for row in fn_rows:
            afp, bfp = row.get("afp", ""), row.get("bfp", "")
            if afp and bfp:
                pairs.add((afp, bfp))

        count = 0
        for afp, bfp in pairs:
            self._safe_query(
                "MATCH (fa:CodeFile {file_path: $afp, project_id: $pid}) "
                "MATCH (fb:CodeFile {file_path: $bfp, project_id: $pid}) "
                "MERGE (fa)-[:IMPORTS_FILE]->(fb)",
                {"afp": afp, "bfp": bfp, "pid": pid},
            )
            count += 1

        if count:
            logger.info("Created %d IMPORTS_FILE edges for project %s", count, project_id)
        return count

    async def aresolve_cross_file_calls(self, project_id: str) -> int:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.resolve_cross_file_calls, project_id)

    async def aresolve_import_file_edges(self, project_id: str) -> int:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.resolve_import_file_edges, project_id)

    def _safe_query(self, cypher: str, params: dict[str, Any]) -> None:
        try:
            self._graph.query(cypher, params)
        except Exception as exc:
            logger.debug("Graph edge query skipped: %s — %s", exc, cypher[:80])

    def resolve_inherited_endpoints(self, project_id: str) -> int:
        """Propagate REST endpoints from parent classes to child classes via EXTENDS edges.

        Runs multiple passes so deep chains (A→B→C) are fully resolved: each pass
        propagates one additional level until no new endpoints are created.

        Returns the total count of inherited endpoint nodes created.
        """
        total = 0
        for _ in range(10):  # bound depth; typical hierarchies are 1-3 levels
            n = self._resolve_inherited_endpoints_pass(project_id)
            total += n
            if n == 0:
                break
        if total:
            logger.info("Resolved %d inherited endpoint(s) for project %s", total, project_id)
        return total

    def _resolve_inherited_endpoints_pass(self, project_id: str) -> int:
        """Single inheritance propagation pass — returns count of new endpoints created."""
        # All child→parent pairs where the parent has endpoints with known method_path
        inherit_rows = self.query(
            "MATCH (child:CodeClass {project_id: $pid})-[:EXTENDS]->(parent:CodeClass {project_id: $pid}) "
            "MATCH (e:RestEndpoint {project_id: $pid})-[:HANDLED_BY]->(parent) "
            "RETURN child.name AS child_name, "
            "       child.request_mapping_prefix AS child_prefix, "
            "       e.http_method AS http_method, e.method_path AS method_path, "
            "       e.handler_method AS handler_method, "
            "       e.request_body_type AS request_body_type, "
            "       e.response_type AS response_type",
            {"pid": project_id},
        )

        # Build a set of (class_name, http_method, path) already in the graph
        existing_rows = self.query(
            "MATCH (e:RestEndpoint {project_id: $pid})-[:HANDLED_BY]->(c:CodeClass {project_id: $pid}) "
            "RETURN c.name AS class_name, e.http_method AS http_method, e.path AS path",
            {"pid": project_id},
        )
        existing: set[tuple[str, str, str]] = {
            (str(r.get("class_name") or ""), str(r.get("http_method") or ""), str(r.get("path") or ""))
            for r in existing_rows
            if r.get("class_name") and r.get("http_method") and r.get("path")
        }

        count = 0
        for row in inherit_rows:
            child_name = row.get("child_name") or ""
            child_prefix = row.get("child_prefix") or ""
            http_method = row.get("http_method") or ""
            method_path = row.get("method_path") or ""
            handler_method = row.get("handler_method") or ""
            rbt = row.get("request_body_type") or ""
            rt = row.get("response_type") or ""

            # Skip endpoints ingested before method_path was tracked
            if not (child_name and http_method and method_path):
                continue

            combined_path = _combine_paths(child_prefix, method_path)
            key = (child_name, http_method, combined_path)
            if key in existing:
                continue

            self._safe_query(
                "MERGE (e:RestEndpoint {http_method: $method, path: $path, project_id: $pid}) "
                "SET e.handler_class = $hc, e.handler_method = $hm, "
                "e.request_body_type = $rbt, e.response_type = $rt, "
                "e.method_path = $mp",
                {
                    "method": http_method, "path": combined_path, "pid": project_id,
                    "hc": child_name, "hm": handler_method,
                    "rbt": rbt, "rt": rt, "mp": method_path,
                },
            )
            self._safe_query(
                "MERGE (e:RestEndpoint {http_method: $method, path: $path, project_id: $pid}) "
                "MERGE (c:CodeClass {name: $hc, project_id: $pid}) "
                "MERGE (e)-[:HANDLED_BY]->(c)",
                {"method": http_method, "path": combined_path, "pid": project_id, "hc": child_name},
            )
            existing.add(key)
            count += 1

        return count

    # ── Doc_Section operations ────────────────────────────────────────────────

    def upsert_doc_section(
        self,
        section_id: str,
        heading: str,
        content_summary: str,
        kind: str,
        source_doc: str,
        start_line: int,
        project_id: str,
    ) -> None:
        self._graph.query(
            "MERGE (d:Doc_Section {id: $id, project_id: $pid}) "
            "SET d.heading = $heading, d.content_summary = $summary, "
            "d.kind = $kind, d.source_doc = $source, d.start_line = $sl",
            {
                "id": section_id, "pid": project_id,
                "heading": heading, "summary": content_summary[:500],
                "kind": kind, "source": source_doc, "sl": start_line,
            },
        )

    def add_references_edge(
        self,
        section_id: str,
        target_label: str,
        target_name: str,
        via: str,
        project_id: str,
    ) -> None:
        cypher = (
            f"MATCH (d:Doc_Section {{id: $sid, project_id: $pid}}) "
            f"MATCH (t:{target_label} {{name: $tn, project_id: $pid}}) "
            f"MERGE (d)-[:REFERENCES {{via: $via}}]->(t)"
        )
        self._safe_query(cypher, {"sid": section_id, "pid": project_id, "tn": target_name, "via": via})

    def query_doc_sections(self, project_id: str, kind: str | None = None) -> list[dict]:
        if kind:
            return self.query(
                "MATCH (d:Doc_Section {project_id: $pid, kind: $kind}) "
                "RETURN d.id AS id, d.heading AS heading, d.kind AS kind, "
                "d.source_doc AS source_doc, d.content_summary AS content_summary",
                {"pid": project_id, "kind": kind},
            )
        return self.query(
            "MATCH (d:Doc_Section {project_id: $pid}) "
            "RETURN d.id AS id, d.heading AS heading, d.kind AS kind, "
            "d.source_doc AS source_doc, d.content_summary AS content_summary",
            {"pid": project_id},
        )

    def query_unlinked_sections(self, project_id: str) -> list[dict]:
        return self._graph.query(
            "MATCH (d:Doc_Section {project_id: $pid}) "
            "WHERE NOT (d)-[:REFERENCES]->() "
            "RETURN d.id AS id, d.heading AS heading, d.kind AS kind, "
            "d.source_doc AS source_doc "
            "ORDER BY d.kind, d.heading",
            {"pid": project_id},
        )

    def query_sections_for_changed_files(
        self, project_id: str, changed_files: list[str]
    ) -> list[dict]:
        if not changed_files:
            return []
        files_list = "[" + ", ".join(f'"{f}"' for f in changed_files) + "]"
        return self._graph.query(
            "MATCH (d:Doc_Section)-[:REFERENCES]->(t) "
            "WHERE t.project_id = $pid "
            "AND (t:CodeFile OR t:CodeClass OR t:RestEndpoint) "
            f"AND t.file_path IN {files_list} "
            "RETURN d.id AS id, d.heading AS heading, "
            "d.source_doc AS source_doc, t.file_path AS file_path "
            "ORDER BY d.source_doc",
            {"pid": project_id},
        )

    async def aupsert_code_entities(self, entities: "CodeEntities", project_id: str) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.upsert_code_entities, entities, project_id)

    async def aresolve_inherited_endpoints(self, project_id: str) -> int:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.resolve_inherited_endpoints, project_id)

    async def aquery_structural(
        self, intent: str, params: dict[str, str], project_id: str
    ) -> list[dict[str, Any]]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.query_structural, intent, params, project_id)

    async def aupsert_doc_section(self, **kwargs) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: self.upsert_doc_section(**kwargs))

    async def aadd_references_edge(self, **kwargs) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: self.add_references_edge(**kwargs))

    async def aquery_doc_sections(self, project_id: str, kind: str | None = None) -> list[dict]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.query_doc_sections, project_id, kind)

    async def aquery_unlinked_sections(self, project_id: str) -> list[dict]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.query_unlinked_sections, project_id)

    async def aquery_sections_for_changed_files(
        self, project_id: str, changed_files: list[str]
    ) -> list[dict]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self.query_sections_for_changed_files, project_id, changed_files
        )


def _combine_paths(prefix: str, suffix: str) -> str:
    prefix = prefix.rstrip("/")
    if not suffix or suffix == "/":
        return prefix or "/"
    if not suffix.startswith("/"):
        suffix = "/" + suffix
    return prefix + suffix


__all__ = ["FalkorDBGraphStore"]
