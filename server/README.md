# telaios-server

FastAPI monolith merging the legacy `data-api` (TS/Bun/Express) and `agent-service` (Python/FastAPI) into a single deployable unit.

See `../SPEC-MIGRATION.md`, `../PLAN-MIGRATION.md`, `../TASKS-MIGRATION.md` for the migration design and roadmap.

## Status

Phase 0 (scaffolding) — empty package tree, tooling configured, no business logic ported yet.

## Quick start

```bash
cd server
uv sync                    # install deps
uv run uvicorn telaios.main:app --reload --port 8000
```

## Tooling

```bash
uv run ruff check .         # lint
uv run ruff format .        # format
uv run mypy src/telaios     # type-check
uv run lint-imports         # module-boundary contracts (import-linter)
uv run pytest               # tests
```

## Layout

```
src/telaios/
  config/        # Pydantic settings
  db/            # SQLAlchemy engine, base, models, session
  core/          # agent runtime (LLM clients, prompts, memory) — populated in Phase 6
  tools/         # agent tool registry — populated in Phase 6
  infra/         # Docker / k8s / helm / S3 / redis clients
  auth/          # JWT, password hashing, FastAPI dependencies
  utils/         # crypto, errors, logging, ids
  modules/       # one folder per business capability
  main.py        # FastAPI app factory (`create_app(modules=None)`)
```

See `SPEC-MIGRATION.md` §4 for the full structure and module boundary rules.

## Split deployments

`create_app(modules=[...])` (or env `TELAIOS_MODULES=users,workspaces,...`) loads only the requested modules. See SPEC §4 for example profiles. Phase 11 will validate this.
