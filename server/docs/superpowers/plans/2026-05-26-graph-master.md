# Graph Master — Code Graph Retrieval Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Qdrant+BM25 for code repositories with FalkorDB structural navigation and direct file reads (S3 / local disk), and add a generic `Doc_Section` graph node type for documentation→code traceability.

**Architecture:** FalkorDB is enriched with `CodeFile` and `CodeFunction` nodes (with `start_line`/`end_line` coordinates); ingestion skips Qdrant+BM25 for the `repositories` collection when `code_graph_only=True`; the agent retrieves code via a `graph_navigate` tool that resolves symbols to file coordinates, then a `read_source` tool that fetches the slice via S3 or local disk. Documentation Markdown is parsed into `Doc_Section` nodes with `REFERENCES` edges. The `documents` Qdrant collection is untouched.

**Tech Stack:** Python, FalkorDB (`falkordb` driver), tree-sitter (existing), `pytest` + `AsyncMock`/`MagicMock` (existing patterns), boto3 S3 (existing `infra/s3.py`).

---

## File Map

| File | Action |
|---|---|
| `src/telaios/core/knowledge/config.py` | Add `code_graph_only: bool` flag |
| `src/telaios/core/knowledge/code_graph.py` | Add `start_line`/`end_line` to `ClassInfo`, `MethodInfo`; populate in all extractors |
| `src/telaios/core/stores/graph/falkordb.py` | Enrich `upsert_code_entities()`; add `CodeFile`/`CodeFunction` nodes; add Doc_Section methods |
| `src/telaios/core/knowledge/file_reader.py` | **New** — `FileReader` protocol, `LocalFileReader`, `S3FileReader`, `FileReaderFactory` |
| `src/telaios/core/knowledge/markdown_ingester.py` | **New** — `MarkdownDocIngester`, `DocSectionResult` |
| `src/telaios/core/knowledge/ingestion.py` | Skip Qdrant+BM25 upsert for repositories when `code_graph_only=True` |
| `src/telaios/core/agents/retrieval/tools.py` | Add `file_reader` field; add `_graph_navigate`, `_doc_to_code`; upgrade `_read_source`; restrict `_vector_search` to documents |
| `src/telaios/core/agents/retrieval/nodes.py` | Update planner prompt + `_query_to_step` heuristic for new tools |
| `src/telaios/core/knowledge/pipeline.py` | Wire `MarkdownDocIngester` for `.md` ingest; pass `file_reader` to `RetrievalTools` |
| `src/telaios/core/knowledge/factory.py` | Build `FileReader` from config; pass to pipeline |
| `tests/unit/core/test_code_graph.py` | Add line-coord tests |
| `tests/unit/core/stores/__init__.py` | **New** (empty) |
| `tests/unit/core/stores/graph/__init__.py` | **New** (empty) |
| `tests/unit/core/stores/graph/test_falkordb_enriched.py` | **New** |
| `tests/unit/core/test_file_reader.py` | **New** |
| `tests/unit/core/test_markdown_ingester.py` | **New** |
| `tests/unit/core/agents/retrieval/test_tools_graph.py` | **New** |

---

## Task 1 — Add `code_graph_only` flag to `KnowledgePipelineConfig`

**Files:**
- Modify: `src/telaios/core/knowledge/config.py`
- Test: `tests/unit/core/test_settings_env.py` (add one assertion)

- [ ] **Step 1: Write failing test**

Add to `tests/unit/core/test_settings_env.py`:

```python
def test_code_graph_only_defaults_false():
    from telaios.core.knowledge.config import KnowledgePipelineConfig
    cfg = KnowledgePipelineConfig()
    assert cfg.code_graph_only is False
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd server && python -m pytest tests/unit/core/test_settings_env.py::test_code_graph_only_defaults_false -v
```

Expected: `AttributeError: 'KnowledgePipelineConfig' object has no attribute 'code_graph_only'`

- [ ] **Step 3: Add the flag**

In `src/telaios/core/knowledge/config.py`, add inside `KnowledgePipelineConfig` after the `docgen_enabled` line:

```python
    # Stage 1 migration flag: when True, ingestion skips Qdrant+BM25 for the
    # repositories collection and uses FalkorDB + direct file reads instead.
    code_graph_only: bool = False
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd server && python -m pytest tests/unit/core/test_settings_env.py::test_code_graph_only_defaults_false -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add server/src/telaios/core/knowledge/config.py server/tests/unit/core/test_settings_env.py
git commit -m "feat(knowledge/config): add code_graph_only migration flag"
```

---

## Task 2 — Add `start_line`/`end_line` to `ClassInfo` and `MethodInfo`

**Files:**
- Modify: `src/telaios/core/knowledge/code_graph.py`
- Test: `tests/unit/core/test_code_graph.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/unit/core/test_code_graph.py` (after existing imports/fixtures):

```python
class TestJavaLineNumbers:
    """JavaAstExtractor must capture start_line/end_line on ClassInfo and MethodInfo."""

    _SOURCE = """\
package com.example;

public class UserService {

    public User getUser(Long id) {
        return null;
    }
}
"""

    def test_class_line_numbers(self):
        entities = JavaAstExtractor().extract(self._SOURCE, "UserService.java")
        cls = entities.classes[0]
        assert cls.start_line == 3
        assert cls.end_line == 8

    def test_method_line_numbers(self):
        entities = JavaAstExtractor().extract(self._SOURCE, "UserService.java")
        method = next(m for m in entities.methods if m.name == "getUser")
        assert method.start_line == 5
        assert method.end_line == 7


class TestPythonLineNumbers:
    _SOURCE = """\
class Foo:
    def bar(self):
        pass
"""

    def test_class_line_numbers(self):
        from telaios.core.knowledge.code_graph import PythonAstExtractor
        entities = PythonAstExtractor().extract(self._SOURCE, "foo.py")
        cls = entities.classes[0]
        assert cls.start_line == 1
        assert cls.end_line == 3

    def test_method_line_numbers(self):
        from telaios.core.knowledge.code_graph import PythonAstExtractor
        entities = PythonAstExtractor().extract(self._SOURCE, "foo.py")
        method = next(m for m in entities.methods if m.name == "bar")
        assert method.start_line == 2
        assert method.end_line == 3
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && python -m pytest tests/unit/core/test_code_graph.py::TestJavaLineNumbers tests/unit/core/test_code_graph.py::TestPythonLineNumbers -v
```

Expected: `AssertionError` (start_line == 0 default)

- [ ] **Step 3: Add fields to dataclasses**

In `src/telaios/core/knowledge/code_graph.py`, add to `ClassInfo`:

```python
@dataclass
class ClassInfo:
    name: str
    package: str
    file_path: str
    is_abstract: bool = False
    is_interface: bool = False
    is_enum: bool = False
    superclass: str | None = None
    interfaces: list[str] = field(default_factory=list)
    annotations: list[str] = field(default_factory=list)
    component_type: str | None = None
    request_mapping_prefix: str = ""
    start_line: int = 0
    end_line: int = 0
```

Add to `MethodInfo`:

```python
@dataclass
class MethodInfo:
    class_name: str
    name: str
    return_type: str
    params: list[tuple[str, str]] = field(default_factory=list)
    annotations: list[str] = field(default_factory=list)
    annotation_values: dict[str, str] = field(default_factory=dict)
    visibility: str = "package"
    is_static: bool = False
    request_body_type: str | None = None
    http_method: str | None = None
    http_path: str | None = None
    start_line: int = 0
    end_line: int = 0
```

- [ ] **Step 4: Populate in `JavaAstExtractor._extract_class`**

In `_extract_class`, change the `ClassInfo(...)` construction to:

```python
        cls_info = ClassInfo(
            name=name,
            package=package,
            file_path=file_path,
            is_abstract=is_abstract,
            is_interface=is_interface,
            is_enum=is_enum,
            superclass=superclass,
            interfaces=interfaces,
            annotations=annotations,
            component_type=component_type,
            request_mapping_prefix=class_http_prefix,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
        )
```

- [ ] **Step 5: Populate in `JavaAstExtractor._extract_method`**

In `_extract_method`, change the `entities.methods.append(MethodInfo(...))` call to add the two new kwargs. The `node` variable is the `method_declaration` or `constructor_declaration` AST node already available in scope:

```python
        entities.methods.append(MethodInfo(
            class_name=class_name,
            name=method_name,
            return_type=return_type,
            params=params,
            annotations=annotations,
            annotation_values=annotation_values,
            visibility=visibility,
            is_static=is_static,
            request_body_type=request_body_type,
            http_method=http_method,
            http_path=http_path,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
        ))
```

- [ ] **Step 6: Populate in `PythonAstExtractor._extract_class`**

In `_extract_class`, change `ClassInfo(...)`:

```python
        cls_info = ClassInfo(
            name=node.name,
            package="",
            file_path=file_path,
            superclass=bases[0] if bases else None,
            interfaces=bases[1:],
            start_line=node.lineno,
            end_line=node.end_lineno or node.lineno,
        )
```

- [ ] **Step 7: Populate in `PythonAstExtractor._extract_function`**

In `_extract_function`, change `MethodInfo(...)`:

```python
        method_info = MethodInfo(
            class_name=class_name,
            name=node.name,
            return_type=return_type,
            params=params,
            annotations=decorators,
            visibility=visibility,
            start_line=node.lineno,
            end_line=node.end_lineno or node.lineno,
        )
```

- [ ] **Step 8: Populate in `_TsBaseExtractor._handle_class` and `_handle_method`**

In `_handle_class`, change `ClassInfo(...)` — `node` is the class_declaration node in scope:

```python
                cls_info = ClassInfo(
                    name=name,
                    package="",
                    file_path=file_path,
                    superclass=superclass,
                    interfaces=interfaces,
                    annotations=[n for n, _ in decorators],
                    request_mapping_prefix=class_prefix,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                )
```

In `_handle_method`, change `entities.methods.append(MethodInfo(...))` — `node` is the method_definition node in scope:

```python
        entities.methods.append(MethodInfo(
            class_name=class_name,
            name=name,
            return_type=return_type,
            params=params,
            annotations=[n for n, _ in decorators],
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
        ))
```

- [ ] **Step 9: Run tests — expect PASS**

```bash
cd server && python -m pytest tests/unit/core/test_code_graph.py::TestJavaLineNumbers tests/unit/core/test_code_graph.py::TestPythonLineNumbers -v
```

Expected: `2 passed`

- [ ] **Step 10: Run full code_graph test suite — no regressions**

```bash
cd server && python -m pytest tests/unit/core/test_code_graph.py -v
```

Expected: all previously-passing tests still pass.

- [ ] **Step 11: Commit**

```bash
git add server/src/telaios/core/knowledge/code_graph.py server/tests/unit/core/test_code_graph.py
git commit -m "feat(knowledge/code_graph): add start_line/end_line to ClassInfo and MethodInfo"
```

---

## Task 3 — Enrich FalkorDB: `CodeFile` + `CodeFunction` nodes, `CONTAINS`/`HAS_METHOD` edges

**Files:**
- Modify: `src/telaios/core/stores/graph/falkordb.py`
- Create: `tests/unit/core/stores/__init__.py`
- Create: `tests/unit/core/stores/graph/__init__.py`
- Create: `tests/unit/core/stores/graph/test_falkordb_enriched.py`

- [ ] **Step 1: Create test package `__init__` files**

```bash
touch server/tests/unit/core/stores/__init__.py server/tests/unit/core/stores/graph/__init__.py
```

- [ ] **Step 2: Write failing tests**

Create `tests/unit/core/stores/graph/test_falkordb_enriched.py`:

```python
"""Tests for enriched FalkorDBGraphStore code-entity writes.

Uses a mocked FalkorDB graph object to avoid requiring a running FalkorDB instance.
"""
from __future__ import annotations

from unittest.mock import MagicMock, call, patch

import pytest

from telaios.core.knowledge.code_graph import (
    ClassInfo,
    CodeEntities,
    FieldInfo,
    MethodInfo,
    RestEndpointInfo,
)


def _make_store():
    """Return a FalkorDBGraphStore with a mocked internal graph."""
    with patch("telaios.core.stores.graph.falkordb.FalkorDBGraphStore.__init__", return_value=None):
        from telaios.core.stores.graph.falkordb import FalkorDBGraphStore
        store = FalkorDBGraphStore.__new__(FalkorDBGraphStore)
        store._graph = MagicMock()
        store._graph_name = "test"
        return store


def _entities(file_path: str = "com/example/Foo.java") -> CodeEntities:
    return CodeEntities(
        file_path=file_path,
        classes=[
            ClassInfo(
                name="Foo", package="com.example", file_path=file_path,
                start_line=3, end_line=20,
            )
        ],
        methods=[
            MethodInfo(
                class_name="Foo", name="doWork", return_type="void",
                start_line=5, end_line=10,
            )
        ],
        fields=[],
        imports=[],
        endpoints=[],
    )


class TestCodeFileNode:
    def test_code_file_node_is_created(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("CodeFile" in c for c in calls), "expected CodeFile MERGE"

    def test_code_file_language_detected(self):
        store = _make_store()
        store.upsert_code_entities(_entities("src/Foo.java"), "proj-1")
        java_calls = [
            c for c in store._graph.query.call_args_list
            if "CodeFile" in str(c) and "java" in str(c)
        ]
        assert java_calls, "expected language=java on CodeFile node"


class TestCodeFunctionNode:
    def test_code_function_node_is_created(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("CodeFunction" in c and "doWork" in c for c in calls)

    def test_code_function_has_line_coords(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        fn_calls = [
            c for c in store._graph.query.call_args_list
            if "CodeFunction" in str(c) and "MERGE" in str(c)
        ]
        assert fn_calls
        params = fn_calls[0][0][1]  # second positional arg is the params dict
        assert params.get("sl") == 5
        assert params.get("el") == 10


class TestCodeClassLineCoords:
    def test_class_start_end_line_written(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        cls_calls = [
            c for c in store._graph.query.call_args_list
            if "CodeClass" in str(c) and "MERGE" in str(c) and "start_line" in str(c)
        ]
        assert cls_calls
        params = cls_calls[0][0][1]
        assert params.get("sl") == 3
        assert params.get("el") == 20


class TestContainsEdge:
    def test_code_file_contains_code_class_edge(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        edge_calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("CONTAINS" in c and "CodeClass" in c for c in edge_calls)

    def test_code_class_has_method_edge(self):
        store = _make_store()
        store.upsert_code_entities(_entities(), "proj-1")
        edge_calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("HAS_METHOD" in c for c in edge_calls)
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
cd server && python -m pytest tests/unit/core/stores/graph/test_falkordb_enriched.py -v
```

Expected: multiple `AssertionError`s (CodeFile, CodeFunction, CONTAINS, HAS_METHOD not yet written)

- [ ] **Step 4: Add `_EXTENSION_LANGUAGE` map and enrich `upsert_code_entities`**

At the top of `src/telaios/core/stores/graph/falkordb.py`, add after `_PRIMITIVE_TYPES`:

```python
_EXTENSION_LANGUAGE: dict[str, str] = {
    ".py": "python", ".java": "java", ".ts": "typescript",
    ".tsx": "tsx", ".js": "javascript", ".jsx": "javascript",
}
```

Replace the entire `upsert_code_entities` method with:

```python
    def upsert_code_entities(self, entities: "CodeEntities", project_id: str) -> None:
        """Create/update typed nodes and edges from AST-extracted code entities."""
        pid = project_id
        fp = entities.file_path

        # ── 0. CodeFile node ──────────────────────────────────────────────────
        from pathlib import Path
        lang = _EXTENSION_LANGUAGE.get(Path(fp).suffix.lower(), "")
        self._graph.query(
            "MERGE (f:CodeFile {file_path: $fp, project_id: $pid}) "
            "SET f.language = $lang",
            {"fp": fp, "pid": pid, "lang": lang},
        )

        # ── 1. Class nodes ────────────────────────────────────────────────────
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

        # ── 3. Import edges ───────────────────────────────────────────────────
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
            self._safe_query(
                "MERGE (e:RestEndpoint {http_method: $method, path: $path, project_id: $pid}) "
                "MERGE (c:CodeClass {name: $hc, project_id: $pid}) "
                "MERGE (e)-[:HANDLED_BY]->(c)",
                {"method": ep.http_method, "path": ep.path, "pid": pid, "hc": ep.handler_class},
            )
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

        logger.debug(
            "Upserted %d classes, %d methods, %d fields, %d imports, %d endpoints "
            "for project %s in %s",
            len(entities.classes), len(entities.methods), len(entities.fields),
            len(entities.imports), len(entities.endpoints), project_id, entities.file_path,
        )
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd server && python -m pytest tests/unit/core/stores/graph/test_falkordb_enriched.py -v
```

Expected: `5 passed`

- [ ] **Step 6: Run existing falkordb-dependent tests — no regressions**

```bash
cd server && python -m pytest tests/unit/core/test_code_graph.py -v
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/telaios/core/stores/graph/falkordb.py \
        server/tests/unit/core/stores/__init__.py \
        server/tests/unit/core/stores/graph/__init__.py \
        server/tests/unit/core/stores/graph/test_falkordb_enriched.py
git commit -m "feat(stores/graph): enrich FalkorDB with CodeFile, CodeFunction nodes and CONTAINS/HAS_METHOD edges"
```

---

## Task 4 — Add `Doc_Section` graph methods to `FalkorDBGraphStore`

**Files:**
- Modify: `src/telaios/core/stores/graph/falkordb.py`
- Modify: `tests/unit/core/stores/graph/test_falkordb_enriched.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/core/stores/graph/test_falkordb_enriched.py`:

```python
class TestDocSectionMethods:
    def test_upsert_doc_section_calls_merge(self):
        store = _make_store()
        store.upsert_doc_section(
            section_id="auth-requirements",
            heading="Authentication Requirements",
            content_summary="Users must authenticate via JWT.",
            kind="requirement",
            source_doc="docs/auth.md",
            start_line=10,
            project_id="proj-1",
        )
        calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("Doc_Section" in c and "auth-requirements" in c for c in calls)

    def test_add_references_edge_creates_edge(self):
        store = _make_store()
        store.add_references_edge(
            section_id="auth-requirements",
            target_label="CodeClass",
            target_name="AuthService",
            via="annotation",
            project_id="proj-1",
        )
        calls = [str(c) for c in store._graph.query.call_args_list]
        assert any("REFERENCES" in c for c in calls)

    def test_query_doc_sections_returns_rows(self):
        store = _make_store()
        store._graph.query.return_value = [
            {"id": "s1", "heading": "Foo", "kind": "guide", "source_doc": "x.md", "content_summary": ""},
        ]
        rows = store.query_doc_sections("proj-1")
        assert len(rows) == 1
        assert rows[0]["id"] == "s1"

    def test_query_unlinked_sections_uses_not_pattern(self):
        store = _make_store()
        store._graph.query.return_value = []
        store.query_unlinked_sections("proj-1")
        call_cypher = store._graph.query.call_args[0][0]
        assert "NOT" in call_cypher
        assert "REFERENCES" in call_cypher

    def test_query_sections_for_changed_files_empty_returns_early(self):
        store = _make_store()
        rows = store.query_sections_for_changed_files("proj-1", [])
        assert rows == []
        store._graph.query.assert_not_called()
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && python -m pytest tests/unit/core/stores/graph/test_falkordb_enriched.py::TestDocSectionMethods -v
```

Expected: `AttributeError` — methods don't exist yet.

- [ ] **Step 3: Add Doc_Section methods to `FalkorDBGraphStore`**

Add after the `_resolve_inherited_endpoints_pass` method and before the async wrappers section in `falkordb.py`:

```python
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
        """Create REFERENCES edge from Doc_Section to a named code entity.

        Uses _safe_query so a missing target silently no-ops rather than raising.
        target_label must be one of: CodeClass, CodeFunction, CodeFile, RestEndpoint.
        """
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
        return self.query(
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
        return self.query(
            "MATCH (d:Doc_Section)-[:REFERENCES]->(t) "
            "WHERE t.project_id = $pid "
            "AND (t:CodeFile OR t:CodeClass OR t:RestEndpoint) "
            f"AND t.file_path IN {files_list} "
            "RETURN d.id AS id, d.heading AS heading, "
            "d.source_doc AS source_doc, t.file_path AS file_path "
            "ORDER BY d.source_doc",
            {"pid": project_id},
        )
```

Add async wrappers alongside the existing async wrapper block:

```python
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && python -m pytest tests/unit/core/stores/graph/test_falkordb_enriched.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/telaios/core/stores/graph/falkordb.py \
        server/tests/unit/core/stores/graph/test_falkordb_enriched.py
git commit -m "feat(stores/graph): add Doc_Section graph methods to FalkorDBGraphStore"
```

---

## Task 5 — `FileReader` abstraction

**Files:**
- Create: `src/telaios/core/knowledge/file_reader.py`
- Create: `tests/unit/core/test_file_reader.py`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/core/test_file_reader.py`:

```python
"""Unit tests for FileReader implementations."""
from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest


class TestLocalFileReader:
    @pytest.fixture
    def tmp_file(self, tmp_path: Path) -> Path:
        f = tmp_path / "sample.py"
        f.write_text("line1\nline2\nline3\nline4\nline5\n")
        return f

    async def test_read_full_file(self, tmp_file: Path):
        from telaios.core.knowledge.file_reader import LocalFileReader
        reader = LocalFileReader()
        content = await reader.read(str(tmp_file))
        assert content == "line1\nline2\nline3\nline4\nline5\n"

    async def test_read_line_range(self, tmp_file: Path):
        from telaios.core.knowledge.file_reader import LocalFileReader
        reader = LocalFileReader()
        content = await reader.read(str(tmp_file), start_line=2, end_line=3)
        assert content == "line2\nline3\n"

    async def test_read_with_context_padding(self, tmp_file: Path):
        from telaios.core.knowledge.file_reader import LocalFileReader
        reader = LocalFileReader()
        content = await reader.read(str(tmp_file), start_line=3, end_line=3, context_lines=1)
        assert "line2" in content
        assert "line3" in content
        assert "line4" in content

    async def test_context_padding_clamps_at_file_boundaries(self, tmp_file: Path):
        from telaios.core.knowledge.file_reader import LocalFileReader
        reader = LocalFileReader()
        # start_line=1 with context_lines=5 should not go negative
        content = await reader.read(str(tmp_file), start_line=1, end_line=1, context_lines=5)
        assert "line1" in content  # no error, starts at line 1


class TestS3FileReader:
    def _mock_s3(self, content: str) -> MagicMock:
        s3 = MagicMock()
        s3.get_object.return_value = {
            "Body": MagicMock(read=MagicMock(return_value=content.encode("utf-8")))
        }
        return s3

    async def test_read_full_file_from_s3(self):
        from telaios.core.knowledge.file_reader import S3FileReader
        s3 = self._mock_s3("a\nb\nc\n")
        reader = S3FileReader(s3_client=s3, bucket="my-bucket")
        content = await reader.read("repo/file.py")
        s3.get_object.assert_called_once_with(Bucket="my-bucket", Key="repo/file.py")
        assert content == "a\nb\nc\n"

    async def test_key_prefix_prepended(self):
        from telaios.core.knowledge.file_reader import S3FileReader
        s3 = self._mock_s3("x\n")
        reader = S3FileReader(s3_client=s3, bucket="b", key_prefix="projects/repo1")
        await reader.read("src/Foo.java")
        s3.get_object.assert_called_once_with(
            Bucket="b", Key="projects/repo1/src/Foo.java"
        )

    async def test_read_line_range_from_s3(self):
        from telaios.core.knowledge.file_reader import S3FileReader
        s3 = self._mock_s3("line1\nline2\nline3\nline4\n")
        reader = S3FileReader(s3_client=s3, bucket="b")
        content = await reader.read("f.py", start_line=2, end_line=3)
        assert content == "line2\nline3\n"


class TestSliceLines:
    def test_full_content_when_no_start_line(self):
        from telaios.core.knowledge.file_reader import _slice_lines
        assert _slice_lines("a\nb\nc\n", None, None, 0) == "a\nb\nc\n"

    def test_single_line(self):
        from telaios.core.knowledge.file_reader import _slice_lines
        assert _slice_lines("a\nb\nc\n", 2, 2, 0) == "b\n"

    def test_end_line_defaults_to_start_line(self):
        from telaios.core.knowledge.file_reader import _slice_lines
        result = _slice_lines("a\nb\nc\n", 1, None, 0)
        assert result == "a\n"
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && python -m pytest tests/unit/core/test_file_reader.py -v
```

Expected: `ModuleNotFoundError: No module named 'telaios.core.knowledge.file_reader'`

- [ ] **Step 3: Create `src/telaios/core/knowledge/file_reader.py`**

```python
"""FileReader — abstraction for reading source files from local disk or S3."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@runtime_checkable
class FileReader(Protocol):
    async def read(
        self,
        file_path: str,
        start_line: int | None = None,
        end_line: int | None = None,
        context_lines: int = 0,
    ) -> str: ...


class LocalFileReader:
    """Reads files from local disk. Covers FileSource, local GitSource, cloned GitHubSource."""

    async def read(
        self,
        file_path: str,
        start_line: int | None = None,
        end_line: int | None = None,
        context_lines: int = 0,
    ) -> str:
        def _read_sync() -> str:
            with open(file_path, encoding="utf-8", errors="replace") as fh:
                return fh.read()

        try:
            content = await asyncio.get_running_loop().run_in_executor(None, _read_sync)
        except OSError as exc:
            logger.warning("LocalFileReader: cannot read %r — %s", file_path, exc)
            return ""
        return _slice_lines(content, start_line, end_line, context_lines)


class S3FileReader:
    """Reads files from an S3 bucket. Covers S3-hosted local repository versions."""

    def __init__(self, s3_client: Any, bucket: str, key_prefix: str = "") -> None:
        self._s3 = s3_client
        self._bucket = bucket
        self._key_prefix = key_prefix.rstrip("/")

    async def read(
        self,
        file_path: str,
        start_line: int | None = None,
        end_line: int | None = None,
        context_lines: int = 0,
    ) -> str:
        key = f"{self._key_prefix}/{file_path}" if self._key_prefix else file_path

        def _fetch() -> str:
            response = self._s3.get_object(Bucket=self._bucket, Key=key)
            return response["Body"].read().decode("utf-8", errors="replace")

        try:
            content = await asyncio.get_running_loop().run_in_executor(None, _fetch)
        except Exception as exc:
            logger.warning("S3FileReader: cannot fetch %r from %r — %s", key, self._bucket, exc)
            return ""
        return _slice_lines(content, start_line, end_line, context_lines)


def _slice_lines(
    content: str,
    start_line: int | None,
    end_line: int | None,
    context_lines: int,
) -> str:
    if start_line is None:
        return content
    lines = content.splitlines(keepends=True)
    s = max(0, (start_line - 1) - context_lines)
    e = min(len(lines), (end_line or start_line) + context_lines)
    return "".join(lines[s:e])


class FileReaderFactory:
    @staticmethod
    def local() -> LocalFileReader:
        return LocalFileReader()

    @staticmethod
    def s3(s3_client: Any, bucket: str, key_prefix: str = "") -> S3FileReader:
        return S3FileReader(s3_client=s3_client, bucket=bucket, key_prefix=key_prefix)


__all__ = ["FileReader", "LocalFileReader", "S3FileReader", "FileReaderFactory", "_slice_lines"]
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && python -m pytest tests/unit/core/test_file_reader.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/telaios/core/knowledge/file_reader.py \
        server/tests/unit/core/test_file_reader.py
git commit -m "feat(knowledge): add FileReader abstraction — LocalFileReader + S3FileReader"
```

---

## Task 6 — `MarkdownDocIngester`

**Files:**
- Create: `src/telaios/core/knowledge/markdown_ingester.py`
- Create: `tests/unit/core/test_markdown_ingester.py`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/core/test_markdown_ingester.py`:

```python
"""Unit tests for MarkdownDocIngester."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest


_SIMPLE_MD = """\
# Authentication

Users must log in via JWT.

## Token Refresh

Tokens expire after 1 hour. Use @AuthService to refresh.

## Logout

Call @UserController to invalidate.
"""


def _make_graph_store():
    store = MagicMock()
    store.upsert_doc_section = MagicMock()
    store.add_references_edge = MagicMock()
    return store


class TestMarkdownDocIngester:
    def _ingest(self, content: str = _SIMPLE_MD, kind: str = "guide"):
        from telaios.core.knowledge.markdown_ingester import MarkdownDocIngester
        store = _make_graph_store()
        ingester = MarkdownDocIngester()
        results = ingester.ingest(
            content=content,
            source_doc="docs/auth.md",
            project_id="proj-1",
            kind=kind,
            graph_store=store,
        )
        return results, store

    def test_sections_are_parsed(self):
        results, _ = self._ingest()
        headings = [r.heading for r in results]
        assert "Authentication" in headings
        assert "Token Refresh" in headings
        assert "Logout" in headings

    def test_upsert_called_per_section(self):
        results, store = self._ingest()
        assert store.upsert_doc_section.call_count == 3

    def test_section_ids_are_slugified(self):
        results, _ = self._ingest()
        ids = [r.section_id for r in results]
        assert "authentication" in ids
        assert "token-refresh" in ids

    def test_kind_propagated(self):
        results, store = self._ingest(kind="requirement")
        call_kwargs = store.upsert_doc_section.call_args_list[0][1]
        assert call_kwargs["kind"] == "requirement"

    def test_annotation_triggers_references_edge(self):
        results, store = self._ingest()
        # @AuthService and @UserController in the fixture
        assert store.add_references_edge.call_count >= 2
        target_names = [
            c[1]["target_name"] for c in store.add_references_edge.call_args_list
        ]
        assert "AuthService" in target_names
        assert "UserController" in target_names

    def test_via_annotation_on_references_edge(self):
        results, store = self._ingest()
        for c in store.add_references_edge.call_args_list:
            assert c[1]["via"] == "annotation"

    def test_no_annotation_no_edge(self):
        results, store = self._ingest("# Plain Section\n\nNo annotations here.\n")
        store.add_references_edge.assert_not_called()

    def test_duplicate_headings_get_numeric_suffix(self):
        md = "# Foo\n\nbody1\n\n# Foo\n\nbody2\n"
        results, _ = self._ingest(content=md)
        ids = [r.section_id for r in results]
        assert "foo" in ids
        assert "foo-1" in ids

    def test_empty_file_returns_empty_list(self):
        results, store = self._ingest(content="")
        assert results == []
        store.upsert_doc_section.assert_not_called()


class TestParseHelpers:
    def test_slugify(self):
        from telaios.core.knowledge.markdown_ingester import _slugify
        assert _slugify("Authentication Requirements") == "authentication-requirements"
        assert _slugify("  Foo Bar  ") == "foo-bar"
        assert _slugify("A" * 200)[:100] == "a" * 100
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && python -m pytest tests/unit/core/test_markdown_ingester.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Create `src/telaios/core/knowledge/markdown_ingester.py`**

```python
"""MarkdownDocIngester — parses Markdown into Doc_Section graph nodes."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
_ANNOTATION_RE = re.compile(r"@([A-Za-z][A-Za-z0-9_\-]*)")
_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")


def _slugify(text: str, max_len: int = 100) -> str:
    return _SLUG_STRIP_RE.sub("-", text.lower()).strip("-")[:max_len]


@dataclass
class DocSectionResult:
    section_id: str
    heading: str
    kind: str
    start_line: int
    annotation_targets: list[str] = field(default_factory=list)


class MarkdownDocIngester:
    """Parses a Markdown file into Doc_Section graph nodes.

    Each ATX heading (`#`, `##`, …) becomes one Doc_Section node.
    Inline `@EntityName` annotations create REFERENCES edges to matching
    CodeClass or CodeFunction nodes (silently no-ops if the entity is absent).
    """

    def ingest(
        self,
        content: str,
        source_doc: str,
        project_id: str,
        kind: str,
        graph_store: Any,  # FalkorDBGraphStore
    ) -> list[DocSectionResult]:
        if not content.strip():
            return []

        sections = self._parse_sections(content)
        results: list[DocSectionResult] = []
        seen_ids: dict[str, int] = {}

        for heading, body, start_line in sections:
            base_id = _slugify(heading)
            count = seen_ids.get(base_id, 0)
            section_id = base_id if count == 0 else f"{base_id}-{count}"
            seen_ids[base_id] = count + 1

            # Allow explicit @id override in body
            id_match = re.search(r"@id\s+([A-Za-z][A-Za-z0-9_\-]*)", body)
            if id_match:
                section_id = id_match.group(1)

            try:
                graph_store.upsert_doc_section(
                    section_id=section_id,
                    heading=heading,
                    content_summary=body.strip()[:500],
                    kind=kind,
                    source_doc=source_doc,
                    start_line=start_line,
                    project_id=project_id,
                )
            except Exception:
                logger.warning("upsert_doc_section failed for %r in %r", section_id, source_doc, exc_info=True)
                continue

            annotation_targets: list[str] = []
            for m in _ANNOTATION_RE.finditer(body):
                name = m.group(1)
                if name == "id":
                    continue
                for label in ("CodeClass", "CodeFunction"):
                    graph_store.add_references_edge(
                        section_id=section_id,
                        target_label=label,
                        target_name=name,
                        via="annotation",
                        project_id=project_id,
                    )
                annotation_targets.append(name)

            results.append(DocSectionResult(
                section_id=section_id,
                heading=heading,
                kind=kind,
                start_line=start_line,
                annotation_targets=annotation_targets,
            ))

        return results

    def _parse_sections(self, content: str) -> list[tuple[str, str, int]]:
        """Return (heading, body, start_line_1indexed) tuples."""
        lines = content.splitlines(keepends=True)
        sections: list[tuple[str, str, int]] = []
        current_heading: str | None = None
        current_body: list[str] = []
        current_start = 1

        for i, line in enumerate(lines, start=1):
            m = _HEADING_RE.match(line.rstrip("\n\r"))
            if m:
                if current_heading is not None:
                    sections.append((current_heading, "".join(current_body), current_start))
                current_heading = m.group(2).strip()
                current_body = []
                current_start = i
            elif current_heading is not None:
                current_body.append(line)

        if current_heading is not None:
            sections.append((current_heading, "".join(current_body), current_start))

        return sections


__all__ = ["MarkdownDocIngester", "DocSectionResult", "_slugify"]
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && python -m pytest tests/unit/core/test_markdown_ingester.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/telaios/core/knowledge/markdown_ingester.py \
        server/tests/unit/core/test_markdown_ingester.py
git commit -m "feat(knowledge): add MarkdownDocIngester for Doc_Section graph nodes"
```

---

## Task 7 — `IngestionService`: skip Qdrant+BM25 for code when `code_graph_only=True`

**Files:**
- Modify: `src/telaios/core/knowledge/ingestion.py`
- Test: `tests/unit/core/test_ingestion_header.py` (add assertions)

- [ ] **Step 1: Write failing test**

Add to `tests/unit/core/test_ingestion_header.py`:

```python
class TestCodeGraphOnlyFlag:
    """When code_graph_only=True, Qdrant upsert and BM25 rebuild are skipped
    for the repositories collection but NOT for the documents collection."""

    def _make_service(self, code_graph_only: bool, collection: str):
        from unittest.mock import AsyncMock, MagicMock
        from telaios.core.knowledge.config import KnowledgePipelineConfig
        from telaios.core.knowledge.ingestion import IngestionService

        config = KnowledgePipelineConfig(
            code_graph_only=code_graph_only,
            repositories_collection="repositories",
            documents_collection="documents",
        )
        vs = MagicMock()
        vs.upsert = AsyncMock(return_value=[])
        vs.scroll_all = AsyncMock(return_value=[])
        bm25 = MagicMock()
        graph = MagicMock()
        graph.index_code_entities = AsyncMock()
        graph.index_chunks = AsyncMock()
        graph.index_document = AsyncMock()
        graph.resolve_inherited_endpoints = AsyncMock()
        graph.rebuild_communities = AsyncMock()
        svc = IngestionService(
            vector_store=vs, bm25_store=bm25, graph_augmentor=graph, config=config
        )
        return svc, vs, bm25

    async def test_repositories_skips_qdrant_when_code_graph_only(self):
        from telaios.core.knowledge_source import KnowledgeSource, SourceDocument
        from telaios.core.chunkers.base import Chunker, ChunkMetadata

        class _Src(KnowledgeSource):
            def __init__(self): super().__init__("t")
            async def extract(self): return [SourceDocument(content="x", title="t", source_type="code", source_path="a.py")]

        class _Chunker(Chunker):
            def __init__(self): super().__init__(512, 0)
            def chunk(self, t): return [("x", ChunkMetadata(index=0, start_char=0, end_char=1, language="python"))]

        svc, vs, bm25 = self._make_service(code_graph_only=True, collection="repositories")
        await svc.ingest(source=_Src(), collection="repositories", project_id="p", chunker=_Chunker())
        vs.upsert.assert_not_called()
        bm25.rebuild.assert_not_called()

    async def test_documents_still_uses_qdrant_when_code_graph_only(self):
        from telaios.core.knowledge_source import KnowledgeSource, SourceDocument
        from telaios.core.chunkers.semantic import SemanticChunker

        class _Src(KnowledgeSource):
            def __init__(self): super().__init__("t")
            async def extract(self): return [SourceDocument(content="hello world", title="t", source_type="document", source_path="doc.md")]

        svc, vs, bm25 = self._make_service(code_graph_only=True, collection="documents")
        await svc.ingest(source=_Src(), collection="documents", project_id="p", chunker=SemanticChunker())
        vs.upsert.assert_called_once()
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && python -m pytest tests/unit/core/test_ingestion_header.py::TestCodeGraphOnlyFlag -v
```

Expected: `AssertionError` (upsert still called)

- [ ] **Step 3: Add skip logic to `IngestionService.ingest`**

In `src/telaios/core/knowledge/ingestion.py`, find the line:

```python
        _emit(f"Chunked → {len(texts)} chunk(s) — embedding + upserting to Qdrant…")
        await self._vs.upsert(
```

Replace from there through the BM25 rebuild block with:

```python
        _is_code_collection = (collection == self._config.repositories_collection)
        _skip_vector = _is_code_collection and self._config.code_graph_only

        if not _skip_vector:
            _emit(f"Chunked → {len(texts)} chunk(s) — embedding + upserting to Qdrant…")
            await self._vs.upsert(
                collection=collection, texts=texts, payloads=payloads, ids=point_ids
            )
            logger.info(
                "Ingested %d docs / %d chunks into %r for project %r",
                len(docs), len(texts), collection, project_id,
            )
            _emit("Rebuilding BM25 index…")
            await self._rebuild_bm25(collection, project_id)
        else:
            logger.info(
                "code_graph_only=True: skipped Qdrant+BM25 for %r (%d docs / %d chunks)",
                collection, len(docs), len(texts),
            )
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && python -m pytest tests/unit/core/test_ingestion_header.py::TestCodeGraphOnlyFlag -v
```

Expected: `2 passed`

- [ ] **Step 5: Run full ingestion test suite — no regressions**

```bash
cd server && python -m pytest tests/unit/core/test_ingestion_header.py -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/telaios/core/knowledge/ingestion.py \
        server/tests/unit/core/test_ingestion_header.py
git commit -m "feat(knowledge/ingestion): skip Qdrant+BM25 for repositories when code_graph_only=True"
```

---

## Task 8 — `RetrievalTools`: `graph_navigate`, upgraded `read_source`, `doc_to_code`

**Files:**
- Modify: `src/telaios/core/agents/retrieval/tools.py`
- Create: `tests/unit/core/agents/retrieval/test_tools_graph.py`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/core/agents/retrieval/test_tools_graph.py`:

```python
"""Tests for the graph-native retrieval tools: graph_navigate, read_source (FileReader-backed), doc_to_code."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from telaios.core.agents.retrieval.state import SearchStep
from telaios.core.knowledge.config import KnowledgePipelineConfig
from telaios.core.types import Chunk


def _make_tools(graph_rows=None, file_content="", doc_refs=None):
    from telaios.core.agents.retrieval.tools import RetrievalTools
    from telaios.core.knowledge.file_reader import LocalFileReader

    config = KnowledgePipelineConfig()

    # Graph store mock
    graph_store = MagicMock()
    graph_store.query.return_value = graph_rows or []

    # Graph augmentor wrapping the store
    graph_augmentor = MagicMock()
    graph_augmentor._graph = graph_store
    graph_augmentor._llm = None
    graph_augmentor.query_structural = AsyncMock(return_value=[])

    # FileReader mock
    file_reader = MagicMock()
    file_reader.read = AsyncMock(return_value=file_content)

    vector_store = MagicMock()
    vector_store.search = AsyncMock(return_value=[])
    vector_store.embed_query = AsyncMock(return_value=[0.0] * 1024)

    bm25_store = MagicMock()
    bm25_store.search = MagicMock(return_value=[])

    return RetrievalTools(
        vector_store=vector_store,
        bm25_store=bm25_store,
        graph_augmentor=graph_augmentor,
        hyde=None,
        config=config,
        project_id="proj-1",
        source="all",
        top_k=5,
        file_reader=file_reader,
    )


class TestGraphNavigate:
    async def test_returns_chunks_with_file_path_metadata(self):
        rows = [{"name": "UserService", "file_path": "src/UserService.java",
                 "start_line": 10, "end_line": 50, "type": "CodeClass"}]
        tools = _make_tools(graph_rows=rows)
        step = SearchStep(sub_query="UserService", tool="graph_navigate", reason="test")
        chunks, scores = await tools.execute(step)
        assert len(chunks) == 1
        assert chunks[0].metadata["file_path"] == "src/UserService.java"
        assert chunks[0].metadata["start_line"] == 10

    async def test_empty_graph_returns_empty(self):
        tools = _make_tools(graph_rows=[])
        step = SearchStep(sub_query="Unknown", tool="graph_navigate", reason="test")
        chunks, scores = await tools.execute(step)
        assert chunks == []
        assert scores == []


class TestReadSourceFileReader:
    async def test_read_source_uses_file_reader(self):
        tools = _make_tools(file_content="def foo(): pass\n")
        step = SearchStep(sub_query="src/foo.py", tool="read_source", reason="test")
        chunks, scores = await tools.execute(step)
        tools.file_reader.read.assert_called_once()
        assert len(chunks) == 1
        assert "def foo" in chunks[0].content

    async def test_read_source_parses_line_range(self):
        tools = _make_tools(file_content="relevant code\n")
        # "path:10:50" format encodes line range
        step = SearchStep(sub_query="src/Foo.java:10:50", tool="read_source", reason="test")
        await tools.execute(step)
        _, kwargs = tools.file_reader.read.call_args
        assert kwargs.get("start_line") == 10
        assert kwargs.get("end_line") == 50

    async def test_read_source_empty_content_returns_empty(self):
        tools = _make_tools(file_content="")
        step = SearchStep(sub_query="missing.py", tool="read_source", reason="test")
        chunks, scores = await tools.execute(step)
        assert chunks == []


class TestDocToCode:
    async def test_fast_path_returns_references(self):
        tools = _make_tools()
        # First query: find the Doc_Section; second: find REFERENCES
        tools.graph_augmentor._graph.query.side_effect = [
            [{"id": "auth-req", "heading": "Auth", "summary": "JWT auth required"}],
            [{"name": "AuthService", "file_path": "src/AuthService.java",
              "start_line": 1, "end_line": 30, "entity_type": "CodeClass", "via": "annotation"}],
        ]
        step = SearchStep(sub_query="auth-req", tool="doc_to_code", reason="test")
        chunks, scores = await tools.execute(step)
        assert len(chunks) == 1
        assert "AuthService" in chunks[0].content

    async def test_returns_empty_when_section_not_found(self):
        tools = _make_tools(graph_rows=[])
        step = SearchStep(sub_query="nonexistent", tool="doc_to_code", reason="test")
        chunks, scores = await tools.execute(step)
        assert chunks == []


class TestVectorSearchDocumentsOnly:
    async def test_vector_search_only_queries_documents_collection(self):
        tools = _make_tools()
        step = SearchStep(sub_query="how does auth work", tool="vector_search", reason="test")
        await tools.execute(step)
        # Only the documents collection should be queried — not repositories
        search_calls = tools.vector_store.search.call_args_list
        collections_queried = [c[1].get("collection") or c[0][0] for c in search_calls]
        assert all(c == "documents" for c in collections_queried), \
            f"vector_search hit non-documents collection: {collections_queried}"
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && python -m pytest tests/unit/core/agents/retrieval/test_tools_graph.py -v
```

Expected: `TypeError` — `RetrievalTools` doesn't have `file_reader` field yet; test tool names not dispatched.

- [ ] **Step 3: Add `file_reader` field and new tool methods to `RetrievalTools`**

Replace the entire `src/telaios/core/agents/retrieval/tools.py` with:

```python
"""Retrieval tool wrappers for the RetrievalAgent dispatcher."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from telaios.core.knowledge.query_router import QueryIntent, classify_query
from telaios.core.agents.retrieval.state import SearchStep
from telaios.core.types import Chunk, RetrievalQuery

logger = logging.getLogger(__name__)


def _resolve_collections(source: str, config: Any) -> list[str]:
    if source == "documents":
        return [config.documents_collection]
    if source == "repositories":
        return [config.repositories_collection]
    return [config.documents_collection, config.repositories_collection]


def _parse_source_query(sub_query: str) -> tuple[str, int | None, int | None]:
    """Parse 'path/to/file.java:10:50' → (path, 10, 50).

    Returns (sub_query, None, None) when no line range is encoded.
    """
    m = re.match(r"^(.+):(\d+):(\d+)$", sub_query)
    if m:
        return m.group(1), int(m.group(2)), int(m.group(3))
    return sub_query, None, None


@dataclass
class RetrievalTools:
    vector_store: Any
    bm25_store: Any
    graph_augmentor: Any
    hyde: Any | None
    config: Any           # KnowledgePipelineConfig
    project_id: str
    source: str
    top_k: int
    file_reader: Any | None = field(default=None)   # FileReader | None

    async def execute(self, step: SearchStep) -> tuple[list[Chunk], list[float]]:
        match step.tool:
            case "vector_search":
                return await self._vector_search(step.sub_query)
            case "graph_structural":
                return await self._graph_structural(step.sub_query)
            case "graph_navigate":
                return await self._graph_navigate(step.sub_query)
            case "bm25":
                return await self._bm25(step.sub_query)
            case "generated_docs":
                return await self._generated_docs(step.sub_query)
            case "read_source":
                return await self._read_source(step.sub_query)
            case "doc_to_code":
                return await self._doc_to_code(step.sub_query)
            case _:
                logger.warning("Unknown tool %r — falling back to vector_search", step.tool)
                return await self._vector_search(step.sub_query)

    # ── Documents: semantic search (Qdrant + BM25) ────────────────────────────

    async def _vector_search(self, query: str) -> tuple[list[Chunk], list[float]]:
        from telaios.core.knowledge.retrieval import HybridRetriever

        # Code is now navigated via graph_navigate + read_source.
        # vector_search is scoped to the documents collection only.
        collections = [self.config.documents_collection]
        all_chunks: list[Chunk] = []
        all_scores: list[float] = []

        for collection in collections:
            retriever = HybridRetriever(
                vector_store=self.vector_store,
                bm25_store=self.bm25_store,
                collection=collection,
                project_id=self.project_id,
                hyde=self.hyde if self.config.hyde_enabled else None,
                top_k=self.top_k,
                rrf_k=self.config.rrf_k,
                reranker=None,
                rerank_candidates=self.config.rerank_candidates,
            )
            result = await retriever.aretrieve(
                RetrievalQuery(text=query, top_k=self.top_k)
            )
            for chunk in result.chunks:
                chunk.metadata["_collection"] = collection
            all_chunks.extend(result.chunks)
            all_scores.extend(result.scores)

        return all_chunks, all_scores

    async def _graph_structural(self, query: str) -> tuple[list[Chunk], list[float]]:
        intent, params = classify_query(query)
        if intent == QueryIntent.SEMANTIC:
            intent_str = "dependency"
            params = {}
        else:
            intent_str = intent.value
        try:
            chunks = await self.graph_augmentor.query_structural(intent_str, params, self.project_id)
        except Exception:
            logger.warning("graph_structural tool failed for query %r", query, exc_info=True)
            chunks = []
        scores = [1.0] * len(chunks)
        return chunks, scores

    async def _bm25(self, query: str) -> tuple[list[Chunk], list[float]]:
        # BM25 scoped to documents collection only (code BM25 removed with code_graph_only)
        collections = [self.config.documents_collection]
        all_chunks: list[Chunk] = []

        for collection in collections:
            results = self.bm25_store.search(
                collection=collection,
                query=query,
                project_id=self.project_id,
                top_k=self.top_k,
            )
            for doc in results:
                all_chunks.append(Chunk(
                    id=doc.get("id", ""),
                    document_id=doc.get("metadata", {}).get("document_id", ""),
                    content=doc.get("content", ""),
                    metadata=doc.get("metadata", {}),
                ))

        scores = [1.0] * len(all_chunks)
        return all_chunks, scores

    async def _generated_docs(self, query: str) -> tuple[list[Chunk], list[float]]:
        from telaios.core.knowledge.retrieval import HybridRetriever

        retriever = HybridRetriever(
            vector_store=self.vector_store,
            bm25_store=self.bm25_store,
            collection=self.config.documents_collection,
            project_id=self.project_id,
            hyde=self.hyde if self.config.hyde_enabled else None,
            top_k=self.top_k * 3,
            rrf_k=self.config.rrf_k,
            reranker=None,
            rerank_candidates=self.config.rerank_candidates,
        )
        result = await retriever.aretrieve(
            RetrievalQuery(text=query, top_k=self.top_k * 3)
        )
        filtered = [
            (c, s) for c, s in zip(result.chunks, result.scores)
            if c.metadata.get("source_type") == "generated_doc"
        ]
        if not filtered:
            filtered = list(zip(result.chunks[:self.top_k], result.scores[:self.top_k]))
        chunks = [c for c, _ in filtered[:self.top_k]]
        scores = [s for _, s in filtered[:self.top_k]]
        return chunks, scores

    # ── Code: graph navigation + file read ───────────────────────────────────

    async def _graph_navigate(self, query: str) -> tuple[list[Chunk], list[float]]:
        """Search FalkorDB for code entities matching a symbol name or file path."""
        graph = self.graph_augmentor._graph
        pid = self.project_id

        try:
            # Search CodeClass and CodeFunction by name (case-sensitive CONTAINS)
            class_rows = graph.query(
                "MATCH (c:CodeClass {project_id: $pid}) WHERE c.name CONTAINS $q "
                "RETURN c.name AS name, c.file_path AS file_path, "
                "c.start_line AS start_line, c.end_line AS end_line, 'CodeClass' AS type "
                "LIMIT 5",
                {"pid": pid, "q": query},
            )
            fn_rows = graph.query(
                "MATCH (fn:CodeFunction {project_id: $pid}) WHERE fn.name CONTAINS $q "
                "RETURN fn.name AS name, fn.file_path AS file_path, "
                "fn.start_line AS start_line, fn.end_line AS end_line, 'CodeFunction' AS type "
                "LIMIT 5",
                {"pid": pid, "q": query},
            )
            rows = (class_rows or []) + (fn_rows or [])
        except Exception:
            logger.warning("graph_navigate failed for query %r", query, exc_info=True)
            rows = []

        chunks: list[Chunk] = []
        for row in rows[:self.top_k]:
            name = row.get("name", "")
            fp = row.get("file_path", "")
            sl = row.get("start_line")
            el = row.get("end_line")
            etype = row.get("type", "CodeEntity")
            content = f"{etype}: {name}\nfile: {fp}"
            if sl is not None:
                content += f"\nlines: {sl}-{el}"
            chunks.append(Chunk(
                id=f"graph-nav-{abs(hash(name + fp)) % 100000}",
                document_id="knowledge-graph",
                content=content,
                metadata={
                    "source": "graph_navigate",
                    "file_path": fp,
                    "start_line": sl,
                    "end_line": el,
                    "entity_type": etype,
                    "entity_name": name,
                },
            ))

        return chunks, [1.0] * len(chunks)

    async def _read_source(self, sub_query: str) -> tuple[list[Chunk], list[float]]:
        """Fetch a source file slice using FileReader (S3 or local disk).

        sub_query formats accepted:
          "path/to/File.java"          — full file
          "path/to/File.java:10:50"    — specific line range
          "SymbolName"                 — resolved to file_path via graph_navigate
        """
        file_path, start_line, end_line = _parse_source_query(sub_query)

        # Resolve symbol name → file path via graph when no path separator present
        if "/" not in file_path and self.graph_augmentor:
            nav_chunks, _ = await self._graph_navigate(file_path)
            if nav_chunks:
                meta = nav_chunks[0].metadata
                file_path = meta.get("file_path", file_path)
                if start_line is None:
                    start_line = meta.get("start_line")
                    end_line = meta.get("end_line")

        if self.file_reader is not None:
            try:
                content = await self.file_reader.read(
                    file_path,
                    start_line=start_line,
                    end_line=end_line,
                )
            except Exception:
                logger.warning("read_source: FileReader failed for %r", file_path, exc_info=True)
                content = ""
        else:
            # Fallback: Qdrant-backed fetch (Stage 1 compatibility)
            return await self._read_source_qdrant(sub_query)

        if not content:
            return [], []

        return [Chunk(
            id=f"read-source-{abs(hash(file_path)) % 100000}",
            document_id=file_path,
            content=content,
            metadata={
                "source": "read_source",
                "source_path": file_path,
                "start_line": start_line,
                "end_line": end_line,
            },
        )], [1.0]

    async def _read_source_qdrant(self, sub_query: str) -> tuple[list[Chunk], list[float]]:
        """Stage-1 fallback: fetch chunks by source_path from Qdrant."""
        source_path = sub_query
        if "/" not in sub_query:
            collections = _resolve_collections(self.source, self.config)
            for collection in collections:
                results = self.bm25_store.search(
                    collection=collection,
                    query=sub_query,
                    project_id=self.project_id,
                    top_k=1,
                )
                if results:
                    sp = results[0].get("metadata", {}).get("source_path", "")
                    if sp:
                        source_path = sp
                        break

        collections = _resolve_collections(self.source, self.config)
        all_chunks: list[Chunk] = []
        seen_ids: set[str] = set()
        for collection in collections:
            try:
                chunks = await self.vector_store.fetch_by_source_path(
                    collection=collection,
                    project_id=self.project_id,
                    source_path=source_path,
                )
            except Exception:
                logger.warning("read_source_qdrant: fetch failed for %r", source_path, exc_info=True)
                chunks = []
            for c in chunks:
                if c.id not in seen_ids:
                    seen_ids.add(c.id)
                    all_chunks.append(c)
        all_chunks.sort(key=lambda c: c.metadata.get("start_line") or 0)
        return all_chunks, [1.0] * len(all_chunks)

    async def _doc_to_code(self, sub_query: str) -> tuple[list[Chunk], list[float]]:
        """Find code that satisfies a Doc_Section by ID or heading.

        Fast path: return targets from existing REFERENCES edges.
        Slow path: use LLM-generated candidate names to search FalkorDB.
        """
        graph = self.graph_augmentor._graph
        pid = self.project_id

        # Find the Doc_Section node
        try:
            section_rows = graph.query(
                "MATCH (d:Doc_Section {project_id: $pid}) "
                "WHERE d.id = $q OR d.heading CONTAINS $q "
                "RETURN d.id AS id, d.heading AS heading, d.content_summary AS summary "
                "LIMIT 1",
                {"pid": pid, "q": sub_query},
            )
        except Exception:
            logger.warning("doc_to_code: section lookup failed for %r", sub_query, exc_info=True)
            return [], []

        if not section_rows:
            return [], []

        section = section_rows[0]
        section_id = section["id"]

        # Fast path: existing REFERENCES edges
        try:
            ref_rows = graph.query(
                "MATCH (d:Doc_Section {id: $id, project_id: $pid})-[r:REFERENCES]->(t) "
                "RETURN t.name AS name, t.file_path AS file_path, "
                "t.start_line AS start_line, t.end_line AS end_line, "
                "labels(t)[0] AS entity_type, r.via AS via",
                {"id": section_id, "pid": pid},
            )
        except Exception:
            ref_rows = []

        if ref_rows:
            chunks = []
            for row in ref_rows:
                content = (
                    f"Doc '{section['heading']}' references:\n"
                    f"{row.get('entity_type', 'Entity')}: {row.get('name', '')}\n"
                    f"file: {row.get('file_path', '')}\n"
                    f"lines: {row.get('start_line')}-{row.get('end_line')}\n"
                    f"link via: {row.get('via', '')}"
                )
                chunks.append(Chunk(
                    id=f"d2c-{abs(hash(section_id + str(row.get('name', '')))) % 100000}",
                    document_id="knowledge-graph",
                    content=content,
                    metadata={
                        "source": "doc_to_code",
                        "file_path": row.get("file_path"),
                        "start_line": row.get("start_line"),
                        "end_line": row.get("end_line"),
                        "entity_type": row.get("entity_type"),
                        "entity_name": row.get("name"),
                        "via": row.get("via"),
                    },
                ))
            return chunks, [1.0] * len(chunks)

        # Slow path: LLM candidate generation + graph name search
        summary = (section.get("summary") or "") or section.get("heading", "")
        candidate_names: list[str] = []

        llm = getattr(self.graph_augmentor, "_llm", None)
        if llm:
            from langchain_core.messages import HumanMessage, SystemMessage
            try:
                response = await llm.ainvoke([
                    SystemMessage(content=(
                        "You are a code search assistant. Given a documentation section summary, "
                        "list up to 5 likely class or function names (one per line) that would "
                        "implement it. Output only names, no explanation."
                    )),
                    HumanMessage(content=f"Summary: {summary}"),
                ])
                candidate_names = [
                    ln.strip() for ln in response.content.splitlines()
                    if ln.strip() and len(ln.strip()) >= 3
                ][:5]
            except Exception:
                logger.debug("doc_to_code: LLM candidate generation failed", exc_info=True)

        if not candidate_names:
            # Regex fallback: extract PascalCase tokens
            candidate_names = re.findall(r'\b[A-Z][a-zA-Z]{2,}\b', summary)[:5]

        chunks = []
        for candidate in candidate_names:
            nav_chunks, _ = await self._graph_navigate(candidate)
            for c in nav_chunks[:2]:
                chunk = Chunk(
                    id=f"d2c-slow-{abs(hash(section_id + c.metadata.get('entity_name', ''))) % 100000}",
                    document_id="knowledge-graph",
                    content=(
                        f"Candidate for doc section '{section['heading']}':\n{c.content}\n"
                        f"confidence: semantic"
                    ),
                    metadata={**c.metadata, "source": "doc_to_code", "via": "semantic"},
                )
                chunks.append(chunk)

        return chunks[:self.top_k], [0.5] * min(len(chunks), self.top_k)


__all__ = ["RetrievalTools"]
```

- [ ] **Step 4: Run new tests — expect PASS**

```bash
cd server && python -m pytest tests/unit/core/agents/retrieval/test_tools_graph.py -v
```

Expected: all pass.

- [ ] **Step 5: Run existing tools tests — no regressions**

```bash
cd server && python -m pytest tests/unit/core/agents/retrieval/test_tools.py -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/telaios/core/agents/retrieval/tools.py \
        server/tests/unit/core/agents/retrieval/test_tools_graph.py
git commit -m "feat(agents/retrieval): add graph_navigate, doc_to_code tools; upgrade read_source to FileReader-backed"
```

---

## Task 9 — Update planner prompt, wire `FileReader` + `MarkdownDocIngester` in pipeline

**Files:**
- Modify: `src/telaios/core/agents/retrieval/nodes.py`
- Modify: `src/telaios/core/knowledge/pipeline.py`
- Modify: `src/telaios/core/knowledge/factory.py`

- [ ] **Step 1: Update `_ANALYST_SYSTEM` in `nodes.py`**

Replace the `_ANALYST_SYSTEM` string with:

```python
_ANALYST_SYSTEM = """\
You are a retrieval planning assistant. Given a user's question, produce a search plan: \
a list of sub-queries to retrieve relevant information, each paired with the best retrieval tool.

Available tools:
- "graph_navigate": Use for code symbol lookups — find a class, function, or file by name. \
Returns file coordinates (path, start_line, end_line). Always follow with "read_source".
- "read_source": Fetch the actual source code at a file path (and optional line range). \
Use after graph_navigate, or directly when you know the file path. \
Accepts "path/to/File.java" or "path/to/File.java:10:50" format.
- "doc_to_code": Find code that implements a documentation section. \
Pass the Doc_Section ID or heading as the sub_query.
- "graph_structural": Use for structural code questions — dependency queries \
("which classes use X"), inheritance ("what extends Y"), endpoint listing/counting.
- "generated_docs": Use for high-level architecture, "how does X work overall", \
project structure, design intent.
- "bm25": Use for exact identifier lookups in documentation.
- "vector_search": Default for semantic questions about documentation content.

Rules:
- Produce 1-4 steps. No more.
- For code questions: prefer graph_navigate → read_source over vector_search.
- A simple, direct question needs only one step.
- Do not repeat the same sub_query with different tools.
"""
```

- [ ] **Step 2: Update `_query_to_step` heuristic in `nodes.py`**

Replace `_query_to_step`:

```python
def _query_to_step(query: str) -> SearchStep:
    """Assign a tool to a follow-up query using keyword heuristics (no LLM call)."""
    if query.startswith("read_source:"):
        path = query[len("read_source:"):].strip()
        return SearchStep(sub_query=path, tool="read_source", reason="evaluator follow-up")
    if query.startswith("doc_to_code:"):
        section = query[len("doc_to_code:"):].strip()
        return SearchStep(sub_query=section, tool="doc_to_code", reason="evaluator follow-up")
    lower = query.lower()
    words = set(re.findall(r'\w+', lower))
    if words & _STRUCTURAL_KEYWORDS:
        tool = "graph_structural"
    elif _EXACT_PATTERN.search(query):
        tool = "graph_navigate"
    else:
        tool = "vector_search"
    return SearchStep(sub_query=query, tool=tool, reason="evaluator follow-up")
```

- [ ] **Step 3: Run existing nodes tests — no regressions**

```bash
cd server && python -m pytest tests/unit/core/agents/retrieval/ -v
```

Expected: all pass.

- [ ] **Step 4: Wire `MarkdownDocIngester` in `KnowledgeBasePipeline.ingest_documents`**

In `src/telaios/core/knowledge/pipeline.py`, update `ingest_documents` to also run the markdown ingester for `.md` files. Add after the existing `from telaios.core.chunkers.semantic import SemanticChunker` import block:

```python
    async def ingest_documents(
        self,
        project_id: str,
        source: Any,
        on_progress: ProgressFn | None = None,
        doc_kind: str = "guide",
    ) -> IngestResult:
        """Ingest documents (PDF, DOCX, MD, etc.) using SemanticChunker.

        For Markdown files, also parses Doc_Section nodes into FalkorDB.
        doc_kind is passed through as the Doc_Section.kind for all .md files
        in this source.
        """
        from telaios.core.chunkers.semantic import SemanticChunker
        chunker = SemanticChunker(
            chunk_size=self._config.document_chunk_size,
            overlap=self._config.document_chunk_overlap,
        )
        result = await self._ingestion.ingest(
            source=source,
            collection=self._config.documents_collection,
            project_id=project_id,
            chunker=chunker,
            on_progress=on_progress,
        )

        # Parse markdown files into Doc_Section graph nodes
        if self._graph is not None and hasattr(self._graph, '_graph'):
            graph_store = self._graph._graph
            if hasattr(graph_store, 'upsert_doc_section'):
                from telaios.core.knowledge.markdown_ingester import MarkdownDocIngester
                ingester = MarkdownDocIngester()
                docs = await source.extract()
                for doc in docs:
                    if doc.source_path and doc.source_path.endswith(".md"):
                        try:
                            ingester.ingest(
                                content=doc.content,
                                source_doc=doc.source_path,
                                project_id=project_id,
                                kind=doc_kind,
                                graph_store=graph_store,
                            )
                        except Exception:
                            logger.warning(
                                "Markdown graph ingestion failed for %r", doc.source_path, exc_info=True
                            )

        return result
```

- [ ] **Step 5: Wire `FileReader` through pipeline and factory**

In `src/telaios/core/knowledge/pipeline.py`, add `file_reader: Any | None = None` to `__init__`:

```python
    def __init__(
        self,
        vector_store: QdrantVectorStore,
        bm25_store: BM25Store,
        graph_augmentor: GraphAugmentor,
        hyde: HyDE,
        llm: Any,
        ingestion: IngestionService,
        config: KnowledgePipelineConfig,
        docgen: RepoDocGenerator | None = None,
        reranker: Any | None = None,
        file_reader: Any | None = None,
    ) -> None:
        self._vs = vector_store
        self._bm25 = bm25_store
        self._graph = graph_augmentor
        self._hyde = hyde
        self._llm = llm
        self._ingestion = ingestion
        self._config = config
        self._docgen = docgen
        self._reranker = reranker
        self._file_reader = file_reader
```

In `_make_retrieval_agent`, pass `file_reader` to `RetrievalTools`:

```python
    def _make_retrieval_agent(self, project_id: str, source: str, top_k: int):
        from telaios.core.agents.retrieval.agent import RetrievalAgent
        from telaios.core.agents.retrieval.tools import RetrievalTools
        tools = RetrievalTools(
            vector_store=self._vs,
            bm25_store=self._bm25,
            graph_augmentor=self._graph,
            hyde=self._hyde if self._config.hyde_enabled else None,
            config=self._config,
            project_id=project_id,
            source=source,
            top_k=top_k,
            file_reader=self._file_reader,
        )
        return RetrievalAgent(
            llm=self._llm,
            tools=tools,
            config=self._config,
            project_id=project_id,
            source=source,
            top_k=top_k,
        )
```

- [ ] **Step 6: Add `FileReader` construction to `KnowledgePipelineFactory._build`**

In `src/telaios/core/knowledge/factory.py`, add to `KnowledgePipelineConfig` (after the existing `docgen_enabled` field in config.py was already added in Task 1):

First, add to `KnowledgePipelineConfig` in `config.py` (after `code_graph_only`):

```python
    # File reader type for read_source tool: "local" or "s3"
    file_reader_type: str = "local"
    # S3 settings (used when file_reader_type == "s3")
    s3_bucket: str = ""
    s3_key_prefix: str = ""
```

Then, in `KnowledgePipelineFactory._build` (in `factory.py`), add before the `return KnowledgeBasePipeline(...)` call:

```python
        # FileReader — local disk or S3 depending on config
        from telaios.core.knowledge.file_reader import FileReaderFactory
        if config.file_reader_type == "s3" and config.s3_bucket:
            import boto3
            s3_client = boto3.client("s3")
            file_reader = FileReaderFactory.s3(
                s3_client=s3_client,
                bucket=config.s3_bucket,
                key_prefix=config.s3_key_prefix,
            )
        else:
            file_reader = FileReaderFactory.local()
```

And update the `return` call to include `file_reader`:

```python
        return KnowledgeBasePipeline(
            vector_store=vector_store,
            bm25_store=bm25_store,
            graph_augmentor=graph_augmentor,
            hyde=hyde,
            llm=llm,
            ingestion=ingestion,
            config=config,
            docgen=docgen,
            reranker=reranker,
            file_reader=file_reader,
        )
```

- [ ] **Step 7: Run full test suite**

```bash
cd server && python -m pytest tests/unit/ -v --tb=short 2>&1 | tail -30
```

Expected: all previously-passing tests still pass; new tests from Tasks 1–8 pass.

- [ ] **Step 8: Commit**

```bash
git add server/src/telaios/core/agents/retrieval/nodes.py \
        server/src/telaios/core/knowledge/pipeline.py \
        server/src/telaios/core/knowledge/factory.py \
        server/src/telaios/core/knowledge/config.py
git commit -m "feat(knowledge): wire FileReader + MarkdownDocIngester into pipeline; update planner for graph-native tools"
```

---

## Self-Review Checklist (completed)

**Spec coverage:**
- [x] `code_graph_only` flag → Task 1
- [x] `start_line`/`end_line` on `ClassInfo`/`MethodInfo` → Task 2
- [x] `CodeFile` + `CodeFunction` nodes + `CONTAINS`/`HAS_METHOD` edges → Task 3
- [x] `Doc_Section` graph methods → Task 4
- [x] `FileReader` (local + S3) → Task 5
- [x] `MarkdownDocIngester` + `@annotation` → `REFERENCES` edges → Task 6
- [x] Skip Qdrant+BM25 for code → Task 7
- [x] `graph_navigate`, `read_source` (FileReader-backed), `doc_to_code` → Task 8
- [x] Planner prompt + pipeline wiring → Task 9
- [x] Cypher verification queries → documented in spec; executable via `graph_store.query_unlinked_sections()` and `graph_store.query_sections_for_changed_files()`

**Type consistency verified:** `DocSectionResult`, `FileReader`, `RetrievalTools.file_reader`, `graph_navigate`/`doc_to_code` dispatch all use consistent names across tasks.
