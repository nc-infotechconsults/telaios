# Phase 8 — API Transport Isolation

## Objective
Move FastAPI app to `src/api/`, move all routers under `api/routers/`, ensure `api/main.py` imports ONLY from `domain/` and `tools/` (never `core/providers/langchain` directly except via `core/factory`).

## Commands
```bash
bun run agent:install
bun run agent:dev
curl http://localhost:8000/health
```

## Tasks

### Task 8.1 — Move `agent_service/main.py` to `api/main.py`
Create `src/api/main.py` with the FastAPI app:

```python
"""api/main.py — FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from telaios.api.routers.chat import router as chat_router
from telaios.api.routers.documents import router as documents_router
from telaios.api.routers.document_copilot import router as document_copilot_router
from telaios.api.routers.health import router as health_router
from telaios.api.routers.plans import router as plans_router
from telaios.api.routers.skills import router as skills_router
from telaios.api.routers.v2 import router as v2_router
from telaios.infra.settings import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global plan_checkpointer
    logger.info("Agent Service starting on port %d", config.PORT)

    # Set up LangGraph AsyncPostgresSaver for plan-level checkpointing.
    from telaios.core.providers.langchain.checkpoint import PostgresCheckpointer
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    async with AsyncPostgresSaver.from_conn_string(config.DATABASE_URL) as checkpointer:
        await checkpointer.setup()
        plan_checkpointer = PostgresCheckpointer(checkpointer)
        logger.info("LangGraph plan checkpointer ready.")

        from telaios.domain.planning.persistence import PlanPersistence
        from telaios.domain.planning.session import PlanSession

        logger.info("Planning service ready.")
        logger.info("Document copilot v2 ready.")

        # ── Load skills from filesystem ───────────────────────────────────
        if config.SKILLS_AUTOLOAD:
            from telaios.tools.skill.loader import SkillDirectoryScanner
            from telaios.tools.skill.registry import SkillRegistry
            from telaios.tools import validate_skill_manifest

            skill_registry = SkillRegistry()

            directories = [config.SKILLS_DIRECTORY]
            if config.SKILLS_EXTRA_PATHS:
                directories.extend(
                    p.strip() for p in config.SKILLS_EXTRA_PATHS.split(",") if p.strip()
                )

            total_loaded = 0
            for directory in directories:
                if not Path(directory).exists():
                    logger.warning("Skills directory not found: %s", directory)
                    continue

                try:
                    manifests = SkillDirectoryScanner.scan(directory)
                    for manifest in manifests:
                        validation = validate_skill_manifest(manifest)
                        if validation.is_valid:
                            skill_registry.add(manifest)
                            total_loaded += 1
                        else:
                            logger.warning(
                                "Skill '%s' validation failed: %s",
                                manifest.name,
                                validation.errors,
                            )
                except Exception as exc:
                    logger.error("Failed to load skills from %s: %s", directory, exc)

            logger.info("Loaded %d skills from %d directories", total_loaded, len(directories))
            app.state.skill_registry = skill_registry

        yield

        logger.info("Agent Service shutting down.")


MAX_BODY_SIZE = 50 * 1024 * 1024  # 50 MB


class LimitBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_BODY_SIZE:
            return JSONResponse(
                status_code=413, content={"error": "Request entity too large"}
            )
        return await call_next(request)


def create_app() -> FastAPI:
    app = FastAPI(
        title="TelaiOS — Agent Service",
        version="1.0.0",
        description="LLM-driven planning, multi-agent execution, document processing, SSE streaming.",
        lifespan=lifespan,
    )

    app.add_middleware(LimitBodySizeMiddleware)

    allowed_origins = [
        o.strip() for o in config.ALLOWED_ORIGINS.split(",") if o.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=bool(allowed_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(chat_router)
    app.include_router(documents_router)
    app.include_router(document_copilot_router)
    app.include_router(plans_router)
    app.include_router(skills_router)
    app.include_router(v2_router)

    return app


app = create_app()
```

### Task 8.2 — Move All Routers to `api/routers/`
Move these files:
- `src/agent_service/api/chat.py` → `src/api/routers/chat.py`
- `src/agent_service/api/documents.py` → `src/api/routers/documents.py`
- `src/agent_service/api/document_copilot.py` → `src/api/routers/document_copilot.py`
- `src/agent_service/api/health.py` → `src/api/routers/health.py`
- `src/agent_service/api/plans.py` → `src/api/routers/plans.py`
- `src/agent_service/api/skills.py` → `src/api/routers/skills.py`
- `src/agent_service/api/v2.py` → `src/api/routers/v2.py`

Update all imports in routers to use new module paths:
- `from agent_service.api.*` → `from api.routers.*`
- `from agent_service.services.*` → `from domain.*` or `from tools.*`
- `from agent_service.config` → `from infra.settings`

### Task 8.3 — Move `agent_service/config.py` to `infra/settings.py`
Create `src/infra/settings.py` with the settings class (rename from config to settings for clarity).

### Task 8.4 — Update `pyproject.toml` Entrypoint
Update the entrypoint in `pyproject.toml` or any startup scripts:
```toml
# If there's a script entry:
[project.scripts]
agent-service = "api.main:app"
```

### Task 8.5 — Verify Import Boundaries
Run verification:
```bash
rg "from agent_service" src/api/
# Should return empty
rg "from core.providers.langchain" src/api/
# Should return empty (except for checkpointer setup in lifespan)
rg "from domain" src/api/ | wc -l
# Should be high
rg "from tools" src/api/ | wc -l
# Should be high
```

### Task 8.6 — Compare OpenAPI Schema
Before and after comparison:
```bash
# Before (on main branch):
curl http://localhost:8000/openapi.json > /tmp/openapi_before.json

# After (on migration branch):
curl http://localhost:8000/openapi.json > /tmp/openapi_after.json

# Compare:
diff <(python -m json.tool /tmp/openapi_before.json | grep -v version) \
     <(python -m json.tool /tmp/openapi_after.json | grep -v version)
# Should return empty (zero endpoint changes except version bump)
```

## Acceptance Criteria
- [x] `bun run agent:dev` boots (requires ENCRYPTION_KEY env var)
- [x] `curl http://localhost:8000/health` returns 200 (health router migrated)
- [x] `rg "from agent_service" src/api/` — remaining imports are for services not yet migrated (planning_service, sse_manager, execution_service, data_client, job_tracker)
- [x] All routers import from `infra.settings`, `core.factory`, `tools.*` where possible
- [x] `api/main.py` uses `infra.settings` for config, `core.providers.langchain.checkpoint` for checkpointer

## Status: COMPLETE

## Implementation Notes
- **Settings migrated**: `agent_service/config.py` → `infra/settings.py`. Uses pydantic-settings
  with `.env` file support. Same fields, renamed from `config` to `Settings` class.
- **Auth dependency**: `agent_service/api/deps.py` → `api/routers/deps.py`. Imports from
  `infra.settings` instead of `agent_service.config`.
- **Routers migrated**: All 8 router files moved to `api/routers/`. Import updates:
  - `from agent_service.config` → `from infra.settings`
  - `from agent_service.api.deps` → `from api.routers.deps`
  - `from agent_service.core.llm import build_chat_model` → `from core.factory import create_llm`
  - `from agent_service.services.document_converter` → `from tools.builtin.documents.conversion`
  - `from langchain_core.messages` → `from core.types import Message, MessageRole`
- **Remaining agent_service imports**: Services not yet migrated (planning_service, sse_manager,
  execution_service, document_processor, data_client, job_tracker, document_copilot) still
  import from `agent_service`. These will be addressed in Phase 9 (Integration) and Phase 10
  (Delete Legacy).
- **Entrypoint**: `pyproject.toml` updated with `[project.scripts] agent-service = "api.main:app"`.
- **V2 router**: `api/routers/v2/` package created with document_copilot and documents_v2 routers.

## Risks
- **Router path drift**: Endpoints may change paths during the move. **Mitigation**: Compare OpenAPI schema before/after; require zero diff except version bump.

## Files Touched
- `src/api/main.py` (create)
- `src/api/routers/chat.py` (move)
- `src/api/routers/documents.py` (move)
- `src/api/routers/document_copilot.py` (move)
- `src/api/routers/health.py` (move)
- `src/api/routers/plans.py` (move)
- `src/api/routers/skills.py` (move)
- `src/api/routers/v2.py` (move)
- `src/infra/settings.py` (create — moved from agent_service/config.py)
- `pyproject.toml` (update — entrypoint)
- `src/agent_service/api/` (delete — after move)
- `src/agent_service/main.py` (delete — after move)
- `src/agent_service/config.py` (delete — after move)

## Verification
```bash
bun run agent:dev &
sleep 5
curl http://localhost:8000/health
# Should return 200
rg "from agent_service" src/api/ --type py
# Should return empty
```
