# Phase 0 — Branch & Scaffolding

## Objective
Create the feature branch and skeleton directory structure that all subsequent phases will build into. No business logic — just directories, `__init__.py` files, and verification that the tree matches the target layout from `MIGRATION_PLAN.md`.

## Commands
```bash
# From project root
bun run agent:install          # install dependencies if needed
bun run agent:build            # verify current state compiles
```

## Tasks

### Task 0.1 — Create Feature Branch
```bash
git checkout -b migration/agent-service-removal
```

### Task 0.2 — Create Skeleton Directories
```bash
mkdir -p src/domain/{planning,orchestration,agents}
mkdir -p src/infra
mkdir -p src/api/routers
mkdir -p src/tools/builtin/documents
mkdir -p src/core/providers/{langchain,opencode,github_copilot}
mkdir -p tests/{core,domain/{planning,orchestration,agents},tools/documents,api,infra}
```

### Task 0.3 — Create `__init__.py` Files
Create empty `__init__.py` files in every new directory:
- `src/domain/__init__.py`
- `src/domain/planning/__init__.py`
- `src/domain/orchestration/__init__.py`
- `src/domain/agents/__init__.py`
- `src/infra/__init__.py`
- `src/api/__init__.py`
- `src/api/routers/__init__.py`
- `src/tools/builtin/documents/__init__.py`
- `src/core/providers/__init__.py`
- `src/core/providers/langchain/__init__.py`
- `src/core/providers/opencode/__init__.py`
- `src/core/providers/github_copilot/__init__.py`
- `tests/core/__init__.py`
- `tests/domain/__init__.py`
- `tests/domain/planning/__init__.py`
- `tests/domain/orchestration/__init__.py`
- `tests/domain/agents/__init__.py`
- `tests/tools/__init__.py`
- `tests/tools/documents/__init__.py`
- `tests/api/__init__.py`
- `tests/infra/__init__.py`

### Task 0.4 — Create `src/core/providers/__init__.py` with Registry Exports
The existing `core/factory.py` imports from `core.providers`. Create the module-level registry exports:

```python
"""Provider registry — concrete implementations register themselves here."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from telaios.core.agent import Agent
    from telaios.core.orchestrator import Orchestrator
    from telaios.core import RAG, Retriever

AGENT_REGISTRY: dict[str, type[Agent]] = {}
ORCHESTRATOR_REGISTRY: dict[str, type[Orchestrator]] = {}
RETRIEVER_REGISTRY: dict[str, type[Retriever]] = {}
RAG_REGISTRY: dict[str, type[RAG]] = {}


def register_provider(
        framework: str,
        *,
        agent_cls: type[Agent] | None = None,
        orchestrator_cls: type[Orchestrator] | None = None,
        retriever_cls: type[Retriever] | None = None,
        rag_cls: type[RAG] | None = None,
) -> None:
    """Register a framework's concrete implementations."""
    if agent_cls is not None:
        AGENT_REGISTRY[framework] = agent_cls
    if orchestrator_cls is not None:
        ORCHESTRATOR_REGISTRY[framework] = orchestrator_cls
    if retriever_cls is not None:
        RETRIEVER_REGISTRY[framework] = retriever_cls
    if rag_cls is not None:
        RAG_REGISTRY[framework] = rag_cls
```

## Acceptance Criteria
- [x] `git branch` shows `migration/agent-service-removal` as current branch
- [x] All directories listed in Tasks 0.2 exist
- [x] All `__init__.py` files from Task 0.3 exist
- [x] `python -c "from core.providers import AGENT_REGISTRY; print('OK')"` succeeds
- [x] `bun run agent:build` passes (no import errors from new structure)

## Status: COMPLETE

## Risks
- **None** — this is purely structural.

## Files Touched
- `src/domain/__init__.py` (create)
- `src/domain/planning/__init__.py` (create)
- `src/domain/orchestration/__init__.py` (create)
- `src/domain/agents/__init__.py` (create)
- `src/infra/__init__.py` (create)
- `src/api/__init__.py` (create)
- `src/api/routers/__init__.py` (create)
- `src/tools/builtin/documents/__init__.py` (create)
- `src/core/providers/__init__.py` (create)
- `src/core/providers/langchain/__init__.py` (create)
- `src/core/providers/opencode/__init__.py` (create)
- `src/core/providers/github_copilot/__init__.py` (create)
- `tests/core/__init__.py` (create)
- `tests/domain/__init__.py` (create)
- `tests/domain/planning/__init__.py` (create)
- `tests/domain/orchestration/__init__.py` (create)
- `tests/domain/agents/__init__.py` (create)
- `tests/tools/__init__.py` (create)
- `tests/tools/documents/__init__.py` (create)
- `tests/api/__init__.py` (create)
- `tests/infra/__init__.py` (create)

## Verification
```bash
git branch | grep migration/agent-service-removal
find src/domain src/infra src/api src/core/providers -name '__init__.py' | wc -l
# Should show 12+ files
python -c "from core.providers import AGENT_REGISTRY; print('OK')"
```
