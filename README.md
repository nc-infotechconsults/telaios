# Telaios

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![E2E Tests](https://github.com/nc-infotechconsults/telaios/actions/workflows/e2e.yml/badge.svg)](https://github.com/nc-infotechconsults/telaios/actions/workflows/e2e.yml)

**Telaios** is an agentic software development operating system — an all-in-one platform for teams that want to manage the entire software development lifecycle, from planning through execution, with AI agents doing the heavy lifting.

---

## What's Available Today

### Core Platform
- **Project management** — create and manage projects, assign members (owner / editor / viewer roles), and link connected source repositories
- **User authentication** — JWT-based login, role-based access control per project
- **Platform settings** — configure LLM provider, model, API keys, and embedding model through the UI or API

### AI Planning & Execution
- **Interactive planning chat** — chat with a planning agent that reads your connected repos and documents to help define tasks and goals; produces a structured task DAG
- **Multi-agent execution** — orchestrator coordinates specialised agents (developer, reviewer, tester, knowledge, infrastructure) to execute the plan autonomously
- **Human-in-the-loop (HITL)** — agents pause and surface decisions back to the user when they need guidance
- **Real-time streaming** — agent output and plan progress streamed live to the frontend via SSE
- **Custom agent profiles** — define reusable agent specifications (system prompt, LLM config, MCP servers, skills, structured output) in a library; attach profiles to projects

### Agent Capabilities
- **LangGraph-based driver** — multi-step tool-calling loop with configurable LLM (OpenAI or Anthropic), temperature, max tokens, top-p, and penalties
- **Configurable sub-agents** — agent profiles can compose other agent profiles as sub-agents
- **MCP server support** — connect external Model Context Protocol servers and selectively expose tools to specific agents
- **Skills** — reusable callable units agents can invoke during execution

### Documents & Knowledge
- **Document upload and management** — upload PDF, DOCX, XLSX, and plain-text files per project
- **Automated document processing pipeline** — extract → chunk → embed → store in pgvector (384-dimension embeddings via local ONNX or OpenAI)
- **RAG search** — agents query the document store for relevant context during planning and execution
- **Document explorer and viewer** — browse and read project documents in the UI

### Workspaces & Environments
- **Workspace management** — create and manage Git workspaces linked to project repositories
- **Environment management** — define runtime environments for agent execution, including Helm release tracking

### Infrastructure
- **PostgreSQL** (TypeORM) for persistence, pgvector for embeddings
- **Redis** for pub/sub event bus and inter-agent coordination
- **MinIO / S3-compatible** object storage for uploaded documents
- **Docker Compose** for local development and full-stack containerised runs

---

## Repository Layout

| Path | Purpose |
| --- | --- |
| `frontend/` | Vite + React + TypeScript web app |
| `data-api/` | Bun + Express + TypeORM REST API (PostgreSQL) |
| `agent-service/` | Python 3.12 + FastAPI + LangGraph agent runtime |
| `packages/shared/` | Shared JavaScript packages (Bun workspaces) |
| `tests/` | Root smoke / integration tests |
| `docs/` | Design documents, specs, and ideas |

---

## Architecture

```
Browser (React SPA)
    │
    ├─── data-api (Bun / Express / TypeORM)  ← persistence, auth, project metadata
    │        │
    │        └─── PostgreSQL + pgvector
    │
    └─── agent-service (Python / FastAPI / LangGraph)  ← planning, execution, RAG
             │
             ├─── Redis (pub/sub, SSE coordination)
             └─── MinIO / S3 (document storage)
```

The frontend talks to both the data API (REST) and the agent service (SSE + REST). The data API owns all persistence and project metadata. The agent service handles planning, multi-agent orchestration, document processing, and LLM interaction.

---

## Prerequisites

- **Bun** ≥ 1.x — JavaScript workspaces
- **Python 3.12** — `agent-service/`
- **Docker Compose** — local infrastructure (PostgreSQL, Redis, MinIO)

---

## Environment Setup

```bash
cp .env.example .env
```

Fill in the secrets and API keys (LLM provider, API key, encryption key, etc.) before starting the services.

---

## Local Development

### 1. Start local infrastructure

```bash
bun run docker:dev
```

Brings up PostgreSQL, Redis, and MinIO from `docker-compose.dev.yml`.

### 2. Install dependencies

```bash
bun install
bun run apps:install
bun run agent:install
```

### 3. Run the services

Use separate terminals (or a process manager):

```bash
bun run data:dev       # data-api on :3000
bun run agent:dev      # agent-service on :8000 (with --reload)
bun run frontend:dev   # Vite dev server on :5173
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Data API | http://localhost:3000 |
| Agent service | http://localhost:8000 |
| MinIO API | http://localhost:9000 |
| MinIO Console | http://localhost:9001 |

### Full-stack with Docker

```bash
docker compose up --build
```

`docker-compose.yml` starts PostgreSQL, Redis, MinIO, `data-api`, `agent-service`, and `frontend`.

---

## Common Root Commands

| Command | Purpose |
| --- | --- |
| `bun run apps:install` | Install JS workspace dependencies |
| `bun run agent:install` | Install Python agent-service dependencies |
| `bun run data:dev` | Start the data API |
| `bun run agent:dev` | Start the Python agent service (hot-reload) |
| `bun run frontend:dev` | Start the frontend dev server |
| `bun run docker:postgres` | Start only PostgreSQL |
| `bun run docker:redis` | Start only Redis |
| `bun run docker:dev` | Start PostgreSQL, Redis, and MinIO |
| `bun run build` | Build all workspaces and install the Python package |
| `bun run test` | Run the root smoke tests |

---

## Testing

```bash
bun run test                    # root smoke tests
cd data-api && bun run test     # data-api unit tests
bun run agent:test              # Python agent-service tests
cd frontend && bun run test:e2e # Playwright browser E2E tests
```

---

## Roadmap

### Near-term (next milestones)

- **Analytics dashboard** — org-wide and per-project views: task throughput, agent success rates, blocked-task alerts (no schema changes required, derived from existing data)
- **Document activity analytics** — surface which documents were accessed or modified during agent runs
- **AI cost ledger** — token tracking per project and org with model breakdown (new `llm_usage` table)

### Medium-term

- **Containerised agent execution** — run agents in isolated containers for security and scalability in production environments
- **Theia IDE integration** — embedded web IDE for editing files surfaced during agent execution
- **Repository browser** — in-platform browsing and searching of connected repositories
- **Notification system** — in-app and webhook notifications when plans complete, agents are blocked, or reviews need attention
- **Structured output validation** — enforce JSON Schema contracts on agent outputs end-to-end

### Longer-term / Ideas

- **Per-user analytics** — individual productivity and AI usage metrics
- **Multi-provider embedding** — switchable embedding backends (Voyage AI, OpenAI, local ONNX) without reprocessing
- **Ollama / local LLM support** — first-class support for self-hosted models
- **Agent marketplace** — publish and share agent profiles across organisations
- **CSV / data export** — export task history, analytics, and agent outputs

---

## Notes

- The JavaScript applications are managed from the root Bun workspace.
- `agent-service/` is intentionally outside the Bun workspaces and uses Python packaging (`pyproject.toml`).
- Database schema changes must always be made via new migration files — never edit existing migration files directly.
- If you are working inside a subproject, check for a local `README.md` or `AGENTS.md` first.

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

## License

Telaios is released under the [MIT License](LICENSE). © 2026 Infotech Consults.
