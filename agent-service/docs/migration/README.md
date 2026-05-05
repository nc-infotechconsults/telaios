# Agent Service Migration — Phase Implementation Guide

## Overview

This directory contains detailed implementation documents for each phase of the agent-service migration. The migration removes `src/agent_service/` and rebuilds all functionality in `src/` using vendor-agnostic abstractions from `src/core/` and `src/tools/`.

## Quick Reference

| Phase | Title | Files | Estimated Effort | Status |
|-------|-------|-------|------------------|--------|
| 0 | Branch & Scaffolding | 21 `__init__.py` files | 15 min | ✅ DONE |
| 1 | Core Interrupt & Checkpoint | 6 files | 1 hour | ✅ DONE |
| 2 | Core Factory (LLM Dedup) | 6 files | 1.5 hours | ✅ DONE |
| 3 | Document Tools (Conversion) | 3 files | 1 hour | ✅ DONE |
| 4 | Document Tools (Chunk/Embed/Extract) | 14 files | 2 hours | ✅ DONE |
| 5 | Planning Service Rebuild | 10 files | 2 hours | ✅ DONE |
| 6 | Orchestration Layer | 9 files | 2 hours | ✅ DONE |
| 7 | Document Copilot v2 | 5+ files | 2 hours | ✅ DONE |
| 8 | API Transport Isolation | 10 files | 1.5 hours | ✅ DONE |
| 9 | Integration & Regression | Various | 2 hours | ✅ DONE |
| 10 | Delete Legacy | Cleanup | 30 min | ✅ DONE |

## Execution Order

Phases must be executed in order. Each phase has explicit acceptance criteria that must be met before proceeding.

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
   ↓         ↓         ↓         ↓         ↓         ↓
 scaffold  interrupt  factory   convert   chunk/ex  planning
           checkpt   dedup     doc tools tractors   rebuild
```

```
Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10
   ↓         ↓         ↓         ↓          ↓
orchestr  copilot   API iso  integrate  delete
  ation     v2      transport  test     legacy
```

## For Agents

When implementing a phase:

1. **Read the phase document** — Each `PHASE_N.md` contains:
   - Objective
   - Commands to run
   - Detailed tasks with code snippets
   - Acceptance criteria
   - Risks and mitigations
   - Files touched
   - Verification commands

2. **Follow the spec-driven workflow**:
   - Read the phase spec
   - Implement tasks one at a time
   - Run verification commands after each task
   - Ensure all acceptance criteria are met before proceeding

3. **Use the right tools**:
   - `core/` for vendor-agnostic abstractions
   - `core/providers/langchain/` for LangGraph-specific implementations
   - `domain/` for business logic (zero framework imports)
   - `tools/` for builtin tool implementations
   - `api/` for FastAPI transport layer
   - `infra/` for infrastructure (settings, crypto, redis, etc.)

4. **Respect boundaries**:
   - Files ≤ 500 LOC
   - `core/types.py` is single source of truth for shared types
   - No `import langgraph` in `domain/` or `tools/`
   - No direct `core/providers/langchain` imports in `domain/` or `tools/`

## Key Architectural Decisions

1. **Checkpoint storage**: Reuse existing LangGraph Postgres tables (zero data migration)
2. **HITL interrupt**: Generalized in `core/` with LangGraph impl under providers
3. **v1 Document Copilot**: Full delete, no deprecation shim
4. **Two-step execution**: PlannerAgent + Orchestrator (no LangGraph state machines in domain code)
5. **Vendor isolation**: Libs only in `core/providers/**` and `infra/**`

## Common Patterns

### Creating a New Provider

```python
# core/providers/myframework/agent.py
from core.agent import Agent
from core.providers import register_provider

class MyFrameworkAgent(Agent):
    async def run(self, input): ...
    async def astream(self, input): ...

register_provider("myframework", agent_cls=MyFrameworkAgent)
```

### Using the Factory

```python
from core.factory import create_agent
from core.types import AgentConfig, LLMConfig

agent = create_agent(AgentConfig(
    framework="langchain",
    llm=LLMConfig(provider="openai", model="gpt-4o"),
))
```

### Domain Code Pattern

```python
# domain/my_feature/service.py
from core.agent import Agent  # ABC only
from core.checkpoint import Checkpointer  # ABC only
from core.interrupt import InterruptHandle  # ABC only

class MyService:
    def __init__(self, agent: Agent, checkpointer: Checkpointer):
        self._agent = agent
        self._checkpointer = checkpointer
```

## Troubleshooting

### Import Errors
- Check that `__init__.py` files exist in all directories
- Verify `pyproject.toml` package discovery settings
- Run `bun run agent:install` to ensure dependencies are installed

### Test Failures
- Check for path changes in imports
- Verify mock objects match new interfaces
- Run individual tests with `pytest -v` for detailed output

### File Size Violations
- Split large files into smaller modules
- Move prompt templates to separate files
- Extract helper functions into utility modules

## Related Documents

- `MIGRATION_PLAN.md` — High-level migration plan
- `docs/migration/PHASE_0.md` through `PHASE_10.md` — Detailed phase specs
