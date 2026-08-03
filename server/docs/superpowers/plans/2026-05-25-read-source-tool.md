# read_source Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `read_source` retrieval tool that fetches all chunks for a specific source file, sorted by line number, giving the agent complete file context for class-level questions.

**Architecture:** Three-layer addition — (1) Qdrant gets a `fetch_by_source_path` scroll method, (2) `RetrievalTools` gets a `_read_source` dispatcher, (3) the result evaluator node automatically injects `read_source` steps for source paths already seen in evidence. The analyst node and `_query_to_step` are untouched; all triggering is evaluator-driven.

**Tech Stack:** qdrant-client AsyncQdrantClient scroll API, LangGraph StateGraph (existing), pytest with AsyncMock

---

### Task 1: `fetch_by_source_path` on `QdrantVectorStore`

**Files:**
- Modify: `src/telaios/core/stores/qdrant.py`
- Test: `tests/unit/stores/test_qdrant.py` (create if missing)

The existing `get_generated_doc_sha` method (line 190) shows the scroll + multi-FieldCondition pattern to follow exactly.

`source_path` is stored as a top-level payload key (set during ingestion alongside `project_id`, `content`, etc.) so `FieldCondition(key="source_path", ...)` works directly.

- [ ] **Step 1: Write failing test**

Create `tests/unit/stores/test_qdrant.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from telaios.core.stores.qdrant import QdrantVectorStore


@pytest.fixture
def mock_client():
    client = AsyncMock()
    client.get_collections.return_value = MagicMock(
        collections=[MagicMock(name="repositories")]
    )
    return client


@pytest.fixture
def store(mock_client):
    embedder = MagicMock()
    return QdrantVectorStore(client=mock_client, embedder=embedder)


@pytest.mark.asyncio
async def test_fetch_by_source_path_returns_chunks_sorted(store, mock_client):
    """fetch_by_source_path returns all matching chunks."""
    from unittest.mock import MagicMock
    r1 = MagicMock()
    r1.id = "aaa"
    r1.payload = {
        "content": "class A {}",
        "project_id": "p1",
        "source_path": "src/A.java",
        "start_line": 1,
    }
    r2 = MagicMock()
    r2.id = "bbb"
    r2.payload = {
        "content": "  void method() {}",
        "project_id": "p1",
        "source_path": "src/A.java",
        "start_line": 3,
    }
    mock_client.scroll.return_value = ([r1, r2], None)

    chunks = await store.fetch_by_source_path("repositories", "p1", "src/A.java")

    assert len(chunks) == 2
    assert chunks[0].id == "aaa"
    assert chunks[1].id == "bbb"
    assert chunks[0].content == "class A {}"
    mock_client.scroll.assert_called_once()


@pytest.mark.asyncio
async def test_fetch_by_source_path_missing_collection_returns_empty(store, mock_client):
    """Returns [] when collection does not exist."""
    mock_client.get_collections.return_value = MagicMock(collections=[])

    chunks = await store.fetch_by_source_path("repositories", "p1", "src/A.java")

    assert chunks == []
    mock_client.scroll.assert_not_called()


@pytest.mark.asyncio
async def test_fetch_by_source_path_passes_correct_filter(store, mock_client):
    """scroll is called with FieldConditions for both project_id and source_path."""
    from qdrant_client.models import FieldCondition, Filter, MatchValue
    mock_client.scroll.return_value = ([], None)

    await store.fetch_by_source_path("repositories", "proj-42", "com/example/Foo.java")

    call_kwargs = mock_client.scroll.call_args.kwargs
    scroll_filter: Filter = call_kwargs["scroll_filter"]
    keys = {cond.key for cond in scroll_filter.must}
    assert "project_id" in keys
    assert "source_path" in keys
```

- [ ] **Step 2: Run test to verify it fails**

```
cd /Users/nicocardone/Desktop/DEV/PERSONALI/telaios/server && \
  uv run pytest tests/unit/stores/test_qdrant.py -v 2>&1 | head -30
```

Expected: ImportError or AttributeError because `fetch_by_source_path` does not exist.

- [ ] **Step 3: Implement `fetch_by_source_path`**

Add to `QdrantVectorStore` in `src/telaios/core/stores/qdrant.py`, after `scroll_all` and before `delete_by_project`:

```python
async def fetch_by_source_path(
    self,
    collection: str,
    project_id: str,
    source_path: str,
) -> list["Chunk"]:
    """Return all chunks for a specific source file, unordered."""
    from qdrant_client.models import FieldCondition, Filter, MatchValue
    from telaios.core.types import Chunk

    existing = {c.name for c in (await self._client.get_collections()).collections}
    if collection not in existing:
        return []

    records, _ = await self._client.scroll(
        collection_name=collection,
        scroll_filter=Filter(
            must=[
                FieldCondition(key="project_id", match=MatchValue(value=project_id)),
                FieldCondition(key="source_path", match=MatchValue(value=source_path)),
            ]
        ),
        limit=500,
        with_payload=True,
    )
    return [
        Chunk(
            id=str(r.id),
            document_id=(r.payload or {}).get("document_id", ""),
            content=(r.payload or {}).get("content", ""),
            metadata={k: v for k, v in (r.payload or {}).items() if k != "content"},
        )
        for r in records
    ]
```

Also add `"fetch_by_source_path"` is implicitly exported through `__all__ = ["QdrantVectorStore"]` — no change needed there.

- [ ] **Step 4: Run tests to verify they pass**

```
cd /Users/nicocardone/Desktop/DEV/PERSONALI/telaios/server && \
  uv run pytest tests/unit/stores/test_qdrant.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nicocardone/Desktop/DEV/PERSONALI/telaios/server
git add src/telaios/core/stores/qdrant.py tests/unit/stores/test_qdrant.py
git commit -m "feat(stores/qdrant): add fetch_by_source_path for full-file chunk retrieval"
```

---

### Task 2: `read_source` tool in `state.py` + `tools.py`

**Files:**
- Modify: `src/telaios/core/agents/retrieval/state.py`
- Modify: `src/telaios/core/agents/retrieval/tools.py`
- Modify: `tests/unit/core/agents/retrieval/test_state.py`
- Modify: `tests/unit/core/agents/retrieval/test_tools.py`

**Context — `state.py`:**  
`SearchStep.tool` is currently:
```python
tool: Literal["vector_search", "graph_structural", "bm25", "generated_docs"]
```
Add `"read_source"` to this Literal.

**Context — `tools.py`:**  
`RetrievalTools.execute()` dispatches on `step.tool` with a match statement.
`_bm25` calls `self.bm25_store.search(collection, query, project_id, top_k)` and returns raw dicts that get converted to `Chunk`.
`_resolve_collections(source, config)` returns the list of collections to search.
`self.vector_store` is a `QdrantVectorStore` instance with the new `fetch_by_source_path` method.

**`_read_source` logic:**
1. If `sub_query` contains `/` → treat as source_path directly.
2. Otherwise → resolve via BM25 top-1 to extract `source_path` from metadata. If no BM25 result, use `sub_query` as-is.
3. For each collection: call `self.vector_store.fetch_by_source_path(collection, project_id, source_path)`.
4. Deduplicate by chunk id, sort by `metadata.get("start_line") or 0`.
5. Return `(chunks, [1.0] * len(chunks))`.

- [ ] **Step 1: Write failing tests**

Add to `tests/unit/core/agents/retrieval/test_state.py`:

```python
def test_search_step_read_source_tool_is_valid():
    step = SearchStep(sub_query="src/main/UserService.java", tool="read_source", reason="full read")
    assert step.tool == "read_source"
```

Add to `tests/unit/core/agents/retrieval/test_tools.py`:

```python
@pytest.mark.asyncio
async def test_read_source_with_path_query(tools):
    """When sub_query is a path, fetch_by_source_path is called with it directly."""
    chunk = Chunk(id="c1", document_id="d1", content="class A {}", metadata={"start_line": 1, "source_path": "src/A.java"})
    tools.vector_store.fetch_by_source_path = AsyncMock(return_value=[chunk])

    step = SearchStep(sub_query="src/A.java", tool="read_source", reason="test")
    chunks, scores = await tools.execute(step)

    assert len(chunks) == 1
    assert chunks[0].id == "c1"
    assert scores == [1.0]
    tools.vector_store.fetch_by_source_path.assert_called()


@pytest.mark.asyncio
async def test_read_source_with_symbol_resolves_via_bm25(tools):
    """When sub_query has no '/', BM25 top-1 is used to resolve the source_path."""
    # BM25 returns a hit with source_path in metadata
    tools.bm25_store.search.return_value = [
        {"id": "x", "content": "class UserService {}", "metadata": {"source_path": "src/UserService.java"}}
    ]
    chunk = Chunk(id="c2", document_id="d2", content="class UserService {}", metadata={"start_line": 1})
    tools.vector_store.fetch_by_source_path = AsyncMock(return_value=[chunk])

    step = SearchStep(sub_query="UserService", tool="read_source", reason="test")
    chunks, scores = await tools.execute(step)

    assert len(chunks) == 1
    # fetch_by_source_path was called with the resolved path
    call_args = tools.vector_store.fetch_by_source_path.call_args_list[0]
    assert call_args.kwargs["source_path"] == "src/UserService.java" or \
           call_args.args[2] == "src/UserService.java"


@pytest.mark.asyncio
async def test_read_source_returns_empty_when_no_chunks(tools):
    tools.vector_store.fetch_by_source_path = AsyncMock(return_value=[])
    step = SearchStep(sub_query="src/Missing.java", tool="read_source", reason="test")
    chunks, scores = await tools.execute(step)
    assert chunks == []
    assert scores == []
```

Note: the existing `tools` fixture in `test_tools.py` creates a `RetrievalTools` instance with mock stores. Check what it looks like and add `fetch_by_source_path` as an `AsyncMock` attribute if needed.

- [ ] **Step 2: Run tests to verify they fail**

```
cd /Users/nicocardone/Desktop/DEV/PERSONALI/telaios/server && \
  uv run pytest tests/unit/core/agents/retrieval/test_state.py tests/unit/core/agents/retrieval/test_tools.py -v -k "read_source" 2>&1 | head -30
```

Expected: validation error (`"read_source"` not in Literal) and missing method.

- [ ] **Step 3: Update `state.py`**

In `src/telaios/core/agents/retrieval/state.py`, change:

```python
tool: Literal["vector_search", "graph_structural", "bm25", "generated_docs"]
```

to:

```python
tool: Literal["vector_search", "graph_structural", "bm25", "generated_docs", "read_source"]
```

- [ ] **Step 4: Update `tools.py`**

In `execute()`, add a new case before the default `_`:

```python
case "read_source":
    return await self._read_source(step.sub_query)
```

Add the `_read_source` method to `RetrievalTools`:

```python
async def _read_source(self, sub_query: str) -> tuple[list[Chunk], list[float]]:
    """Fetch all chunks for a source file, sorted by start_line."""
    source_path = sub_query

    if "/" not in sub_query:
        # Resolve symbol name → source_path via BM25
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
            logger.warning("read_source: fetch_by_source_path failed for %r", source_path, exc_info=True)
            chunks = []
        for c in chunks:
            if c.id not in seen_ids:
                seen_ids.add(c.id)
                all_chunks.append(c)

    all_chunks.sort(key=lambda c: c.metadata.get("start_line") or 0)
    return all_chunks, [1.0] * len(all_chunks)
```

- [ ] **Step 5: Run tests to verify they pass**

```
cd /Users/nicocardone/Desktop/DEV/PERSONALI/telaios/server && \
  uv run pytest tests/unit/core/agents/retrieval/test_state.py tests/unit/core/agents/retrieval/test_tools.py -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/nicocardone/Desktop/DEV/PERSONALI/telaios/server
git add src/telaios/core/agents/retrieval/state.py \
        src/telaios/core/agents/retrieval/tools.py \
        tests/unit/core/agents/retrieval/test_state.py \
        tests/unit/core/agents/retrieval/test_tools.py
git commit -m "feat(agents/retrieval): add read_source tool for full-file chunk retrieval"
```

---

### Task 3: Evaluator-driven `read_source` injection in `nodes.py`

**Files:**
- Modify: `src/telaios/core/agents/retrieval/nodes.py`
- Modify: `tests/unit/core/agents/retrieval/test_nodes.py`

**Context — current evaluator logic (lines 179–226):**  
After the LLM returns `EvaluationResult`, if not sufficient:
```python
new_steps = [_query_to_step(q) for q in evaluation.follow_up_queries[:3]]
return {
    "is_sufficient": False,
    "iteration": new_iteration,
    "pending_steps": new_steps,
    "follow_up_queries": evaluation.follow_up_queries,
}
```

**Changes needed:**

1. **Before building `new_steps`**, extract source paths from evidence:
   - Collect all `source_path` values from `state["evidence"]` that contain `/` (code files).
   - Filter out paths already covered by any `read_source` step in `state["search_plan"]`.
   - Take the top-2 by frequency (most-referenced first).
   - Build `SearchStep(sub_query=sp, tool="read_source", reason="full file read")` for each.

2. **LLM follow-ups** are limited to 2 (down from 3) since read_source steps add context.

3. **Update `search_plan`** in the returned dict to include the new steps — this is how subsequent evaluator iterations know which paths are already queued for reading.

4. **Update `_query_to_step`**: add a branch at the top for the `"read_source:"` prefix:
```python
if query.startswith("read_source:"):
    path = query[len("read_source:"):].strip()
    return SearchStep(sub_query=path, tool="read_source", reason="evaluator follow-up")
```

**Full updated evaluator return for the `is_sufficient=False` case:**

```python
# Source paths already covered by existing read_source steps
already_read = {
    step.sub_query
    for step in state["search_plan"]
    if step.tool == "read_source"
}

# Count how many evidence chunks reference each source file
source_path_counts: dict[str, int] = {}
for chunk in state["evidence"]:
    sp = chunk.metadata.get("source_path", "")
    if sp and "/" in sp and sp not in already_read:
        source_path_counts[sp] = source_path_counts.get(sp, 0) + 1

# Top-2 most-referenced paths get a read_source step
read_steps = [
    SearchStep(
        sub_query=sp,
        tool="read_source",
        reason="full file read for completeness",
    )
    for sp, _ in sorted(source_path_counts.items(), key=lambda x: -x[1])[:2]
]

# LLM follow-ups (limit to 2 since read_source steps already add context)
llm_steps = [_query_to_step(q) for q in evaluation.follow_up_queries[:2]]

new_steps = read_steps + llm_steps

return {
    "is_sufficient": False,
    "iteration": new_iteration,
    "pending_steps": new_steps,
    "search_plan": state["search_plan"] + new_steps,
    "follow_up_queries": evaluation.follow_up_queries,
}
```

Note: the `is_sufficient=True` branch already returns `pending_steps: []` — no change needed there.

- [ ] **Step 1: Write failing tests**

Add to `tests/unit/core/agents/retrieval/test_nodes.py`:

```python
@pytest.mark.asyncio
async def test_evaluator_injects_read_source_for_evidence_source_paths(mock_llm):
    """Evaluator adds read_source steps for source_paths seen in evidence."""
    from telaios.core.agents.retrieval.nodes import make_result_evaluator_node
    from telaios.core.agents.retrieval.state import SearchStep
    from telaios.core.types import Chunk

    eval_result = EvaluationResult(
        is_sufficient=False,
        missing_aspects=["constructor"],
        follow_up_queries=["UserService constructor"],
        confidence=0.4,
    )
    mock_llm.with_structured_output.return_value.ainvoke = AsyncMock(return_value=eval_result)

    node = make_result_evaluator_node(mock_llm)
    chunk = Chunk(
        id="c1", document_id="d1", content="class UserService {}",
        metadata={"source_path": "src/main/UserService.java"},
    )
    state = {
        "query": "what does UserService do",
        "iteration": 0,
        "max_iterations": 3,
        "evidence": [chunk, chunk],  # same path twice → frequency 2
        "evidence_scores": [1.0, 1.0],
        "search_plan": [SearchStep(sub_query="UserService", tool="bm25", reason="initial")],
        "pending_steps": [],
        "follow_up_queries": [],
    }

    result = await node(state)

    assert result["is_sufficient"] is False
    pending = result["pending_steps"]
    read_steps = [s for s in pending if s.tool == "read_source"]
    assert len(read_steps) == 1
    assert read_steps[0].sub_query == "src/main/UserService.java"
    # search_plan is updated to include new steps
    assert any(s.tool == "read_source" for s in result["search_plan"])


@pytest.mark.asyncio
async def test_evaluator_does_not_duplicate_already_read_paths(mock_llm):
    """Evaluator skips source_paths that already have a read_source in search_plan."""
    from telaios.core.agents.retrieval.nodes import make_result_evaluator_node
    from telaios.core.agents.retrieval.state import SearchStep
    from telaios.core.types import Chunk

    eval_result = EvaluationResult(
        is_sufficient=False,
        missing_aspects=["details"],
        follow_up_queries=[],
        confidence=0.3,
    )
    mock_llm.with_structured_output.return_value.ainvoke = AsyncMock(return_value=eval_result)

    node = make_result_evaluator_node(mock_llm)
    chunk = Chunk(
        id="c2", document_id="d2", content="class A {}",
        metadata={"source_path": "src/A.java"},
    )
    state = {
        "query": "what is class A",
        "iteration": 0,
        "max_iterations": 3,
        "evidence": [chunk],
        "evidence_scores": [1.0],
        # Already has a read_source for this path
        "search_plan": [
            SearchStep(sub_query="src/A.java", tool="read_source", reason="already queued"),
        ],
        "pending_steps": [],
        "follow_up_queries": [],
    }

    result = await node(state)

    pending = result["pending_steps"]
    read_steps = [s for s in pending if s.tool == "read_source"]
    # Should NOT add a second read_source for the same path
    assert len(read_steps) == 0


def test_query_to_step_recognises_read_source_prefix():
    from telaios.core.agents.retrieval.nodes import _query_to_step
    step = _query_to_step("read_source: src/main/UserService.java")
    assert step.tool == "read_source"
    assert step.sub_query == "src/main/UserService.java"
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd /Users/nicocardone/Desktop/DEV/PERSONALI/telaios/server && \
  uv run pytest tests/unit/core/agents/retrieval/test_nodes.py -v -k "read_source" 2>&1 | head -30
```

Expected: assertions fail because read_source steps are not injected.

- [ ] **Step 3: Update `nodes.py`**

**3a. Update `_query_to_step`** — add the `read_source:` prefix check at the top of the function body (before `lower = query.lower()`):

```python
def _query_to_step(query: str) -> SearchStep:
    """Assign a tool to a follow-up query using keyword heuristics (no LLM call)."""
    if query.startswith("read_source:"):
        path = query[len("read_source:"):].strip()
        return SearchStep(sub_query=path, tool="read_source", reason="evaluator follow-up")
    lower = query.lower()
    words = set(re.findall(r'\w+', lower))
    if words & _STRUCTURAL_KEYWORDS:
        tool = "graph_structural"
    elif _EXACT_PATTERN.search(query):
        tool = "bm25"
    else:
        tool = "vector_search"
    return SearchStep(sub_query=query, tool=tool, reason="evaluator follow-up")
```

**3b. Update the `is_sufficient=False` branch** of `make_result_evaluator_node` (replace lines 218–224):

```python
        # Source paths already covered by existing read_source steps
        already_read = {
            step.sub_query
            for step in state["search_plan"]
            if step.tool == "read_source"
        }

        # Count how many evidence chunks reference each source file
        source_path_counts: dict[str, int] = {}
        for chunk in state["evidence"]:
            sp = chunk.metadata.get("source_path", "")
            if sp and "/" in sp and sp not in already_read:
                source_path_counts[sp] = source_path_counts.get(sp, 0) + 1

        # Top-2 most-referenced paths get a read_source step
        read_steps = [
            SearchStep(
                sub_query=sp,
                tool="read_source",
                reason="full file read for completeness",
            )
            for sp, _ in sorted(source_path_counts.items(), key=lambda x: -x[1])[:2]
        ]

        # LLM follow-ups (limit to 2)
        llm_steps = [_query_to_step(q) for q in evaluation.follow_up_queries[:2]]

        new_steps = read_steps + llm_steps
        return {
            "is_sufficient": False,
            "iteration": new_iteration,
            "pending_steps": new_steps,
            "search_plan": state["search_plan"] + new_steps,
            "follow_up_queries": evaluation.follow_up_queries,
        }
```

- [ ] **Step 4: Run all retrieval tests**

```
cd /Users/nicocardone/Desktop/DEV/PERSONALI/telaios/server && \
  uv run pytest tests/unit/core/agents/retrieval/ -v
```

Expected: all tests PASS.

- [ ] **Step 5: Run full unit suite to check for regressions**

```
cd /Users/nicocardone/Desktop/DEV/PERSONALI/telaios/server && \
  uv run pytest tests/unit/ -x -q 2>&1 | tail -20
```

Expected: no new failures beyond pre-existing ones.

- [ ] **Step 6: Commit**

```bash
cd /Users/nicocardone/Desktop/DEV/PERSONALI/telaios/server
git add src/telaios/core/agents/retrieval/nodes.py \
        tests/unit/core/agents/retrieval/test_nodes.py
git commit -m "feat(agents/retrieval): evaluator injects read_source steps for code evidence paths"
```
