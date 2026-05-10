# Plan: Monolith Migration (`data-api` + `agent-service` → `server`)

> **Status:** READY FOR APPROVAL — companion to `SPEC-MIGRATION.md` (approved).
> **Owner:** Nico
> **Created:** 2026-05-10

---

## Overview

Execute the migration described in `SPEC-MIGRATION.md` as **11 phases of vertically-sliced work**, each ending in a checkpoint. The build is bottom-up on the dependency graph (foundation → cross-cutting → modules → cleanup), but each module phase is itself a vertical slice (models → repository → service → router → tests) so the system stays in a working state.

Big-bang cutover. No parallel running of old and new. Frontend will break mid-migration and be unblocked at the very end.

---

## Architecture Decisions (recap from spec)

- **Single `server/` Python monolith** at the repo root next to `frontend/`.
- **Flat, module-based** layout under `src/telaios/modules/`. No tier split.
- **Module facade rule**: cross-module imports go through `modules.<x>` / `.service` / `.schemas` only. Enforced by import-linter in CI.
- **SQLAlchemy models live centrally** in `db/models/` so Alembic sees one metadata graph.
- **Single Alembic baseline** generated from metadata after all models are ported.
- **Direct in-process calls** replace `httpx` between agent and data.
- **Port 8000**. **PyJWT + bcrypt direct + structlog**.
- **Port everything**: docker, k8s, helm services and the `dockerShell` WebSocket are all preserved (Python equivalents).

---

## Dependency Graph

```
       ┌──────────────────────────────────────┐
       │  Phase 0: repo scaffolding           │
       │  (uv project, dirs, pre-commit, CI)  │
       └──────────────┬───────────────────────┘
                      │
       ┌──────────────▼───────────────────────┐
       │  Phase 1: shared foundations         │
       │  config, db session, base mixins,    │
       │  logging, errors, auth primitives,   │
       │  infra clients (s3/redis/docker/k8s/ │
       │  helm/embeddings/events/jobs/sse)    │
       └──────────────┬───────────────────────┘
                      │
       ┌──────────────▼───────────────────────┐
       │  Phase 2: all SQLAlchemy models      │
       │  (one folder, one Alembic baseline)  │
       └──────────────┬───────────────────────┘
                      │
       ┌──────────────▼───────────────────────┐
       │  Phase 3: agent core + tools         │
       │  (relocated wholesale from           │
       │   agent-service; minimal edits)      │
       └──────────────┬───────────────────────┘
                      │
       ┌──────────────▼───────────────────────┐
       │  Phase 4: auth + users + workspaces  │
       │  (smallest vertical slice; proves    │
       │  the module pattern end-to-end)      │
       └──────────────┬───────────────────────┘
                      │
       ┌──────────────▼───────────────────────┐
       │  Phase 5: project graph              │
       │  projects → members → agents →       │
       │  repositories → environments →       │
       │  settings → library → agent_profiles │
       └──────────────┬───────────────────────┘
                      │
       ┌──────────────▼───────────────────────┐
       │  Phase 6: planning & execution       │
       │  plans → tasks → messages →          │
       │  orchestration → chat                │
       └──────────────┬───────────────────────┘
                      │
       ┌──────────────▼───────────────────────┐
       │  Phase 7: documents domain           │
       │  documents → folders/tags/versions/  │
       │  comments/activities/favorites/      │
       │  templates → extraction → copilot →  │
       │  document_llm → skills               │
       └──────────────┬───────────────────────┘
                      │
       ┌──────────────▼───────────────────────┐
       │  Phase 8: tail modules               │
       │  analytics, docker_shell (WS),       │
       │  internal, health                    │
       └──────────────┬───────────────────────┘
                      │
       ┌──────────────▼───────────────────────┐
       │  Phase 9: compose + frontend wiring  │
       │  docker-compose unification,         │
       │  frontend env update, smoke boot     │
       └──────────────┬───────────────────────┘
                      │
       ┌──────────────▼───────────────────────┐
       │  Phase 10: cleanup                   │
       │  delete data-api/, agent-service/,   │
       │  packages/, root Bun manifests       │
       └──────────────┬───────────────────────┘
                      │
       ┌──────────────▼───────────────────────┐
       │  Phase 11: split-deploy proof + docs │
       └──────────────────────────────────────┘
```

Phase ordering is strict. Within a module-heavy phase (5, 6, 7) some modules can be parallelized — see "Parallelization" below.

---

## Phase-by-Phase Plan

### Phase 0 — Repo scaffolding

**Goal:** empty but valid `server/` Python project + CI hooks. No business logic.

**Tasks:**
- **0.1** Create `server/` skeleton: `pyproject.toml` (uv), `uv.lock`, `Dockerfile`, `README.md`, `AGENTS.md`, `alembic.ini`, `.python-version`, `.dockerignore`.
- **0.2** Create `src/telaios/__init__.py`, `main.py` (empty `create_app()`), and the full directory tree under §4 of the spec (empty `__init__.py` everywhere).
- **0.3** Add dev tooling: `ruff`, `mypy`, `pytest`, `pytest-asyncio`, `testcontainers[postgres]`, `httpx` (test client), `import-linter`, `pre-commit`.
- **0.4** Define `pyproject.toml` optional groups: `docker`, `k8s`, `agents`, `documents` (for future slim deploys).
- **0.5** CI: GitHub Actions workflow `server-ci.yml` running `uv sync`, `ruff check`, `mypy`, `pytest`, `lint-imports`.
- **0.6** Configure `import-linter` contracts per §7 spec: module encapsulation + no upward deps from `core/tools/infra/db/auth/utils`.
- **0.7** Update root `AGENTS.md`: add `server/` commands; remove obsolete monorepo commands.

**Acceptance:**
- [ ] `cd server && uv sync` succeeds.
- [ ] `uv run pytest` runs (zero tests, exit 0).
- [ ] `uv run ruff check .` passes.
- [ ] `uv run lint-imports` passes (empty contracts pass trivially).
- [ ] CI workflow runs green on PR.
- [ ] Pre-commit hook runs ruff + mypy on staged files.

**Files touched:** `server/**`, `.github/workflows/server-ci.yml`, root `AGENTS.md`.
**Scope:** M.
**Depends on:** none.

---

### Phase 1 — Shared foundations

**Goal:** every cross-cutting primitive exists and is importable, but no module uses them yet.

**Tasks:**
- **1.1** `config/settings.py`: pydantic-settings with one consolidated env schema (DB URL, Redis URL, S3 creds, JWT secret, internal API key, log level, port, embedding provider, etc.). Add `.env.example` at repo root.
- **1.2** `config/logging.py`: structlog JSON config; respects `LOG_LEVEL`.
- **1.3** `db/session.py`: async engine, `async_sessionmaker`, FastAPI `get_session` dependency.
- **1.4** `db/base.py`: `Base = DeclarativeBase`, `TimestampMixin`, `SoftDeleteMixin` (port semantics from TypeORM equivalents).
- **1.5** `utils/errors.py`: custom exception hierarchy (`AppError`, `NotFound`, `Forbidden`, `Conflict`, `ValidationError`) + global FastAPI exception handler.
- **1.6** `utils/ids.py`, `utils/crypto.py` (encrypt/decrypt for secrets at rest; port from `data-api/src/utils/crypto.ts`).
- **1.7** `auth/password.py`: bcrypt hash/verify.
- **1.8** `auth/jwt.py`: PyJWT encode/decode + token claims dataclass.
- **1.9** `auth/internal_api_key.py`: constant-time compare for `INTERNAL_API_KEY` header.
- **1.10** `auth/middleware.py`: `current_user` dep, `require_project_access(project_id)`, `require_system_role(role)`.
- **1.11** `infra/redis.py`, `infra/s3.py`, `infra/embeddings.py`, `infra/events.py`, `infra/jobs.py`, `infra/sse.py` — port from agent-service where applicable; stub where data-api had them.
- **1.12** `infra/docker.py` — Python wrapper around `docker` SDK; surface methods the routes use (containers list/start/stop/exec/logs).
- **1.13** `infra/kubernetes.py` — `kubernetes` async client wrapper.
- **1.14** `infra/helm.py` — subprocess to `helm` CLI via `asyncio.create_subprocess_exec`; methods: install/upgrade/list/uninstall.
- **1.15** Wire `main.py`: build app, mount global error handler, mount middleware order from spec, healthcheck endpoint `/health` (returns `{"status":"ok"}`).
- **1.16** Smoke test: `tests/unit/test_app_boots.py` does `from telaios.main import create_app; assert create_app()` and hits `/health`.

**Acceptance:**
- [ ] App boots: `uv run uvicorn telaios.main:app --port 8000` then `GET /health` → 200.
- [ ] `uv run pytest` shows app-boot smoke test passing.
- [ ] All infra modules importable (no side effects at import time).
- [ ] `import-linter` still passes.

**Files touched:** ~25 files under `src/telaios/{config,db,auth,utils,infra}/`, `main.py`, `tests/unit/test_app_boots.py`, `.env.example`.
**Scope:** L (split into 1.1–1.16 sub-tasks during IMPLEMENT).
**Depends on:** Phase 0.

#### Checkpoint after Phase 1
- [ ] App boots, `/health` 200.
- [ ] Lints + smoke test pass in CI.
- [ ] **Human review:** confirm settings schema before binding code to it.

---

### Phase 2 — All SQLAlchemy models + Alembic baseline

**Goal:** every entity from `data-api/src/entities/*.entity.ts` exists as a SQLAlchemy 2 model in `db/models/`, and one Alembic revision creates the schema from empty.

**Tasks:**
- **2.1** Map each TypeORM entity to a SQLAlchemy model (28 entities). Mirror column types, nullability, defaults, indices, FKs, soft-delete columns, JSONB columns, pgvector column on `DocumentChunk`.
- **2.2** Set up Alembic: `alembic/env.py` reads metadata from `telaios.db.models`, uses async migration runner.
- **2.3** Generate initial revision: `alembic revision --autogenerate -m "initial schema"`. Hand-review for diff against TypeORM DDL.
- **2.4** Verify roundtrip: `alembic upgrade head` from empty DB → schema is functionally equivalent (column types, indices, FKs) to current TypeORM-managed DB. Spot-check via `\d+` in psql.
- **2.5** Pin pgvector dimension on `DocumentChunk` after inspecting current TS entity.
- **2.6** Add `tests/integration/test_migrations.py`: spins up testcontainers postgres, runs `alembic upgrade head`, asserts key tables exist.

**Acceptance:**
- [ ] `db/models/__init__.py` re-exports all 28 models.
- [ ] `alembic upgrade head` succeeds on empty DB (verified by integration test).
- [ ] `alembic downgrade base` also succeeds.
- [ ] No model imports anything from `modules/`.
- [ ] `lint-imports` passes.

**Files touched:** ~30 model files under `db/models/`, `alembic/env.py`, `alembic/versions/<hash>_initial_schema.py`, 1 test.
**Scope:** L.
**Depends on:** Phase 1.

#### Checkpoint after Phase 2
- [ ] Migration applies from empty DB in CI (testcontainers).
- [ ] **Human review:** diff the generated DDL vs. previous TypeORM-managed schema; flag any drift.

---

### Phase 3 — Relocate agent core + tools

**Goal:** move `agent-service/src/telaios/{core,tools}` into `server/src/telaios/{core,tools}` with minimal edits — just update import paths to the new package root.

**Tasks:**
- **3.1** Copy `agent-service/src/telaios/core/` → `server/src/telaios/core/`. Update imports.
- **3.2** Copy `agent-service/src/telaios/tools/` → `server/src/telaios/tools/`. Update imports.
- **3.3** Identify and **delete** `agent-service/src/telaios/infra/data_client.py` — do not port. Note all call sites; they will be rewired in later phases via module facades. For now, leave them as `# TODO: rewire to <module>.service` to keep the build green via stubs, OR comment out the call sites if minimal.
- **3.4** Port relevant `agent-service/src/telaios/infra/*` that aren't already in Phase 1 (events, jobs, sse if not yet ported).
- **3.5** Port existing `agent-service/tests/` for core + tools verbatim into `server/tests/unit/core/` and `server/tests/unit/tools/`. Update import paths only.

**Acceptance:**
- [ ] All ported tests in `tests/unit/core` and `tests/unit/tools` pass.
- [ ] No file in `core/` or `tools/` imports from `modules/` or `db/models/`.
- [ ] `data_client.py` is gone; references are TODO-stubbed and tracked in a follow-up sweep list.
- [ ] `lint-imports` passes.

**Files touched:** ~120 files relocated, ~5 imports rewritten across them.
**Scope:** L.
**Depends on:** Phase 1 (uses `infra/`, `config/`).

#### Checkpoint after Phase 3
- [ ] Agent core unit tests green.
- [ ] **Human review:** confirm the `data_client.py` TODO list before proceeding — these are the wires we must reconnect through module facades.

---

### Phase 4 — Auth + users + workspaces (first vertical slice)

**Goal:** prove the module pattern end-to-end on the smallest meaningful slice. After this phase, a user can register, log in, and create a workspace via the new server.

**Tasks:**
- **4.1** `modules/users/`: `repository.py`, `service.py`, `schemas.py`, `router.py`, `__init__.py`. Ports `data-api` users controller + service.
- **4.2** Auth endpoints (register/login/refresh) live in `modules/users/router.py` (or split into `modules/auth/` if size warrants — decide during implement).
- **4.3** `modules/workspaces/` full slice.
- **4.4** Port unit tests:
  - `tests/unit/modules/users/test_schemas.py` (from `data-api/.../schemas/user.schema.test.ts`)
  - `tests/unit/modules/users/test_service.py`
  - `tests/unit/modules/workspaces/test_*.py`
  - `tests/unit/auth/test_middleware.py` (from `requireSystemRole`, `requireProjectAccess`, `authenticate`)
- **4.5** Port integration tests: `tests/integration/modules/test_users.py`, `test_workspaces.py`, `test_auth.py`.
- **4.6** Register these routers in `main.py`.

**Acceptance:**
- [ ] `POST /auth/register`, `POST /auth/login`, `POST /workspaces`, `GET /workspaces` all return correct status + body shape (parity with TS endpoints).
- [ ] Auth middleware rejects missing/invalid JWT.
- [ ] All Phase 4 unit + integration tests pass.
- [ ] `lint-imports` passes.

**Files touched:** ~20 files across two modules + tests.
**Scope:** L.
**Depends on:** Phases 1, 2.

#### Checkpoint after Phase 4
- [ ] First slice works end-to-end via curl.
- [ ] Test fixtures and factories (`tests/helpers/factories.py`) are reusable.
- [ ] **Human review:** confirm the module-internal file layout (router/service/repository/schemas) feels right before replicating across 20+ modules.

---

### Phase 5 — Project graph

**Goal:** all project-scoped CRUD modules ported with their tests.

**Modules** (each one is its own task; can parallelize within the phase):
- **5.1** `modules/projects/` (incl. `members/`, `agents/` sub-packages)
- **5.2** `modules/repositories/`
- **5.3** `modules/environments/`
- **5.4** `modules/settings/`
- **5.5** `modules/library/` (library agents, MCPs, skills)
- **5.6** `modules/agent_profiles/`

Each task = port controller, service, schema, repository + unit + integration tests + register router in `main.py`.

**Acceptance per module:**
- [ ] Endpoints reachable with parity to TS.
- [ ] Unit + integration tests pass.
- [ ] Cross-module dependencies use only public facades (`from telaios.modules.projects import ProjectService`).

**Phase acceptance:**
- [ ] All 6 modules registered.
- [ ] Combined integration test run green.
- [ ] `lint-imports` passes.

**Scope:** Each module S–M; phase total XL (parallelize).
**Depends on:** Phase 4.

#### Checkpoint after Phase 5
- [ ] Frontend's project-listing flow (if smoke-tested) hits the new server successfully.
- [ ] **Human review:** scan one module of each shape (e.g. `projects` with sub-packages vs. flat `settings`) for boundary violations.

---

### Phase 6 — Planning & execution

**Goal:** the agent runtime + plan/task lifecycle work, including streaming chat.

**Tasks:**
- **6.1** `modules/plans/`: port `data-api` plan CRUD + `agent-service/src/telaios/domain/planning/` orchestration. Merge in one module.
- **6.2** `modules/tasks/`: tasks + artifacts + dependencies + skip-dependents logic.
- **6.3** `modules/messages/`: chat message persistence.
- **6.4** `modules/orchestration/`: drivers, pool, scheduler (from `agent-service/src/telaios/domain/orchestration/`).
- **6.5** `modules/chat/`: interactive chat router (streaming SSE), uses `core/`, `tools/`, `orchestration/`.
- **6.6** Rewire `data_client.py` TODOs from Phase 3 to use these module facades.
- **6.7** Port unit + integration tests for each.

**Acceptance:**
- [ ] `POST /chat/<id>` streams tokens (SSE).
- [ ] Plan execution updates task state in DB.
- [ ] No `httpx` reference in any module's service code (grep target).
- [ ] All tests pass.

**Files touched:** ~40 files.
**Scope:** XL (split into sub-tasks).
**Depends on:** Phases 3, 4, 5.

#### Checkpoint after Phase 6
- [ ] End-to-end agentic loop: create plan → execute → tasks update → chat streams.
- [ ] **Human review:** trace one full agent run; confirm direct calls replaced all old HTTP hops.

---

### Phase 7 — Documents domain

**Goal:** document storage + extraction pipeline + RAG copilot all live on the monolith.

**Tasks:**
- **7.1** `modules/documents/` core CRUD plus sub-packages: `folders/`, `tags/`, `versions/`, `comments/`, `activities/`, `favorites/`, `templates/`.
- **7.2** `modules/document_extraction/`: extraction, conversion, chunking, embedding pipeline. Ports `tools/builtin/documents/*` extraction code and the v2 job endpoints.
- **7.3** `modules/document_copilot/`: Q&A endpoints (v1 and v2) — uses `core/rag.py`, `core/strategies/*`.
- **7.4** `modules/document_llm/`: model picker + config endpoints.
- **7.5** `modules/skills/`: skill management endpoints (CRUD + indexer + executor wiring).
- **7.6** Port `documentCopilot.test.ts` + `documents.test.ts` to pytest integration tests.

**Acceptance:**
- [ ] Upload doc → extract → chunk → embed → query → answer flow works end-to-end.
- [ ] pgvector queries return results.
- [ ] All tests pass.

**Files touched:** ~50 files.
**Scope:** XL.
**Depends on:** Phases 3, 5, 6.

#### Checkpoint after Phase 7
- [ ] Manual smoke: upload PDF, ask a question, get an answer.
- [ ] **Human review:** confirm embedding/vector behaviour matches previous system.

---

### Phase 8 — Tail modules

**Tasks:**
- **8.1** `modules/analytics/`
- **8.2** `modules/docker_shell/`: FastAPI `WebSocket` endpoint replicating `dockerShell.ws.ts` behaviour (resize, write, exit codes); uses `infra/docker.py`.
- **8.3** `modules/internal/`: internal-API-key-protected endpoints (kept for back-compat; cross-module ops should already prefer facades — these are deprecated-but-functional).
- **8.4** `modules/health/`: `/health`, `/ready`, version info.

**Acceptance:**
- [ ] WS shell connects, runs commands, propagates exit code.
- [ ] Analytics endpoints return parity data.
- [ ] All tests pass.

**Scope:** M.
**Depends on:** Phase 5 (for docker_shell project scoping), Phase 1 (for `infra/docker.py`).

#### Checkpoint after Phase 8
- [ ] **Endpoint parity audit**: produce a checklist comparing every TS route to every new Python route; resolve gaps. Block until green.

---

### Phase 9 — Docker Compose + frontend wiring

**Tasks:**
- **9.1** Rewrite `docker-compose.yml`: services = `postgres`, `redis`, `minio`, `server`, `frontend`. Remove `data-api`, `agent-service`.
- **9.2** Confirm `docker-compose.dev.yml` (postgres+redis+minio) unchanged.
- **9.3** Build `server` image, boot full stack.
- **9.4** Update `frontend/` env config: single backend URL (`VITE_API_URL=http://localhost:8000`) replacing dual URLs.
- **9.5** Smoke check: frontend loads, hits health endpoint, login attempt reaches server.

**Acceptance:**
- [ ] `docker compose up --build` succeeds.
- [ ] Frontend serves at its port and reaches server.
- [ ] No requests fail with `ECONNREFUSED` to old services.

**Scope:** S.
**Depends on:** Phases 1–8.

---

### Phase 10 — Cleanup

**Tasks:**
- **10.1** Delete `data-api/`, `agent-service/`, `packages/`, `vllm-modal.py`, root `__pycache__/`.
- **10.2** Delete root `package.json`, `bun.lock`, root `node_modules/`.
- **10.3** Move historical migration docs to `docs/history/`.
- **10.4** Update root `README.md` and `AGENTS.md` to reflect single-server layout.

**Acceptance:**
- [ ] `git status` clean.
- [ ] `find . -name node_modules -not -path "./frontend/*"` returns nothing.
- [ ] `grep -r "data-api\|agent-service" --exclude-dir=docs --exclude-dir=.git` returns nothing actionable.

**Scope:** S.
**Depends on:** Phase 9.

---

### Phase 11 — Split-deploy proof + final docs

**Tasks:**
- **11.1** Implement `create_app(modules: list[str] | None = None)` factory honoring a `TELAIOS_MODULES` env var.
- **11.2** Add `server/README.md` section "Split deployments" demonstrating three example slim configurations (api-core / api-chat / api-documents) per §4 spec table.
- **11.3** Add a CI job that boots each slim profile and runs its health endpoint.

**Acceptance:**
- [ ] `TELAIOS_MODULES=users,workspaces uvicorn telaios.main:app` boots with only those routes mounted.
- [ ] Docs explain how to add a new module to a slim profile.
- [ ] CI green for all profiles.

**Scope:** M.
**Depends on:** Phase 10.

#### Final checkpoint
- [ ] All 10 success criteria from spec §8 are true.
- [ ] **Human approval to merge.**

---

## Parallelization

**Execution model:** sequential, single agent session per phase (Claude Sonnet 4.6). The "parallel-safe" annotations below are kept for reference only — they describe *theoretical independence*, not how the work will be run.

| Phase | Independent units exist? | Execution order |
|---|---|---|
| 0, 1, 2 | No | Sequential. |
| 3 | Yes (core / tools) | Sequential. |
| 4 | No | Sequential. |
| 5 | Yes (6 modules) | Sequential, one module at a time. |
| 6 | Yes (plans / tasks / messages first, then orchestration / chat) | Sequential. |
| 7 | Yes (documents core first, then extraction / copilot / document_llm / skills) | Sequential. |
| 8 | Yes (4 small modules) | Sequential. |
| 9, 10, 11 | No | Sequential. |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| TypeORM → SQLAlchemy schema drift (column types, defaults, JSONB nuances). | High | Phase 2 mandates a diff against current schema before approval; pgvector dim explicit lookup. |
| pgvector + SQLAlchemy + Alembic interactions (autogenerate may miss vector ops/indexes). | High | Hand-verify the autogenerated migration; add manual index DDL if needed. |
| `data_client.py` removal in Phase 3 breaks builds before facades exist. | Med | Use TODO-stubs that raise `NotImplementedError("rewire to X.service")`; pytest stays selective until Phase 6. |
| LangChain/LangGraph version compatibility against Python 3.14. | Med | Verify versions in Phase 0; freeze locked versions in `pyproject.toml`. |
| Helm CLI assumption (`helm` on PATH) not present in container. | Med | Add `helm` install step to `Dockerfile`; document `HELM_BIN` env override. |
| Async docker SDK options (`docker` is sync; needs `run_in_executor`). | Med | Wrap blocking calls in `asyncio.to_thread` inside `infra/docker.py`. |
| Frontend broken for the entire migration window (no incremental shipping). | Med | Accepted per spec. Compensate by tagging the pre-migration commit so rollback is one `git checkout` away. |
| 17 integration tests not 1:1 translatable (Jest patterns, Bun-specific helpers). | Med | Build `tests/helpers/factories.py` early (Phase 4); reuse across all module phases. |
| Scope creep mid-migration ("while I'm here let me also…"). | Med | Boundaries §7 spec: never touch frontend, never change schema semantics. |
| Module-boundary violations creeping in unnoticed. | Low | `import-linter` runs in CI from Phase 0 onward. |
| pre-existing data-api unit tests use Sinon/Jest mocks that don't translate cleanly. | Low | When mocks are LOC-heavy, prefer rewriting the test against real DB via testcontainers rather than emulating mocks. |

---

## Checkpoint Strategy

Hard human review gates: after Phase 1, 2, 3, 4, 6, 7, 8 (parity audit), and 11 (final).
Soft self-review: after every module in Phases 5/6/7 (`lint-imports`, `pytest`, manual curl).

---

## Estimation summary

| Phase | Size |
|---|---|
| 0 — Scaffolding | M |
| 1 — Foundations | L |
| 2 — Models + Alembic | L |
| 3 — Agent core/tools relocation | L |
| 4 — Users/workspaces slice | L |
| 5 — Project graph (×6 modules) | XL (parallelizable) |
| 6 — Planning & execution | XL |
| 7 — Documents domain | XL |
| 8 — Tail modules | M |
| 9 — Compose + frontend | S |
| 10 — Cleanup | S |
| 11 — Split-deploy proof | M |

Phases 5/6/7 dominate the work. Everything else is comparatively small.

---

## What this plan deliberately defers to TASKS phase

- The exact 1:1 controller → router mapping table (27 controllers).
- The exact 1:1 entity → model mapping table (28 entities) with column-level review.
- The exact integration-test port checklist (17 suites).
- Concrete `pyproject.toml` dependency list with pinned versions.
- Sub-task breakdown inside the XL phases (5/6/7) — each module becomes its own checklist when its turn comes.

---

## Approval Checklist (must be ✅ before TASKS phase starts)

- [ ] Phase ordering agreed.
- [ ] Parallelization assumptions agreed.
- [ ] Risk list complete (add any I missed).
- [ ] Checkpoint cadence acceptable.
- [ ] Module-by-module pace acceptable (no preference for one big push).
