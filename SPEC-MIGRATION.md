# Spec: Monolith Migration (`data-api` + `agent-service` → `server`)

> **Status:** READY FOR APPROVAL — all open questions resolved. Approve to advance to PLAN phase.
> **Owner:** Nico
> **Created:** 2026-05-10

---

## 1. Objective

Collapse the two-backend split (TypeScript `data-api` + Python `agent-service`) into a **single Python/FastAPI monolith** named `server/`, sitting next to `frontend/`. Remove the Bun-managed monorepo root.

**Why:**
- Eliminate cross-process HTTP overhead between `agent-service` and `data-api` (replaced by direct in-process calls).
- One language, one toolchain, one deployment unit. Lower cognitive load and ops surface.
- The agent layer (LangChain/LangGraph) is already Python and is the active development frontier. Pulling persistence into Python removes a translation layer.

**Users / consumers:**
- The `frontend/` SPA (only external consumer).
- Operators running `docker compose`.

**Success looks like:**
- One container `server` exposes all current HTTP endpoints from both backends, on a single port.
- All current `data-api` integration tests have a pytest equivalent that passes against the new server.
- All current `agent-service` tests still pass.
- Agent code calls services/repositories directly — `httpx` round-trips between agent and data layer are gone.
- Frontend can be pointed at the new server (URL changes are acceptable; breaking changes acceptable per user direction).
- `bun.lock`, root `package.json`, root `node_modules/`, `packages/`, `data-api/` and `agent-service/` directories are deleted.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | Python 3.14 | Already pinned in `agent-service/pyproject.toml` |
| Web framework | FastAPI ≥0.115 | Already in use |
| ASGI server | uvicorn[standard] | Already in use |
| Package manager | **uv** | `uv.lock` already present; `pip`/Poetry not used |
| ORM | **SQLAlchemy 2.x (async)** + asyncpg | Replaces TypeORM |
| Migrations | **Alembic** | Replaces TypeORM migrations; baseline = current schema, generated fresh (no data preserved) |
| Validation | **Pydantic v2** | Replaces Zod |
| Auth | **PyJWT** + **bcrypt** (direct) | Replaces `jsonwebtoken` + `bcryptjs` |
| Logging | **structlog** or stdlib `logging` w/ JSON formatter | Replaces pino. Decision: **structlog** (pick once, no second guess) |
| S3 | aioboto3 | Already in use |
| Redis | redis-py async | Already in use |
| Docker SDK | `docker` (docker-py) | Replaces `dockerode` |
| Kubernetes SDK | `kubernetes` (official client) | Replaces `@kubernetes/client-node` |
| Helm | `helm` CLI invoked via `asyncio.create_subprocess_exec` | Replaces in-process npm helm wrapper |
| WebSockets | FastAPI native `WebSocket` | Replaces `ws` |
| LLM / Agent | LangChain 1.x + LangGraph 1.x | Unchanged |
| Embeddings | fastembed, voyage | Unchanged |
| Document parsing | pymupdf, python-docx, openpyxl, etc. | Unchanged |
| Testing | pytest, pytest-asyncio, httpx (TestClient) | Replaces Jest + supertest |
| Test DB | testcontainers-python (Postgres) **or** docker-compose-managed test DB | Decision: **testcontainers-python** for integration; sqlite-in-memory not viable due to `pgvector` + `jsonb` |
| Frontend | Untouched | Keeps its own `package.json` / Bun |

---

## 3. Commands

All commands run from the **repo root** (no Bun root anymore).

```bash
# Setup
uv sync --all-extras --dev                              # install server deps
(cd frontend && bun install)                            # install frontend deps

# Development
uv run uvicorn telaios.main:app --reload --port 8000    # run server
(cd frontend && bun run dev)                            # run frontend
docker compose -f docker-compose.dev.yml up -d          # postgres + redis + minio

# Database
uv run alembic upgrade head                             # apply migrations
uv run alembic revision --autogenerate -m "msg"         # create migration

# Testing
uv run pytest -v                                        # all tests
uv run pytest tests/unit -v                             # unit only
uv run pytest tests/integration -v                      # integration (needs containers)
uv run pytest -k <pattern>                              # filtered

# Quality
uv run ruff check .                                     # lint
uv run ruff format .                                    # format
uv run mypy src/                                        # types

# Build / run
docker compose up --build                               # full stack
uv run telaios-server                                   # via entry point
```

---

## 4. Project Structure

### Organizing principle

**Flat, domain/feature-based modules.** No "data vs. agent" tier split. Each top-level module under `src/telaios/modules/` is a **vertical slice** of one business capability — its own routers, services, repositories, schemas, and models live together. This is the unit that can be carved out into a separate deployable later (e.g. one container running only `projects`, another running only `chat` + `agents`).

Shared concerns (DB models that span multiple modules, auth, infra clients, agent core, tools) live in cross-cutting packages: `core/`, `tools/`, `infra/`, `db/`, `auth/`.

### Module boundary rules

1. A module **owns** its routers, services, repositories, and Pydantic schemas.
2. A module **may import** from: any module's *public service* (`module.service`), `db/`, `core/`, `tools/`, `infra/`, `auth/`, `utils/`, `config/`.
3. A module **MUST NOT** import another module's `repository`, `router`, or internal helpers — only its `service` facade.
4. SQLAlchemy ORM models live centrally in `db/models/` (shared schema) — they are not per-module, because FKs cross modules and Alembic needs a single metadata.
5. Each module exposes a single `router` object via `module/__init__.py` and a single `service` facade. `main.py` composes routers; modules pick their dependencies at construction time.

This makes a future split mechanical: run a `main.py` that registers only the modules you want, in a Dockerfile that installs only their transitive dependencies (via `pyproject.toml` optional groups).

### Layout

```
telaios/
├── frontend/                            # untouched
├── server/                              # ← the unified backend
│   ├── pyproject.toml                   # optional-dependency groups per module (for slim deploys)
│   ├── uv.lock
│   ├── alembic.ini
│   ├── Dockerfile
│   ├── README.md
│   ├── AGENTS.md
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── src/telaios/
│   │   ├── __init__.py
│   │   ├── main.py                      # app factory; composes module routers
│   │   │
│   │   ├── config/
│   │   │   ├── settings.py              # pydantic-settings (single unified env)
│   │   │   └── logging.py
│   │   │
│   │   ├── db/                          # shared persistence layer
│   │   │   ├── session.py               # async engine, sessionmaker, get_session
│   │   │   ├── base.py                  # Base, TimestampMixin, SoftDeleteMixin
│   │   │   └── models/                  # ALL SQLAlchemy models (Alembic single source)
│   │   │       ├── __init__.py
│   │   │       ├── user.py
│   │   │       ├── workspace.py
│   │   │       ├── project.py
│   │   │       ├── project_member.py
│   │   │       ├── project_agent.py
│   │   │       ├── plan.py
│   │   │       ├── task.py
│   │   │       ├── task_artifact.py
│   │   │       ├── task_dependency.py
│   │   │       ├── task_repository.py
│   │   │       ├── message.py
│   │   │       ├── repository.py
│   │   │       ├── environment.py
│   │   │       ├── settings.py
│   │   │       ├── helm_release.py
│   │   │       ├── library_agent.py
│   │   │       ├── library_mcp.py
│   │   │       ├── library_skill.py
│   │   │       ├── library_skill_file.py
│   │   │       ├── document.py
│   │   │       ├── document_chunk.py
│   │   │       ├── document_folder.py
│   │   │       ├── document_tag.py
│   │   │       ├── document_version.py
│   │   │       ├── document_comment.py
│   │   │       ├── document_activity.py
│   │   │       ├── document_favorite.py
│   │   │       └── document_template.py
│   │   │
│   │   ├── auth/                        # shared auth (JWT, password hashing, current_user)
│   │   │   ├── jwt.py
│   │   │   ├── password.py
│   │   │   ├── middleware.py            # authenticate, require_project_access, require_system_role
│   │   │   └── internal_api_key.py
│   │   │
│   │   ├── core/                        # agent/LLM core (used by chat, document_copilot, planning, etc.)
│   │   │   ├── llm.py
│   │   │   ├── agent.py
│   │   │   ├── orchestrator.py
│   │   │   ├── factory.py
│   │   │   ├── checkpoint.py
│   │   │   ├── interrupt.py
│   │   │   ├── fusion.py
│   │   │   ├── rag.py
│   │   │   ├── reranker.py
│   │   │   ├── retriever_bm25.py
│   │   │   ├── graph_store.py
│   │   │   ├── types.py
│   │   │   ├── providers/               # langchain, neo4j, networkx, voyage, cross_encoder, github_copilot, opencode
│   │   │   └── strategies/              # simple, hybrid, agentic, graph, crag, self_rag
│   │   │
│   │   ├── tools/                       # agent tools (used only by agent-driven modules)
│   │   │   ├── registry.py
│   │   │   ├── types.py
│   │   │   ├── builtin/                 # file_tools, shell_tools, finish_tools, review, test_runner, documents/, agent_tools
│   │   │   ├── mcp/                     # adapter, client
│   │   │   └── skill/                   # adapter, executor, indexer, loader, packager, parser, registry, types, validator
│   │   │
│   │   ├── infra/                       # cross-cutting external clients
│   │   │   ├── s3.py
│   │   │   ├── redis.py
│   │   │   ├── docker.py                # docker SDK wrapper (was dockerode)
│   │   │   ├── kubernetes.py            # k8s client wrapper
│   │   │   ├── helm.py
│   │   │   ├── embeddings.py
│   │   │   ├── events.py
│   │   │   ├── jobs.py
│   │   │   └── sse.py
│   │   │
│   │   ├── utils/
│   │   │   ├── crypto.py
│   │   │   ├── errors.py                # custom exception hierarchy + FastAPI handlers
│   │   │   ├── logger.py
│   │   │   └── ids.py
│   │   │
│   │   └── modules/                     # one folder per business capability (deployable unit)
│   │       │
│   │       ├── users/                   # users + auth endpoints (auth merged here per 2026-05-10 decision)
│   │       │   ├── __init__.py          # exports `router`, `service` (facade)
│   │       │   ├── router.py            # /users + /auth/{register,login,refresh,me}
│   │       │   ├── service.py
│   │       │   ├── repository.py
│   │       │   └── schemas.py
│   │       │
│   │       ├── workspaces/
│   │       │   └── ... (router, service, repository, schemas)
│   │       │
│   │       ├── projects/                # projects, members, agents (project-scoped)
│   │       │   ├── __init__.py
│   │       │   ├── router.py
│   │       │   ├── service.py
│   │       │   ├── repository.py
│   │       │   ├── schemas.py
│   │       │   ├── members/             # sub-package if useful
│   │       │   │   ├── router.py
│   │       │   │   ├── service.py
│   │       │   │   └── repository.py
│   │       │   └── agents/
│   │       │       ├── router.py
│   │       │       ├── service.py
│   │       │       └── repository.py
│   │       │
│   │       ├── repositories/            # git repos (entity), not the data-access pattern
│   │       │   └── ...
│   │       │
│   │       ├── environments/
│   │       │   └── ...
│   │       │
│   │       ├── settings/
│   │       │   └── ...
│   │       │
│   │       ├── library/                 # library agents / mcps / skills (reusable assets)
│   │       │   └── ...
│   │       │
│   │       ├── agent_profiles/
│   │       │   └── ...
│   │       │
│   │       ├── plans/                   # plan CRUD + execution lifecycle
│   │       │   ├── router.py
│   │       │   ├── service.py           # incl. planning orchestration (was domain/planning)
│   │       │   ├── repository.py
│   │       │   ├── schemas.py
│   │       │   ├── prompts.py
│   │       │   ├── parser.py
│   │       │   └── session.py
│   │       │
│   │       ├── tasks/                   # tasks + artifacts + dependencies + skip-dependents
│   │       │   ├── router.py
│   │       │   ├── service.py
│   │       │   ├── repository.py
│   │       │   ├── schemas.py
│   │       │   └── artifacts/
│   │       │       └── ...
│   │       │
│   │       ├── messages/                # chat message persistence
│   │       │   └── ...
│   │       │
│   │       ├── chat/                    # interactive agent chat (uses core/, tools/)
│   │       │   ├── router.py            # streaming SSE endpoints
│   │       │   ├── service.py
│   │       │   └── schemas.py
│   │       │
│   │       ├── orchestration/           # agent driver pool + scheduler (was domain/orchestration)
│   │       │   ├── drivers.py
│   │       │   ├── pool.py
│   │       │   ├── scheduler.py
│   │       │   └── service.py
│   │       │
│   │       ├── documents/               # document CRUD + folders + tags + versions + comments + activities + favorites + templates
│   │       │   ├── __init__.py
│   │       │   ├── router.py
│   │       │   ├── service.py
│   │       │   ├── repository.py
│   │       │   ├── schemas.py
│   │       │   ├── folders/
│   │       │   ├── tags/
│   │       │   ├── versions/
│   │       │   ├── comments/
│   │       │   ├── activities/
│   │       │   ├── favorites/
│   │       │   └── templates/
│   │       │
│   │       ├── document_extraction/     # extraction + chunking + embedding pipeline (jobs)
│   │       │   ├── router.py            # was documents_v2_jobs.py + documents_v2.py
│   │       │   ├── service.py
│   │       │   ├── extraction.py        # was tools/builtin/documents/extraction.py
│   │       │   ├── conversion.py
│   │       │   ├── chunking.py          # + base/semantic/structural
│   │       │   ├── embedding.py
│   │       │   ├── analysis.py
│   │       │   ├── processing.py
│   │       │   └── schemas.py
│   │       │
│   │       ├── document_copilot/        # Q&A / RAG over documents
│   │       │   ├── router.py            # both v1 and v2 copilot endpoints
│   │       │   ├── service.py           # was domain/agents/document_copilot.py + document_assistant.py
│   │       │   └── schemas.py
│   │       │
│   │       ├── document_llm/            # LLM model picker / config exposed to UI (documents_v2_llm + _models)
│   │       │   └── ...
│   │       │
│   │       ├── skills/                  # skill management endpoints (was api/routers/skills.py)
│   │       │   └── ...
│   │       │
│   │       ├── analytics/
│   │       │   └── ...
│   │       │
│   │       ├── docker_shell/            # docker WS shell (was data-api/src/websocket/dockerShell.ws.ts)
│   │       │   └── router.py            # FastAPI WebSocket
│   │       │
│   │       ├── containers/              # docker container CRUD/control endpoints (standalone per 2026-05-10 decision)
│   │       │   ├── __init__.py
│   │       │   ├── router.py            # was data-api/src/controllers/docker.controller.ts
│   │       │   ├── service.py           # delegates to infra/docker.py
│   │       │   └── schemas.py
│   │       │
│   │       ├── internal/                # internal API (cross-module ops formerly behind INTERNAL_API_KEY)
│   │       │   └── router.py            # NOTE: ideally these calls go through service facades now;
│   │       │                            # endpoints kept for backward compat during migration only
│   │       │
│   │       └── health/
│   │           └── router.py
│   │
│   └── tests/
│       ├── conftest.py                  # DB fixtures (testcontainers), HTTP client, factories
│       ├── unit/
│       │   └── modules/<name>/...
│       ├── integration/
│       │   └── modules/<name>/...       # ported from data-api/__tests__/integration
│       └── helpers/
│           ├── db.py
│           └── factories.py
│
├── docker-compose.yml                   # postgres, redis, minio, server, frontend
├── docker-compose.dev.yml               # postgres, redis, minio only
├── docs/
├── README.md
├── AGENTS.md
└── .env.example
```

### Split-deployment strategy (per user requirement #5, revised)

Future split deployments are sliced **by module(s)**, not by tier. Examples:

| Deployable | Modules included |
|---|---|
| `api-core` (project & plan management) | `users`, `workspaces`, `projects`, `repositories`, `environments`, `settings`, `library`, `agent_profiles`, `plans`, `tasks`, `messages`, `analytics`, `health` |
| `api-chat` (interactive agent runtime) | `chat`, `orchestration`, `messages`, `plans` (read), `tasks` (write), `health` + `core/`, `tools/` |
| `api-documents` (extraction + Q&A) | `documents`, `document_extraction`, `document_copilot`, `document_llm`, `skills`, `health` + `core/`, `tools/` |
| `api-monolith` (default for now) | all of the above |

Mechanism:
- `main.py` exposes a `create_app(modules: list[str] | None = None)` factory.
- Each module's `__init__.py` exports `router` (FastAPI `APIRouter`) and optional `lifespan_hooks`.
- `pyproject.toml` declares optional dependency groups per heavy module (e.g. `documents`, `agents`) so slim deployments install slim dependencies via `uv sync --extra=...`.
- The `db/models/` package stays shared (Alembic + FKs are global), but a slim deploy still works fine — unused models are simply not queried.

**No import-linter rule needed for "data vs. agent" anymore.** Replaced by a simpler rule:

**Enforced by `import-linter`:**
- `modules.X` may import from `core`, `tools`, `infra`, `db`, `auth`, `utils`, `config`, and from `modules.Y.service` / `modules.Y.schemas` / `modules.Y.__init__`.
- `modules.X` MUST NOT import `modules.Y.repository` or `modules.Y.router` (preserves module encapsulation).
- `core`, `tools`, `infra`, `db`, `auth`, `utils` MUST NOT import from `modules.*` (no upward dependencies).

---

## 5. Code Style

### Naming
- `snake_case` for files, variables, functions, module names.
- `PascalCase` for classes (SQLAlchemy models, Pydantic schemas).
- Module folder name = plural business noun (e.g. `projects/`, `documents/`, `plans/`).
- Inside each module: `router.py`, `service.py`, `repository.py`, `schemas.py` (no entity prefix — the module name already scopes it).
- Sub-modules use the same four-file convention inside their folder.
- SQLAlchemy model files live in `db/models/` and are named after the entity (`project.py`, `task.py`).
- Schemas inside `schemas.py` export `<Entity>Create`, `<Entity>Update`, `<Entity>Read`.
- Test files: `test_<unit>.py` mirroring `modules/<name>/` layout under `tests/`.

### Type annotations
Always. No untyped `def`. Run `mypy src/` in CI.

### Example: a typical module (`projects`)

**Model — `db/models/project.py`:**
```python
from __future__ import annotations

from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, TimestampMixin, SoftDeleteMixin


class Project(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    workspace_id: Mapped[str] = mapped_column(
        String, ForeignKey("workspaces.id"), nullable=False
    )
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    workspace: Mapped["Workspace"] = relationship(back_populates="projects")
```

**Schemas — `modules/projects/schemas.py`:**
```python
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict


class ProjectCreate(BaseModel):
    name: str
    workspace_id: str
    metadata: dict[str, Any] = {}


class ProjectUpdate(BaseModel):
    name: str | None = None
    metadata: dict[str, Any] | None = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    workspace_id: str
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime
```

**Repository — `modules/projects/repository.py`:**
```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.project import Project


class ProjectRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, project_id: str) -> Project | None:
        stmt = select(Project).where(
            Project.id == project_id,
            Project.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, project: Project) -> Project:
        self.session.add(project)
        await self.session.flush()
        return project
```

**Service — `modules/projects/service.py`:**
```python
import uuid
from telaios.db.models.project import Project
from telaios.modules.projects.repository import ProjectRepository
from telaios.modules.projects.schemas import ProjectCreate


class ProjectService:
    def __init__(self, repo: ProjectRepository) -> None:
        self.repo = repo

    async def create_project(self, data: ProjectCreate) -> Project:
        project = Project(id=str(uuid.uuid4()), **data.model_dump())
        return await self.repo.create(project)
```

**Router — `modules/projects/router.py`:**
```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.middleware import current_user
from telaios.db.session import get_session
from telaios.modules.projects.repository import ProjectRepository
from telaios.modules.projects.schemas import ProjectCreate, ProjectRead
from telaios.modules.projects.service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(
    body: ProjectCreate,
    session: AsyncSession = Depends(get_session),
    user=Depends(current_user),
) -> ProjectRead:
    service = ProjectService(ProjectRepository(session))
    project = await service.create_project(body)
    return ProjectRead.model_validate(project)
```

**Module facade — `modules/projects/__init__.py`:**
```python
from telaios.modules.projects.router import router
from telaios.modules.projects.service import ProjectService

__all__ = ["router", "ProjectService"]
```

**Cross-module use (example: `chat` reading a project):**
```python
# modules/chat/service.py
from telaios.modules.projects import ProjectService          # ✅ public facade
from telaios.modules.projects.repository import ProjectRepository  # ❌ forbidden
```

### Conventions inherited from `data-api/AGENTS.md`
- UUIDs stored as `varchar` (not native `uuid` type) — keeps schema identical to current.
- Long text → `Text`. JSON → `JSONB`.
- All entities **soft-deleted** via `deleted_at` timestamp; default queries filter it out.
- All inputs validated by Pydantic at the router boundary.
- Data integrity / consistency guardrails live in services, not routers.

### Logging
Structured JSON logs via `structlog`, configured once in `main.py`. No `print()`.

### Errors
Custom exception hierarchy in `utils/errors.py` (e.g. `NotFoundError`, `ValidationError`, `ForbiddenError`); FastAPI exception handlers map them to HTTP statuses centrally.

---

## 6. Testing Strategy

| Layer | Framework | Location | DB? | What's covered |
|---|---|---|---|---|
| Unit | pytest | `server/tests/unit/` | No | Pure functions, schemas, services with mocked repos, agent prompt formatting, crypto |
| Integration | pytest + testcontainers (Postgres+pgvector) | `server/tests/integration/` | Yes | Full HTTP → router → service → repo → DB round-trips. One Postgres container reused across tests via session-scoped fixture; per-test transaction rollback. |
| Agent | pytest | `server/tests/integration/agent/` | Mocked LLM | Existing `agent-service/tests/` ported verbatim (paths only). |

**Conventions:**
- One Postgres container per pytest session (`testcontainers-python`).
- `conftest.py` provides: `engine`, `session` (rollback per test), `client` (httpx `AsyncClient` against ASGI app), `auth_headers`, factories.
- Factories live in `tests/helpers/factories.py` (1:1 port of `data-api/__tests__/helpers/factories.ts`).
- LLM is mocked with a fake provider; no real API calls in CI.
- `pytest -m integration` marker for DB tests; default `pytest` runs unit only (fast feedback).

**Coverage expectation:** at least every endpoint that has a Jest test today has a passing pytest equivalent. Numeric coverage target deferred to Phase 9.

---

## 7. Boundaries

### Always do
- Run `uv run pytest` before committing.
- Add an Alembic migration whenever a model changes.
- Validate every request body with a Pydantic schema.
- Soft-delete (set `deleted_at`); never `DELETE` rows.
- Use UUID strings, stored as `varchar`.
- Filter `deleted_at IS NULL` in repository queries by default.
- Run requests through middleware in this order: error handler → body size limit → auth → route.
- Pin every new dependency in `pyproject.toml`.
- Enforce module-boundary rules (see §4): a module imports another module only via its public facade (`modules.<other>` / `.service` / `.schemas`), never its `repository` or `router`. `core/`, `tools/`, `infra/`, `db/`, `auth/`, `utils/` never import from `modules.*`. Enforced by import-linter in CI.

### Ask first
- Adding a new top-level module under `src/telaios/`.
- Changing the public HTTP contract on an endpoint that frontend still uses (even though breaking changes are allowed in this migration, we still want the human to know).
- Adding a new third-party dependency.
- Changing Alembic baseline strategy.
- Touching anything inside `frontend/`.
- Modifying CI workflows.

### Never do
- Commit secrets, `.env` files, or real credentials.
- Use synchronous DB calls (must be `async`/`await`).
- `print()` — use the logger.
- Hardcode connection strings; everything via `config/settings.py`.
- Skip writing a test for a ported endpoint "because the TS version had no test" — at minimum add a smoke test.
- Keep `bun.lock`, `package.json` at the repo root after Phase 10.
- Resurrect `httpx`-based intra-process calls between agent code and data persistence. Cross-module communication is direct Python (service facade → service facade).
- Edit any existing TypeORM migration file (they will be deleted, not preserved).

---

## 8. Success Criteria

The migration is **done** when *all* of the following are true:

1. **Single deployable.** `docker compose up` starts only one app container (`server`) plus `postgres`, `redis`, `minio`, `frontend`. No `data-api`, no `agent-service` containers.
2. **Endpoint parity.** Every endpoint previously served by `data-api` or `agent-service` is reachable on the new server, returning equivalent responses for equivalent inputs. (Tracked in a checklist in Phase 6.)
3. **Test parity.** Every `data-api/__tests__/integration/*.test.ts` file has a passing `tests/integration/test_*.py` counterpart. All existing `agent-service/tests/` pass unchanged (only import paths updated).
4. **No HTTP between modules.** `grep -r "httpx" src/telaios/modules/ src/telaios/core/ src/telaios/tools/` returns zero in-process data-access calls. `infra/data_client.py` is deleted.
5. **Migrations apply cleanly.** `alembic upgrade head` from empty DB produces a schema functionally equivalent to the previous TypeORM schema (column types, indices, FKs, soft-delete columns).
6. **Repo cleanup.** Root `package.json`, `bun.lock`, `node_modules/`, `packages/`, `data-api/`, `agent-service/`, `vllm-modal.py`, `__pycache__/` at root are removed (or appropriately relocated). Frontend retains its own `package.json`.
7. **CI green.** Lint (`ruff`), types (`mypy`), unit + integration tests all pass in CI.
8. **Docs updated.** Root `README.md`, `AGENTS.md`, and `server/README.md` reflect the new layout. Old `MIGRATION_PLAN.md` files inside `agent-service` are archived under `docs/history/` or deleted.
9. **Split-deployment proof.** A README section in `server/` demonstrates how to run `data-only` or `agent-only` variants (even if not wired into compose).
10. **Frontend boots** against the new server (env vars updated). UI does not need to function perfectly — breaking changes will be addressed separately — but the app must load.

---

## 9. Resolved Decisions

All previously-open questions are now locked. Listed here for the record:

1. **JWT library:** **PyJWT** (simpler API, well-maintained).
2. **Password hashing:** **`bcrypt`** directly (passlib is unmaintained).
3. **pgvector usage in `DocumentChunk`:** mirror current column with `pgvector.sqlalchemy.Vector(<dim>)`. Exact `<dim>` to be read from the existing entity during Phase 2 (model porting) — no design decision left, only a lookup.
4. **Migrations baseline:** one initial Alembic revision auto-generated from SQLAlchemy metadata; per-feature migrations from that point on.
5. **Docker / Kubernetes / Helm services:** **port all three fully** to Python (`docker` SDK, `kubernetes` client, Helm via subprocess to `helm` CLI). Routes preserved. Lives under `infra/docker.py`, `infra/kubernetes.py`, `infra/helm.py`, consumed by the relevant modules (`environments`, `library` helm-release endpoints, `docker_shell`).
6. **WebSocket endpoints:** **keep `dockerShell`**, port to FastAPI native `WebSocket`. Lives under `modules/docker_shell/router.py`.
7. **Server port:** **8000** (matches current agent-service; frontend env will be updated).
8. **Old `agent-service/docs/migration/*` and historical docs:** move to `docs/history/` at repo root; do not delete (cheap to keep, useful for archaeology).

---

## 10. Out of Scope

- Adding new features.
- Frontend changes (will be handled in a follow-up after migration is merged).
- Performance tuning beyond removing the HTTP hop.
- Changing the database schema semantics (column rename, type changes, normalization).
- Switching cloud providers, container runtimes, or CI systems.
- Redesigning the auth model (JWT, roles, internal API key stay).
- Production observability (metrics, tracing) — separate spec.

---

## Approval Checklist (must be ✅ before PLAN phase starts)

- [ ] Objective and scope agreed.
- [ ] Tech stack choices confirmed (esp. structlog, PyJWT, bcrypt, testcontainers).
- [ ] Project structure approved.
- [ ] Code style example acceptable.
- [ ] Testing strategy acceptable.
- [ ] Boundaries acceptable (Always / Ask first / Never).
- [ ] Success criteria are the right bar.
- [ ] Open questions reviewed (answers can come in PLAN phase).
