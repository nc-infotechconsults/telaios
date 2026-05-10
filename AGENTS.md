# Agents.md

## Project layout

This repo is being migrated from a Bun monorepo (data-api + agent-service) to a single Python/FastAPI monolith (`server/`) plus an existing TypeScript frontend (`frontend/`). See `SPEC-MIGRATION.md`, `PLAN-MIGRATION.md`, `TASKS-MIGRATION.md` for the migration design and roadmap.

```
telaios/
  server/        # Python 3.14 / FastAPI monolith (uv-managed)  ← active
  frontend/     # TypeScript / React frontend (untouched)
  data-api/     # legacy TS backend — being ported into server/
  agent-service/# legacy Python service — being ported into server/
```

When working in a subproject, read its own `AGENTS.md` for project-specific guidance.

## Setup commands

```bash
# Server (Python)
cd server && uv sync

# Frontend (TS)
cd frontend && bun install
```

## Development commands

```bash
# Server
cd server && uv run uvicorn telaios.main:app --reload --port 8000

# Frontend
cd frontend && bun run dev

# Infrastructure (postgres, redis, minio)
docker compose -f docker-compose.dev.yml up
```

## Quality gates (server)

Every server change must pass:

```bash
cd server
uv run ruff check . && uv run ruff format --check .
uv run mypy src/telaios
uv run lint-imports
uv run pytest
```

## Project guideline

- Every project should have a README.md file with a brief description of the project and instructions on how to use it.
- Use semantic versioning for project releases.
- Keep the codebase clean and organized.
- Use AGENTS.md in the subdirectory if available to get more insight about the project scope.
- Write clear and concise commit messages using the following convention:
  - feat: for new features
  - fix: for bug fixes
  - docs: for documentation changes
  - style: for code style changes (e.g., formatting, linting)
  - refactor: for code refactoring without changing functionality
  - test: for adding or updating tests
  - chore: for other changes that don't modify src or test files (e.g., build scripts, dependencies)

## Migration status

Phase 0 (scaffolding) complete: empty `server/` package tree, tooling configured. The legacy `data-api/` and `agent-service/` directories remain in place until Phase 10 cleanup. The Bun monorepo root (`package.json`, `bun.lock`, `packages/`) is also being phased out — DO NOT add new code there.
