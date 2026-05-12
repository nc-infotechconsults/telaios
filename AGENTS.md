# Agents.md

## Project layout

TelaiOS is a Python/FastAPI monolith (`server/`) plus a TypeScript/React frontend (`frontend/`).

```
telaios/
  server/        # Python 3.14 / FastAPI monolith (uv-managed)  ← active
  frontend/      # TypeScript / React frontend (npm + Vite)
  tests/         # Root smoke tests
  docs/          # Design documents, specs, and decision records
```

When working in a subproject, read its own `AGENTS.md` for project-specific guidance.

## Setup commands

```bash
# Server (Python)
cd server && uv sync

# Frontend (TS)
cd frontend && npm ci
```

## Development commands

```bash
# Server
cd server && uv run uvicorn telaios.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev

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

## Project guidelines

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
