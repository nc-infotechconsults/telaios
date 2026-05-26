# Graph Master — Code Graph Retrieval Redesign

**Date:** 2026-05-26  
**Status:** Approved  
**Scope:** `server/src/telaios/core/`

---

## Problem

The hybrid dense+sparse vector pipeline (Qdrant + in-memory BM25) for code repositories introduces:

- **Synchronisation lag** — BM25 must be rebuilt from Qdrant after every ingest; Qdrant must be seeded before BM25.
- **Dual indexing** — every code file is stored twice: FalkorDB (structural) + Qdrant (semantic). FalkorDB already holds exact file paths and line numbers; Qdrant adds approximate retrieval on top.
- **Unnecessary cost** — dense embeddings for code syntax that FalkorDB can navigate structurally.

Documents (PDFs, DOCX, general Markdown) remain on Qdrant+BM25 because semantic similarity is the right retrieval model for unstructured prose.

---

## Goal

- FalkorDB becomes the **single structural index for code**. It stores exact coordinates (file_path, start_line, end_line) for every code entity.
- The agent navigates to code via Cypher graph queries, then reads the actual file content directly (S3 or local disk).
- Markdown documentation is parsed into generic `Doc_Section` graph nodes, linked to code entities via `REFERENCES` edges.
- Documents stay on Qdrant+BM25, unchanged.

---

## Architecture

### What changes, what stays

| Layer | Before | After |
|---|---|---|
| Code ingestion | Tree-sitter → Qdrant + BM25 + FalkorDB | Tree-sitter → FalkorDB only |
| Doc ingestion | Semantic chunker → Qdrant + BM25 | Unchanged + new markdown→graph path |
| Code retrieval | HybridRetriever (dense+sparse+RRF) | Graph query → FileReader (S3 / local disk) |
| Doc retrieval | HybridRetriever | Unchanged |
| Doc→code traceability | None | `Doc_Section` nodes + `REFERENCES` edges |

---

## FalkorDB Schema

### New and enriched node types

```
CodeFile
  file_path       : str   (absolute or repo-relative)
  language        : str
  project_id      : str
  git_sha         : str   (HEAD at ingest time)

CodeClass  [enriched — adds line coordinates]
  name            : str
  package         : str
  file_path       : str
  qualified_name  : str
  is_abstract     : bool
  is_interface    : bool
  is_enum         : bool
  component_type  : str
  request_mapping_prefix : str
  start_line      : int   [NEW]
  end_line        : int   [NEW]
  project_id      : str

CodeFunction  [new]
  name            : str
  class_name      : str   (empty string for module-level functions)
  file_path       : str
  start_line      : int
  end_line        : int
  return_type     : str
  visibility      : str   ("public" | "private" | "package")
  is_static       : bool
  project_id      : str

Doc_Section  [new — generic, covers all doc types]
  id              : str   (kebab-case(heading), max 100 chars, numeric suffix if
                           duplicate within same source_doc; overridden by explicit
                           @id annotation in the section body)
  heading         : str
  content_summary : str   (first 500 chars of section body)
  kind            : str   (free string: "requirement", "architecture", "api-spec",
                           "guide", "decision", "changelog", etc.)
  source_doc      : str   (file_path of the originating markdown file)
  start_line      : int
  project_id      : str
```

### New relationship types

```
CodeFile     -[:CONTAINS]->    CodeClass
CodeFile     -[:CONTAINS]->    CodeFunction     (module-level functions)
CodeClass    -[:HAS_METHOD]->  CodeFunction
CodeFunction -[:CALLS]->       CodeFunction     (statically inferable only)
Doc_Section  -[:REFERENCES {via: str}]->
                               CodeClass | CodeFunction | CodeFile | RestEndpoint
```

The `REFERENCES.via` property records how the link was established:
- `"annotation"` — explicit `@<doc-section-id>` marker found in code comment/docstring at ingest time
- `"semantic"` — HyDE-matched link discovered at query time by the agent

---

## Components

### 1. `FalkorDBGraphStore` enrichment (`stores/graph/falkordb.py`)

Extend `upsert_code_entities()` to:
- Create a `CodeFile` node for each ingested file (MERGE on `file_path + project_id`).
- Write `start_line` / `end_line` onto every `CodeClass` node.
- Create `CodeFunction` nodes from `MethodInfo` with full location metadata.
- Create `CONTAINS` edges: `CodeFile → CodeClass`, `CodeFile → CodeFunction` (module-level).
- Create `HAS_METHOD` edges: `CodeClass → CodeFunction`.

New methods:
- `upsert_doc_section(section, project_id)` — MERGE a `Doc_Section` node.
- `add_references_edge(section_id, target_type, target_id, via, project_id)` — MERGE a `REFERENCES` edge.
- `query_doc_sections(project_id, kind=None)` — list all `Doc_Section` nodes, optionally filtered by `kind`.
- `query_unlinked_sections(project_id)` — `Doc_Section` nodes with no outgoing `REFERENCES` edge.
- `query_sections_for_changed_files(project_id, changed_files)` — `Doc_Section` nodes whose `REFERENCES` target is in `changed_files`.

### 2. `MarkdownDocIngester` (new — `knowledge/markdown_ingester.py`)

Parses a Markdown file into `Doc_Section` graph nodes.

```python
class MarkdownDocIngester:
    def ingest(
        self,
        content: str,
        source_doc: str,
        project_id: str,
        kind: str,
        graph_store: FalkorDBGraphStore,
    ) -> list[DocSectionResult]: ...
```

Pipeline per section:
1. Split content on ATX headings (`#`, `##`, etc.).
2. For each section: derive `id` (slugify heading), extract `content_summary` (first 500 chars).
3. Scan section body for `@<entity-id>` annotation pattern — create `REFERENCES {via: "annotation"}` edges where the entity ID matches a known `CodeClass.name`, `CodeFunction.name`, or `RestEndpoint` path.
4. MERGE `Doc_Section` node in FalkorDB.
5. Also pass section content through `SemanticChunker` → upsert to Qdrant `documents` collection (keeps doc text searchable).

`kind` is supplied by the caller (`KnowledgeBasePipeline.ingest_documents`) based on file metadata or explicit parameter — not inferred from content.

### 3. `FileReader` abstraction (new — `knowledge/file_reader.py`)

```python
class FileReader(Protocol):
    async def read(
        self,
        file_path: str,
        start_line: int | None = None,
        end_line: int | None = None,
        context_lines: int = 0,
    ) -> str: ...

class LocalFileReader:
    """Reads from local disk. Covers FileSource, local GitSource, cloned GitHubSource."""

class S3FileReader:
    """Reads from S3 bucket. Covers S3-hosted local repository versions."""
    def __init__(self, s3_client, bucket: str, key_prefix: str = ""): ...
```

`FileReaderFactory.for_project(project)` returns the right implementation based on `project.repo_location` (`"local"` | `"s3"`).

Line slicing: both implementations support `start_line`/`end_line` (1-indexed, inclusive). `context_lines` pads the result with N lines above and below for readability.

### 4. `RetrievalTools` — new code tools (`agents/retrieval/tools.py`)

Replace `_vector_search` for the `repositories` collection with:

**`graph_navigate`**  
Runs a Cypher query on FalkorDB to resolve a symbol name, class, file path, or endpoint. Returns a list of `GraphCoordinate(file_path, start_line, end_line, entity_type, entity_name)` objects. Supports fuzzy name matching (`CONTAINS` on name property).

**`read_source`** *(upgraded from current Qdrant-backed version)*  
Accepts either:
- A `GraphCoordinate` from `graph_navigate`, or
- A raw `file_path` (+ optional line range)

Calls `FileReader.read()` and returns the content as a `Chunk`. Falls back to returning the full file if no line range is specified.

**`doc_to_code`**  
Given a `Doc_Section.id` or heading string:
1. Fast path: query `REFERENCES` edges from the node → return targets as `GraphCoordinate` list.
2. Slow path (no edges): fetch `content_summary` from FalkorDB, expand via HyDE, fuzzy-match against `CodeClass.name` + `CodeFunction.name` in FalkorDB, return top candidates with a `confidence` score.

`vector_search` and `bm25` tools remain but are **only dispatched for `documents` collection queries** — the agent's planner is updated to never route code queries there.

### 5. `IngestionService` — remove code→Qdrant path (`knowledge/ingestion.py`)

When `code_graph_only=True` (Stage 1) or unconditionally (Stage 2):
- Skip `self._vs.upsert(collection=repositories_collection, ...)`.
- Skip `self._rebuild_bm25(repositories_collection, ...)`.
- The graph indexing block runs as before, using the enriched `upsert_code_entities()`.

### 6. `KnowledgePipelineConfig` — migration flag (`knowledge/config.py`)

```python
code_graph_only: bool = False   # Stage 1 flag; removed in Stage 2
```

---

## Cypher Verification Queries

### Find Doc_Sections with no code link

```cypher
MATCH (d:Doc_Section {project_id: $pid})
WHERE NOT (d)-[:REFERENCES]->()
RETURN d.id, d.heading, d.kind, d.source_doc
ORDER BY d.kind, d.heading
```

### Find Doc_Sections that describe a changed file

```cypher
MATCH (d:Doc_Section)-[:REFERENCES]->(target)
WHERE (target:CodeFile OR target:CodeClass OR target:RestEndpoint)
  AND target.file_path IN $changed_files
  AND target.project_id = $pid
RETURN d.id, d.heading, d.source_doc, target.file_path
ORDER BY d.source_doc
```

### Find all CodeFunctions in a file (with line coordinates)

```cypher
MATCH (f:CodeFile {file_path: $path, project_id: $pid})-[:CONTAINS|HAS_METHOD*1..2]->(fn:CodeFunction)
RETURN fn.name, fn.class_name, fn.start_line, fn.end_line
ORDER BY fn.start_line
```

### Find Doc_Sections that reference a specific class

```cypher
MATCH (d:Doc_Section)-[r:REFERENCES]->(c:CodeClass {name: $class_name, project_id: $pid})
RETURN d.id, d.heading, d.kind, d.source_doc, r.via
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| FalkorDB unreachable at ingest | Raise — consistent with existing behaviour |
| `FileReader.read()` fails (file missing, S3 key absent) | Return empty content + WARNING log; agent receives empty Chunk and continues |
| `doc_to_code` HyDE match finds nothing | Return empty list; agent marks `Doc_Section` as unlinked |
| `@annotation` references unknown entity ID | WARNING log, skip edge — do not fail ingestion |
| Markdown parse produces no sections | No-op; warn if source file is non-empty |
| `code_graph_only=False` (Stage 1) | Full dual-write; new graph nodes written alongside existing Qdrant writes |

---

## Migration Path

### Stage 1 — Dual-write (feature-flagged)

Set `code_graph_only=False` (default). Ingestion writes to both Qdrant and the enriched FalkorDB. Validate graph coordinates and `read_source` against a real project before cutting over. Agent can be configured to prefer `graph_navigate` while Qdrant is still live as a fallback.

### Stage 2 — Cut over

Set `code_graph_only=True`. Qdrant+BM25 writes for `repositories` are skipped. The `repositories` Qdrant collection can be dropped. Remove the flag and the dual-write code paths.

---

## Testing Strategy

### Unit — `FalkorDBGraphStore`
- `upsert_code_entities()` writes `CodeFile` + `CodeFunction` nodes with correct `start_line`/`end_line`.
- `CONTAINS` and `HAS_METHOD` edges are created correctly.
- `upsert_doc_section()` creates a `Doc_Section` node.
- `add_references_edge()` creates a `REFERENCES` edge with correct `via` property.

### Unit — `MarkdownDocIngester`
- Fixture `.md` file → correct `Doc_Section` nodes (heading, id, content_summary, kind).
- `@annotation` markers in fixture → `REFERENCES {via: "annotation"}` edges.
- Section with no annotation → no edges created, no error.

### Unit — `FileReader`
- `LocalFileReader.read()` returns correct line slice from a fixture file.
- `S3FileReader.read()` calls `s3_client.get_object()` with correct bucket/key and returns correct slice (mock S3).
- `context_lines` padding works correctly at file boundaries.

### Integration — `RetrievalTools`
- `graph_navigate` → `read_source` chain returns correct code slice for a known symbol (using `FakeFileReader` and seeded FalkorDB).
- `doc_to_code` fast path returns `GraphCoordinate` when `REFERENCES` edge exists.
- `doc_to_code` slow path invokes HyDE and returns candidates when no edge exists.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `core/stores/graph/falkordb.py` | Enrich `upsert_code_entities()`; add `upsert_doc_section`, `add_references_edge`, `query_doc_sections`, `query_unlinked_sections`, `query_sections_for_changed_files` |
| `core/knowledge/markdown_ingester.py` | **New** — `MarkdownDocIngester` |
| `core/knowledge/file_reader.py` | **New** — `FileReader` protocol, `LocalFileReader`, `S3FileReader`, `FileReaderFactory` |
| `core/agents/retrieval/tools.py` | Replace `_read_source`; add `_graph_navigate`, `_doc_to_code`; restrict `_vector_search` to documents collection |
| `core/knowledge/ingestion.py` | Skip Qdrant+BM25 writes for repositories when `code_graph_only=True` |
| `core/knowledge/pipeline.py` | Wire `MarkdownDocIngester` into `ingest_documents` for `.md` files; pass `FileReader` to tools |
| `core/knowledge/config.py` | Add `code_graph_only: bool = False` |
| `core/knowledge/code_graph.py` | No changes — `MethodInfo` already has all needed fields |
| `tests/core/stores/graph/test_falkordb_enriched.py` | **New** |
| `tests/core/knowledge/test_markdown_ingester.py` | **New** |
| `tests/core/knowledge/test_file_reader.py` | **New** |
| `tests/core/agents/retrieval/test_tools_graph.py` | **New** |
