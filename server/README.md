# telaios-server

Python 3.14 / FastAPI monolith — API, agent runtime, and document processing for TelaiOS.

## Quick start

```bash
cd server
uv sync                    # install deps
uv run alembic upgrade head  # apply DB migrations

# Start infrastructure (PostgreSQL, Redis, Chroma, MinIO)
docker compose -f ../docker-compose.dev.yml up -d

uv run uvicorn telaios.main:app --reload --port 8000
```

When the Docker Chroma server is running, `RagManager` auto-detects it via
`CHROMA_HOST` and uses `HttpClient` for persistent storage. Otherwise it
falls back to an ephemeral in-memory client.

```bash
# Set manually if using a custom host
export CHROMA_HOST=localhost
export CHROMA_PORT=8000
```

## Tooling

```bash
uv run ruff check .         # lint
uv run ruff format .        # format
uv run mypy src/telaios     # type-check
uv run lint-imports         # module-boundary contracts (import-linter)
uv run pytest               # tests (unit + integration)
uv run telaios-eval         # TUI evaluator for RAG capabilities
```

## Layout

```
src/telaios/
  config/        # Pydantic settings + structured logging
  db/            # SQLAlchemy engine, base, models, session, Alembic
  core/          # agent runtime (LangGraph, LLM, RAG strategies, Chroma, reranker, knowledge sources)
  cli/           # Textual TUI (telaios-eval command)
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

## RAG pipeline (Chroma)

The RAG system is backed by Chroma vector store with 6 strategies. The `RagManager` owns
client lifecycle, collection management, and strategy wiring.

```python
from telaios.core import RagManager
from telaios.core.types import RagConfig, RagStrategy, AgentInput, Message, MessageRole
from telaios.core.fake_llm import FakeLLM

manager = RagManager()                              # ephemeral Chroma client
manager.ingest("my-docs", ids=["d1"], documents=["…"])  # legacy API

source = TextSource("paste your knowledge here", title="my-knowledge")
stats = await manager.ingest_from_source(source)    # extracts + embeds + stores

strategy, reason, config = manager.auto_pipeline(   # auto-selects best strategy
    "How do components relate?", corpus_stats=stats
)
pipeline = manager.create_pipeline(config, llm=FakeLLM())
output = await pipeline.answer(
    AgentInput(messages=[Message(role=MessageRole.HUMAN, content="…")])
)
```

### Knowledge sources

| Class | Input | Docs |
|-------|-------|------|
| `TextSource(text)` | Raw text or code | — |
| `FileSource(path, …)` | Local files or directories | Auto-detects .py, .md, .json, .yaml, … |
| `DoclingSource(path)` | PDF, DOCX, PPTX, XLSX, HTML | Parsed via [Docling](https://docling-project.github.io/docling/) → Markdown |
| `URLSource(url)` | Web page URL | Fetches via `httpx`, strips HTML |
| `GitHubSource(repo_url)` | GitHub repo | Fetches via GitHub API |

**Docling** is an optional dependency. Install it with:
```bash
uv sync --extra documents
```

### Auto-strategy selection

`StrategySelector` analyzes corpus characteristics (size, code ratio, source types)
and query intent (factoid, comparison, multi-hop, correction, explanation) to pick
the best strategy:

| Scenario | Strategy |
|----------|----------|
| Code-heavy + explanatory query | `agentic` |
| Mixed source types + factoid | `hybrid` |
| Structured data + multi-hop | `graph` |
| Correction/verification intent | `crag` |
| Small corpus + comparison | `self_rag` |
| Simple factoid, small corpus | `simple` |

## TUI evaluator

```bash
uv run telaios-eval
```

Launches a Textual TUI with tabs for evaluating every RAG strategy against your
own knowledge sources.

**Workflow:**
1. **Sources tab** → pick source type (text / file / URL / GitHub), press `i` to ingest
2. **Auto tab** → type a query, press `r` — the system shows which strategy it picked and why, then runs it
3. **Manual tabs** (Simple, Hybrid, CRAG, Self-RAG, Agentic, Graph, Chat, Code Review) → force a specific strategy

**Controls:** `Tab` between tabs, `r` to run, `i` to ingest (Sources tab), `q` to quit.

If you supply an API key in the config panel, the TUI switches to live LLM calls
(LangChain). Without a key, it uses `FakeLLM` which returns deterministic responses
but exercises the full retrieval pipeline.
