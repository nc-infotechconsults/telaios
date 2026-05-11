# telaios-server

Python 3.14 / FastAPI monolith — API, agent runtime, and document processing for TelaiOS.

## Quick start

```bash
cd server
uv sync                    # install deps
uv run alembic upgrade head  # apply DB migrations
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
  config/        # Pydantic settings + structured logging
  db/            # SQLAlchemy engine, base, models, session, Alembic
  core/          # agent runtime (LangGraph, LLM clients, RAG, reranker)
  tools/         # agent tool registry (file, shell, MCP, skill, document tools)
  infra/         # Docker / k8s / helm / S3 / redis clients
  auth/          # JWT, password hashing, FastAPI dependencies
  utils/         # crypto, errors, ids
  modules/       # one folder per business capability (see Module registry below)
  main.py        # FastAPI app factory (`create_app(modules=None)`)
```

## Module registry

The following module names are registered in `main.py`:

| Name | Routers included |
| --- | --- |
| `users` | `/auth/*`, `/users/*` |
| `workspaces` | `/projects/{id}/workspaces/*`, `/workspaces/*` |
| `projects` | `/projects/*`, `/projects/{id}/members/*`, `/projects/{id}/agents/*` |
| `repositories` | `/repositories/*` |
| `environments` | `/environments/*` |
| `settings` | `/settings/*` |
| `library` | `/library/*` |
| `agent_profiles` | `/agent-profiles/*` |
| `plans` | `/projects/{id}/plans/*`, `/plans/*` |
| `tasks` | `/plans/{id}/tasks/*`, `/tasks/*` |
| `messages` | `/messages/*` |
| `chat` | `/chat/*` |
| `documents` | `/projects/{id}/documents/*`, `/documents/*`, subresource routers |
| `document_extraction` | `/documents/extract/*`, `/document-jobs/*` |
| `document_copilot` | `/document-copilot/*` |
| `skills` | `/skills/*` |
| `health` | `/health`, `/ready`, `/version` |
| `analytics` | `/analytics/*` |
| `internal` | `/internal/*` |
| `containers` | `/containers/*` |
| `docker_shell` | `/docker-shell` (WebSocket) |

## Split deployments

`create_app()` reads the `TELAIOS_MODULES` environment variable (comma-separated module names) to load only a subset of the registry.  When the variable is empty, all modules are loaded.

You can also pass the list directly:

```python
from telaios.main import create_app
app = create_app(modules=["users", "workspaces", "health"])
```

### Example profiles

**`api-core`** — auth + project metadata, no agent/document features:

```bash
TELAIOS_MODULES=users,workspaces,projects,repositories,environments,settings,library,agent_profiles,health
```

Install only the core dependencies:

```bash
uv sync --no-default-groups
```

**`api-chat`** — adds planning and agent execution on top of core:

```bash
TELAIOS_MODULES=users,workspaces,projects,repositories,environments,settings,library,agent_profiles,plans,tasks,messages,chat,health
```

Install with agent extras:

```bash
uv sync --extra agents
```

**`api-documents`** — adds document processing and copilot on top of core:

```bash
TELAIOS_MODULES=users,workspaces,projects,repositories,environments,settings,library,agent_profiles,documents,document_extraction,document_copilot,skills,health
```

Install with document extras:

```bash
uv sync --extra documents
```

## Module boundary rules (enforced by import-linter)

- `modules.X` may import from `modules.Y` only via its public facade (`modules.Y`, `.service`, `.schemas`, `__init__`). **Never** `modules.Y.repository` or `modules.Y.router`.
- `core`, `tools`, `infra`, `db`, `auth`, `utils`, `config` must **not** import from `modules.*`.
