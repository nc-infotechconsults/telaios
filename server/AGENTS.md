# Agents.md — server/

Guidance for AI coding agents working in `server/` (Python 3.14 / FastAPI monolith).

See `../SPEC-MIGRATION.md` for the full design.

## Setup

```bash
cd server
uv sync
```

## Development

```bash
uv run uvicorn telaios.main:app --reload --port 8000
```

## Quality gates

Run all of these before finishing any task:

```bash
uv run ruff check . && uv run ruff format --check .
uv run mypy src/telaios
uv run lint-imports
uv run pytest
```

## Module boundary rules (enforced by import-linter)

- `modules.X` may import: `core`, `tools`, `infra`, `db`, `auth`, `utils`, `config`, and `modules.Y` only via its public facade (`modules.Y` / `.service` / `.schemas` / `__init__`). NEVER `modules.Y.repository` or `modules.Y.router`.
- `core`, `tools`, `infra`, `db`, `auth`, `utils`, `config` MUST NOT import from `modules.*`.

If you need to break a rule, the design is wrong — refactor or escalate.

## Per-module file convention

```
modules/<name>/
  __init__.py     # public facade: re-exports `router`, `service`
  router.py       # FastAPI APIRouter
  service.py      # use cases (orchestrates repository + infra)
  repository.py   # DB-only (SQLAlchemy)
  schemas.py      # Pydantic request/response models
```

## Commit message convention

Follow root `AGENTS.md` (feat/fix/docs/style/refactor/test/chore).
