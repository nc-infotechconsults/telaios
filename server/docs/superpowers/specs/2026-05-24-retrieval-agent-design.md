# Retrieval Agent & Language Parity — Design Spec

**Date:** 2026-05-24  
**Status:** Approved  
**Scope:** Agentic retrieval loop (all languages) + AST extractors for Python and TypeScript

---

## Problem

The current `KnowledgeBasePipeline.query()` is a one-shot linear pipeline:

```
Query → HyDE → Hybrid (Qdrant + BM25 + RRF) → Graph Augment → Generate
```

It fires once, takes whatever it gets, and generates. There is no ability to:
- Decompose a complex question into sub-queries
- Choose the right retrieval tool per sub-query
- Evaluate whether the evidence is sufficient
- Re-query when it isn't

Additionally, `CodeGraphExtractor._SUPPORTED` contains only `"java"`. Python, TypeScript, and JavaScript code receives no structural graph extraction — no class hierarchy, no dependency edges, no REST endpoint nodes. Structural queries against non-Java codebases fall back to noisy LLM triplet extraction.

---

## Goals

1. Replace the one-shot query path with a LangGraph `StateGraph` agent that decomposes queries, selects retrieval tools, evaluates results, and iterates until sufficient evidence is collected.
2. Add `PythonAstExtractor` and `TypeScriptAstExtractor` to `CodeGraphExtractor` so structural graph queries work across all supported languages.
3. Keep the agents package as the canonical home for all specialized agents (retrieval, and future agents such as reverse engineering).

---

## Non-Goals

- Changes to ingestion, chunking, or embedding logic.
- Changes to the `PlannerAgent`.
- Adding new languages beyond Python and TypeScript/JavaScript.
- UI changes.

---

## Architecture

### Agent Package Layout

The `RetrievalAgent` lives in the existing agents package alongside `PlannerAgent`:

```
src/telaios/core/agents/
├── base_agent.py              (existing)
├── planner/                   (existing)
│   ├── agent.py
│   ├── schemas.py
│   └── tools.py
└── retrieval/                 (NEW)
    ├── __init__.py
    ├── agent.py               ← RetrievalAgent: builds and runs the graph
    ├── state.py               ← RetrievalState, SearchStep, EvaluationResult
    ├── nodes.py               ← four node functions
    ├── graph.py               ← build_retrieval_graph() → CompiledGraph
    └── tools.py               ← retrieval tool wrappers called by dispatcher
```

Knowledge package changes are minimal:

```
src/telaios/core/knowledge/
├── code_graph.py              ← add PythonAstExtractor, TypeScriptAstExtractor
└── query_router.py            ← extend with Python/TS structural patterns
```

### LangGraph Graph

```
START
  │
  ▼
query_analyst
  │
  ▼
retrieval_dispatcher ◄──────────────────────────────────┐
  │  ↑                                                   │
  │  └─ (pending_steps non-empty: loop)                  │
  ▼                                                      │
result_evaluator                                         │
  │                                                      │
  ├─ sufficient OR iteration >= max → synthesizer → END  │
  │                                                      │
  └─ not sufficient → convert follow_up_queries to       │
     SearchSteps, increment iteration ──────────────────►┘
```

---

## State

```python
class SearchStep(BaseModel):
    sub_query: str
    tool: Literal["vector_search", "graph_structural", "bm25", "generated_docs"]
    reason: str

class RetrievalState(TypedDict):
    query: str
    project_id: str
    source: str                    # "all" | "documents" | "repositories"
    top_k: int
    search_plan: list[SearchStep]  # full plan from query_analyst
    pending_steps: list[SearchStep]# steps not yet dispatched
    evidence: list[Chunk]          # accumulated chunks across all iterations
    evidence_scores: list[float]   # parallel to evidence
    iteration: int                 # current evaluator cycle (starts at 0)
    max_iterations: int            # hard cap, default 3
    is_sufficient: bool
    follow_up_queries: list[str]   # evaluator's suggested next searches
    answer: str
    citations: list[Citation]
```

---

## Nodes

### `query_analyst`

**Input:** `query`, `source`, `project_id`  
**Output:** `search_plan`, `pending_steps`

LLM call with structured output. Produces an ordered list of `SearchStep` objects. Also calls `classify_query()` internally — if intent is structural, a `graph_structural` step is inserted first. The LLM decides which sub-queries to issue and which tool fits each one.

Tool selection heuristics communicated to the LLM:
- `graph_structural` for dependency, inheritance, endpoint listing/counting questions
- `generated_docs` for "how does X work overall", architecture, high-level questions
- `vector_search` (default) for semantic questions about implementation
- `bm25` for exact symbol name lookups

### `retrieval_dispatcher`

**Input:** `pending_steps`, `evidence`, `evidence_scores`  
**Output:** updated `evidence`, `evidence_scores`, `pending_steps`

Pops the first `SearchStep` from `pending_steps`. Calls the matching tool via `tools.py`. Appends results to `evidence`. Loops back to itself while `pending_steps` is non-empty; moves to `result_evaluator` when empty.

Retrieval tools:
- **`vector_search`** — `HybridRetriever.aretrieve()` (HyDE + Qdrant dense + BM25 + RRF)
- **`graph_structural`** — `GraphAugmentor.query_structural()` (deterministic graph query)
- **`bm25`** — direct `BM25Store.search()` for exact identifier matches
- **`generated_docs`** — `HybridRetriever.aretrieve()` scoped to the `documents` collection, filtered to `source_type == "generated_doc"`

### `result_evaluator`

**Input:** `query`, `evidence`, `iteration`, `max_iterations`  
**Output:** `is_sufficient`, `follow_up_queries`, updated `iteration`

LLM call with structured output:

```python
class EvaluationResult(BaseModel):
    is_sufficient: bool
    missing_aspects: list[str]
    follow_up_queries: list[str]  # populated only when not sufficient
    confidence: float             # 0.0–1.0
```

Conditional edge logic:
- `is_sufficient == True` OR `iteration >= max_iterations` → `synthesizer`
- Otherwise: convert `follow_up_queries` to new `SearchStep`s using the same tool-selection heuristics documented in the `query_analyst` section (structural-pattern → `graph_structural`, exact identifier → `bm25`, default → `vector_search`) without a second analyst LLM call, increment `iteration`, route back to `retrieval_dispatcher`

### `synthesizer`

**Input:** `query`, `evidence`, `evidence_scores`, `search_plan`  
**Output:** `answer`, `citations`

Enhanced generation prompt vs. current `_generate_answer`:
- Knows the original query and sub-queries that were run
- Instructs the LLM to structure the answer to address each aspect identified in the search plan
- Citation format unchanged from current implementation (`[N]` inline with source path + line)
- Respects `generation_max_context_chars` budget from `KnowledgePipelineConfig`

---

## Pipeline Integration

`KnowledgeBasePipeline.query()` becomes a thin delegate:

```python
async def query(self, project_id, text, source="all", top_k=None, on_progress=None):
    agent = self._make_retrieval_agent(project_id, source, top_k or self._config.top_k)
    return await agent.arun(text, on_progress=on_progress)

def _make_retrieval_agent(self, project_id, source, top_k):
    from telaios.core.agents.retrieval.agent import RetrievalAgent
    return RetrievalAgent(
        vector_store=self._vs,
        bm25_store=self._bm25,
        graph_augmentor=self._graph,
        hyde=self._hyde,
        llm=self._llm,
        config=self._config,
        project_id=project_id,
        source=source,
        top_k=top_k,
    )
```

Return type remains `KnowledgeQueryResult` — no API surface changes.

---

## Language Parity

### `PythonAstExtractor`

Uses Python's built-in `ast` module (no new dependencies).

Extracts:
- **Classes**: name, base classes (inheritance chain), class-level decorators
- **Functions/methods**: name, parameters with type annotations, return type, decorators, visibility (leading `_` convention)
- **REST endpoints** via decorator analysis:
  - Flask: `@app.route('/path', methods=['GET'])`, `@bp.get('/path')`
  - FastAPI: `@router.get('/path')`, `@app.post('/path')`, `@router.delete('/path/{id}')`
  - Django REST Framework: `@api_view(['GET', 'POST'])`
  - Maps decorator → `http_method` + `path` → `RestEndpointInfo`
- **Imports**: for dependency edge construction

### `TypeScriptAstExtractor`

Uses tree-sitter-typescript (already loaded by `TreeSitterChunker` — no new dependencies).

Extracts:
- **Classes**: name, `extends`, `implements` list
- **Functions/methods**: name, parameters, return type
- **REST endpoints**:
  - NestJS: `@Controller('/prefix')` on class + `@Get()`, `@Post()` on methods → combined path → `RestEndpointInfo`
  - Express: `router.get('/path', handler)` call expressions
- **Interfaces**: as lightweight graph nodes for dependency resolution
- **Imports**: for dependency edges

JavaScript uses the same extractor with the `javascript` grammar. When `language == "javascript"`, the extractor skips TypeScript-specific node types (`interface_declaration`, `type_alias_declaration`, typed parameter annotations) and NestJS decorator patterns, retaining only class/function extraction and Express-style route detection.

### `CodeGraphExtractor` Update

```python
_SUPPORTED: dict[str, type] = {
    "java":       JavaAstExtractor,
    "python":     PythonAstExtractor,
    "typescript": TypeScriptAstExtractor,
    "javascript": TypeScriptAstExtractor,  # shared extractor, JS-safe subset
}
```

### `query_router.py` Extensions

New patterns added to `_PATTERNS`:
- Python snake_case function dependency queries: "which functions call `process_payment`"
- FastAPI/Flask route queries: "what routes does the users router expose"
- TypeScript interface/type queries: "what implements `UserRepository`"

`classify_query()` signature and return type unchanged.

---

## Error Handling

- `query_analyst` failure: fall back to single `vector_search` step with the raw query (current pipeline behavior)
- `retrieval_dispatcher` tool failure: log warning, skip step, continue with remaining steps
- `result_evaluator` failure: treat as `is_sufficient=True`, proceed to synthesis with what was collected
- `synthesizer` failure: return empty answer with collected chunks (current behavior)
- Max iterations enforced unconditionally — no infinite loops

---

## Configuration

No new config keys required. `max_iterations` defaults to `3` as a constant in `graph.py`. If it needs to be tunable later, it maps to `KnowledgePipelineConfig`.

---

## Testing

Each node function in `nodes.py` is a plain async function — testable in isolation with mocked LLM and mock retrieval tools. Graph integration test: build the full graph with fake tools, assert state transitions for the "needs follow-up" path and the "sufficient on first pass" path.

Language extractor tests: fixed source strings per language, assert extracted `CodeEntities` match expected classes, methods, endpoints.
