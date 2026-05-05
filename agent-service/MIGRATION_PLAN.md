# Migration Plan: Remove `src/agent_service/`, Rebuild in `src/`

## Goal
Remove `src/agent_service/` and rebuild all functionality in `src/` using vendor-agnostic abstractions from `src/core/` and `src/tools/`.

## Constraints & Preferences
- **Big-bang rewrite** strategy (single feature branch, single cutover PR).
- Two-step execution model: **PlannerAgent** (produces structured plan) + **Orchestrator** (executes DAG via subagents honoring `depends_on`). No LangGraph state machines in domain code.
- Delete document copilot v1 (stateless) entirely; keep only v2 stateful.
- Each role agent in its own file but using ONLY `core.Agent` interface (zero framework knowledge).
- Document providers grouped by capability (extraction/chunking/conversion/embedding).
- FastAPI-only transport, isolated under `src/api/`.
- Vendor libs allowed only in `src/core/providers/**` and `src/infra/**`.
- Files ≤ 500 LOC; single source of truth for types in `core/types.py`.

## Updated Decisions
1. **Checkpoint storage:** Reuse existing LangGraph Postgres tables (zero data migration). New `PostgresCheckpointer` reads/writes same rows. Couples us to LangGraph's binary blob format, but this is acceptable as a transitional measure.
2. **Human-in-the-loop interrupt:** Generalize the concept in `core/` (e.g. `core.interrupt.InterruptHandle` ABC) while the default `core/providers/langchain/` impl keeps using LangGraph `interrupt()`/`Command(resume=...)` under the hood. Domain code stays vendor-free.
3. **v1 Document Copilot:** Full delete + update all callers in cutover PR. No deprecation shim.

## Old → New Mapping Table

| Old Location | New Location | Notes |
|---|---|---|
| `agent_service/services/planning_service/` (8 files) | `domain/planning/{session,parser,persistence,prompts}.py` | 5× prompt composition deduplicated into `prompts.py`; LLM config block deduplicated into `core/factory.py` |
| `agent_service/agents/coordinator/` | `domain/orchestration/` + `core/providers/{opencode,github_copilot}/` | Scheduler/pool/drivers split |
| `agent_service/agents/document_copilot/v1/` | **DELETED** | Stateless version removed entirely |
| `agent_service/agents/document_copilot/v2/` | `domain/agents/document_copilot.py` + `infra/checkpoint.py` | v2 becomes sole implementation |
| `agent_service/services/document_tools/` | `tools/builtin/documents/` | Grouped by capability, not per-format |
| `agent_service/services/document_converter.py` | `tools/builtin/documents/conversion.py` | Fix `import markdown` shadow bug during move |
| `agent_service/services/document_chunker.py` | `tools/builtin/documents/chunking.py` | Consolidate 2× chunker implementations |
| `agent_service/services/document_embedder.py` | `tools/builtin/documents/embedding.py` | Single embedder |
| `agent_service/services/document_extractor.py` | `tools/builtin/documents/extraction.py` | Single extractor |
| `agent_service/main.py` (FastAPI app) | `api/main.py` | Transport layer isolated |

## Target Tree (after Phase 10)
```
src/
  core/
    __init__.py
    types.py                 # Single source of truth for all shared types
    agent.py                  # ABC for Agent
    orchestrator.py           # ABC for Orchestrator
    llm.py                    # ABC for LLM
    rag.py                    # ABC for RAG
    reranker.py               # ABC for Reranker
    graph_store.py            # ABC for GraphStore
    factory.py                # create_agent(AgentConfig) — dedup LLM config
    interrupt.py              # ABC for HITL handle
    checkpoint.py             # ABC for checkpointer
    providers/
      langchain/
        agent.py
        orchestrator.py
        llm.py
        rag.py
        reranker.py
        graph_store.py
        interrupt.py          # LangGraph interrupt() / Command(resume=...)
        checkpoint.py         # PostgresCheckpointer (reuses LG tables)
      opencode/
        ...
      github_copilot/
        ...
  tools/
    __init__.py
    registry.py
    builtin/
      repo/
      review/
      testing/
      infra/
      documents/
        __init__.py
        conversion.py         # was document_converter.py (shadow bug fixed)
        chunking.py           # merged chunkers
        embedding.py          # merged embedders
        extraction.py         # merged extractors
        qa.py                 # from services/document_tools/qa.py
        summarize.py          # from services/document_tools/summarize.py
        analyze.py            # from services/document_tools/analyze.py
  domain/
    __init__.py
    planning/
      __init__.py
      session.py              # plan session lifecycle
      parser.py               # structured plan parser
      persistence.py          # plan CRUD + checkpoint
      prompts.py              # single source for all plan prompts
    orchestration/
      __init__.py
      scheduler.py
      pool.py
      drivers.py
    agents/
      __init__.py
      document_copilot.py     # v2 only
      code_reviewer.py
      ...
  infra/
    __init__.py
    settings.py
    crypto.py                 # decrypt agents.llm_api_key
    redis.py
    sse.py
    jobs.py
    data_client.py
    s3.py
    git.py
  api/
    __init__.py
    main.py                   # FastAPI app entrypoint
    routers/
      ...
```

## 10-Phase Migration

### Phase 0 — Branch & Scaffolding
**Goal:** Create branch and skeleton directories.
**Tasks:**
1. `git checkout -b migration/agent-service-removal`
2. `mkdir -p src/domain/{planning,orchestration,agents} src/infra src/api/routers src/tools/builtin/documents`
3. Create minimal `__init__.py` files.

**Acceptance:** `git branch` shows branch; tree matches target above (empty `__init__.py` files OK).

**Risks:** None.

---

### Phase 1 — Core Interrupt & Checkpoint Abstractions
**Goal:** Vendor-free HITL and checkpoint contracts.
**Tasks:**
1. Write `core/interrupt.py` with `InterruptHandle` ABC (`wait_for_resume()`, `send_interrupt()`).
2. Write `core/checkpoint.py` with `Checkpointer` ABC (`get(thread_id)`, `put(thread_id, state)`).
3. Stub `core/providers/langchain/interrupt.py` implementing `InterruptHandle` via LangGraph `interrupt()`.
4. Stub `core/providers/langchain/checkpoint.py` implementing `Checkpointer` via LangGraph PostgresSaver (reuses existing tables).

**Acceptance:** `python -c "from core.interrupt import InterruptHandle; from core.checkpoint import Checkpointer; print('OK')"` succeeds.

**Risks:** PostgresSaver schema drift. Mitigation: pin `langgraph-checkpoint` version; verify table names before Phase 2.

---

### Phase 2 — Core Factory (LLM Config Deduplication)
**Goal:** Single LLM-config block used by all agents.
**Tasks:**
1. Migrate `planning_service/llm_factory.py` logic into `core/factory.py`.
2. Move `agents.llm_api_key` decryption into `infra/crypto.py`.
3. `core/factory.py` imports `infra/crypto` to decrypt key; constructs `core/providers/langchain/llm.py` instance.
4. Delete 4 duplicate LLM-config blocks from old code (not files yet, just mark inline with `# TODO: Phase 2 dedup`).

**Acceptance:** `pytest tests/core/factory_test.py` (write minimal test: create_agent returns Agent with correct LLM).

**Risks:** Encrypted key format mismatch. Mitigation: add unit test for `infra/crypto.py` using known fixture.

---

### Phase 3 — Document Tools Consolidation (Conversion)
**Goal:** Move `document_converter.py`, fix shadow bug.
**Tasks:**
1. Copy `services/document_converter.py` → `tools/builtin/documents/conversion.py`.
2. Fix `import markdown` shadowing `markdown: str` parameter (rename import or alias).
3. Update all imports in old code to point to new location (temporary shim for compatibility).

**Acceptance:** `pytest tests/tools/documents/conversion_test.py` passes; `rg "import markdown" src/tools/builtin/documents/conversion.py` shows no unqualified top-level import.

**Risks:** Breaking downstream consumers. Mitigation: temporary shim with deprecation warning; removed in Phase 10.

---

### Phase 4 — Document Tools Consolidation (Chunking, Embedding, Extraction)
**Goal:** Merge duplicate implementations.
**Tasks:**
1. Analyze `document_chunker.py` duplicates — merge into `tools/builtin/documents/chunking.py`.
2. Analyze `document_embedder.py` duplicates — merge into `tools/builtin/documents/embedding.py`.
3. Analyze `document_extractor.py` duplicates — merge into `tools/builtin/documents/extraction.py`.
4. Fix broken absolute imports in `services/document_tools/{analyze,extract,qa,summarize}.py` to point at new consolidated modules.

**Acceptance:** All `tools/builtin/documents/*_test.py` green; `rg "from agent_service.services.document_" src/` returns empty.

**Risks:** Semantic drift between duplicate implementations. Mitigation: compare outputs on shared fixture documents; flag diffs for human review.

---

### Phase 5 — Planning Service Rebuild
**Goal:** Replace `agent_service/services/planning_service/` (8 files) with 4 clean domain files.
**Tasks:**
1. Write `domain/planning/prompts.py` — deduplicate all 5× `_compose_prompt` variants.
2. Write `domain/planning/parser.py` — structured plan parser.
3. Write `domain/planning/persistence.py` — plan CRUD (uses `core/checkpoint.py` ABC).
4. Write `domain/planning/session.py` — plan session lifecycle.
5. Port `planning_service/llm_factory.py` key-decrypt into `domain/planning/session.py` constructor (uses `infra/crypto.py`).

**Acceptance:** `pytest tests/domain/planning/` green; old planning tests still pass via temporary shim.

**Risks:** Prompt output drift. Mitigation: snapshot test old prompts vs new; require ≤1% token diff.

---

### Phase 6 — Orchestration Layer (Coordinator Migration)
**Goal:** Move scheduler/pool/drivers out of `agents/coordinator/`.
**Tasks:**
1. Refactor `domain/orchestration/scheduler.py` — generic DAG scheduler honoring `depends_on`.
2. Refactor `domain/orchestration/pool.py` — agent worker pool.
3. Refactor `domain/orchestration/drivers.py` — vendor-specific drivers (opencode, github_copilot) in `core/providers/{opencode,github_copilot}/`.
4. Ensure all orchestration code uses `core.Agent` ABC only.

**Acceptance:** `pytest tests/domain/orchestration/` green; no `import langgraph` in `domain/orchestration/`.

**Risks:** Race conditions in pool. Mitigation: stress-test with 50 concurrent dummy agents.

---

### Phase 7 — Document Copilot v2 Migration
**Goal:** Move v2 to `domain/agents/document_copilot.py`; delete v1.
**Tasks:**
1. Port v2 stateful logic to `domain/agents/document_copilot.py`.
2. Replace LangGraph `interrupt()` calls with `core.interrupt.InterruptHandle` (injected at init; default provider impl uses LangGraph under hood).
3. Add `phase` column to `plans` table (or use existing checkpoint metadata) for explicit resume state.
4. Delete `agent_service/agents/document_copilot/v1/`.
5. Grep codebase for v1 consumers; patch in this PR (frontend/data-api callers).

**Acceptance:** `pytest tests/domain/agents/document_copilot_test.py` green; `rg "document_copilot_v1" src/` empty.

**Risks:** v2 resume state incompatibility. Mitigation: migration test: start plan in old code, resume in new code.

---

### Phase 8 — API Transport Isolation
**Goal:** FastAPI app lives only in `src/api/`.
**Tasks:**
1. Move `agent_service/main.py` → `api/main.py`.
2. Move all routers under `api/routers/`.
3. `api/main.py` imports ONLY from `domain/` and `tools/` (never `core/providers/langchain` directly except via `core/factory`).
4. Update `pyproject.toml` entrypoint to `api.main:app`.

**Acceptance:** `bun run agent:dev` boots; `curl http://localhost:8000/health` returns 200.

**Risks:** Router path drift. Mitigation: compare OpenAPI schema before/after; require zero diff except version bump.

---

### Phase 9 — Integration & Regression
**Goal:** Full test suite green.
**Tasks:**
1. Run full test suite: `bun run agent:test` (or equivalent).
2. Fix any import loops, missing stubs, or type errors.
3. Verify `core/types.py` is the single source of truth: `rg "from core.types import" src/ | wc -l` should be high; zero duplicate type definitions elsewhere.
4. File size check: `find src/domain src/api src/tools -name '*.py' -exec wc -l {} + | awk '$1 > 500 {print}'` should return empty.

**Acceptance:** All tests green; lint/type check passes; no file >500 LOC.

**Risks:** Integration-only bugs. Mitigation: run smoke tests against Docker compose stack (`bun run docker:dev`).

---

### Phase 10 — Delete Legacy
**Goal:** Remove `src/agent_service/` entirely.
**Tasks:**
1. `rm -rf src/agent_service/`.
2. Remove all temporary shims from Phases 3–8.
3. Final verification commands:
   ```bash
   rg -n 'agent_service' --type py
   # ^ must return empty
   pytest
   # ^ all green
   bun run agent:dev
   # ^ boots cleanly
   ```

**Acceptance:** Commands above succeed.

**Risks:** Hidden runtime dependency on old module path. Mitigation: grep for string `agent_service` in non-Python files (`*.toml`, `*.yaml`, `*.json`) too.

---

## Final Verification Checklist
- [ ] `rg -n 'agent_service' --type py` returns empty.
- [ ] Full test suite (`pytest`) passes.
- [ ] `bun run agent:dev` boots cleanly; health check 200.
- [ ] No Python file in `src/domain/`, `src/api/`, `src/tools/` exceeds 500 LOC.
- [ ] `core/types.py` is the only shared type definition (no duplicates).
- [ ] OpenAPI schema diff vs main branch: zero endpoint changes (except version bump).
- [ ] Docker compose smoke test (`bun run docker:dev`) passes.
- [ ] Document copilot v2 resume test (start in old code, finish in new) passes.

## Rollback Plan
If integration/regression (Phase 9) fails catastrophically:
1. Revert branch to Phase 8 tag.
2. Keep `src/agent_service/` in tree (skip Phase 10).
3. Merge feature branch with both old and new coexisting; run dual-stack until next sprint.
