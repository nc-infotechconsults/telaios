# Migration History

This directory contains historical documents from the monolith migration (`data-api` + `agent-service` → `server/`).

## Completed Migration

The migration was completed in May 2026. The two-backend split (TypeScript `data-api` + Python `agent-service`) was collapsed into a **single Python/FastAPI monolith** (`server/`).

### Migration Phases

| Phase | Title | Status |
|-------|-------|--------|
| 0 | Branch & Scaffolding | ✅ DONE |
| 1 | Core Interrupt & Checkpoint | ✅ DONE |
| 2 | Core Factory (LLM Dedup) | ✅ DONE |
| 3 | Document Tools (Conversion) | ✅ DONE |
| 4 | Document Tools (Chunk/Embed/Extract) | ✅ DONE |
| 5 | Planning Service Rebuild | ✅ DONE |
| 6 | Orchestration Layer | ✅ DONE |
| 7 | Document Copilot v2 | ✅ DONE |
| 8 | API Transport Isolation | ✅ DONE |
| 9 | Integration & Regression | ✅ DONE |
| 10 | Delete Legacy | ✅ DONE |

### Key Outcomes

- **Single deployment unit**: One `server` container exposes all HTTP endpoints
- **One language**: Python 3.14 + FastAPI + LangGraph
- **Direct in-process calls**: No more HTTP overhead between services
- **Unified toolchain**: uv for Python, Bun for frontend
- **Clean architecture**: Domain-based modules under `server/src/telaios/modules/`

## Historical Specs

The `specs/` subdirectory contains design documents for features that were implemented during the migration:

- `agent-library.md` — Agent Library design (replacing AgentProfile)
- `docker-detail-panels.md` + `-plan.md` — Docker resource detail panels and volume file browser
- `docker-fullstack-improvement.md` + `-plan.md` — Full-stack Docker improvements
- `docker-panel-actions.md` + `-plan.md` — Docker panel actions
- `environment-docker-redesign.md` + `-plan.md` — Environment Docker redesign
- `k8s-resource-explorer.md` + `-plan.md` — Kubernetes resource explorer

These are kept for reference but are no longer active specs.

## Related Documents

- `data_client_rewire.md` — Checklist for rewiring legacy data client calls
- `endpoint_parity.md` — Endpoint parity audit between old and new services
- `STRATEGIES.md` — RAG strategies and document tools comparison
