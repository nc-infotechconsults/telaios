# TelaiOS

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**TelaiOS** is an agentic software development operating system — an all-in-one platform for teams that want to manage the entire software development lifecycle, from planning through execution, with AI agents doing the heavy lifting.

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
- **PostgreSQL** + pgvector for persistence and embeddings (SQLAlchemy + Alembic)
- **Redis** for pub/sub event bus and inter-agent coordination
- **MinIO / S3-compatible** object storage for uploaded documents
- **Docker Compose** for local development and full-stack containerised runs

---

## Repository Layout

| Path | Purpose |
| --- | --- |
| `server/` | Python 3.14 / FastAPI monolith (uv-managed) — API, agent runtime, document processing |
| `frontend/` | Vite + React + TypeScript web app |
| `tests/` | Root smoke / integration tests |
| `docs/` | Design documents, specs, and decision records |

---

## Architecture

```
Browser (React SPA)
    │
    └─── server (Python / FastAPI / LangGraph)
             │  ← auth, project metadata, planning, execution, RAG, documents
             ├─── PostgreSQL + pgvector
             ├─── Redis (pub/sub, SSE coordination)
             └─── MinIO / S3 (document storage)
```

The frontend talks to the single `server` service over REST and SSE. The server owns all persistence, auth, project metadata, agent orchestration, document processing, and LLM interaction.

---

## Prerequisites

- **Python 3.14** + **uv** — server
- **Node.js** ≥ 22.x + **npm** — frontend and smoke tests
- **Docker Compose** — local infrastructure (PostgreSQL, Redis, MinIO)

---

## Environment Setup

```bash
cp server/.env.example server/.env
cp frontend/.env.example frontend/.env
```

Fill in the secrets and API keys (LLM provider, API key, encryption key, etc.) before starting the services.

---

## Local Development

### 1. Start local infrastructure

```bash
docker compose -f docker-compose.dev.yml up
```

Brings up PostgreSQL, Redis, and MinIO.

### 2. Install dependencies

```bash
cd server && uv sync
cd frontend && npm ci
```

### 3. Run database migrations

```bash
cd server && uv run alembic upgrade head
```

### 4. Run the services

Use separate terminals:

```bash
# Terminal 1 — API server
cd server && uv run uvicorn telaios.main:app --reload --port 8000

# Terminal 2 — Frontend dev server
cd frontend && npm run dev
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Server API | http://localhost:8000 |
| MinIO API | http://localhost:9000 |
| MinIO Console | http://localhost:9001 |

### Full-stack with Docker

```bash
docker compose up --build
```

`docker-compose.yml` starts PostgreSQL, Redis, MinIO, `server`, and `frontend`.

---

## Testing

```bash
# Server unit + integration tests
cd server && uv run pytest

# Frontend E2E tests
cd frontend && npm run test:e2e
```

---

## Quality Gates (server)

Every server change must pass before merging:

```bash
cd server
uv run ruff check . && uv run ruff format --check .
uv run mypy src/telaios
uv run lint-imports
uv run pytest
```

---

## Roadmap

### Near-term (next milestones)

- **Analytics dashboard** — org-wide and per-project views: task throughput, agent success rates, blocked-task alerts
- **Document activity analytics** — surface which documents were accessed or modified during agent runs
- **AI cost ledger** — token tracking per project and org with model breakdown

### Medium-term

- **Containerised agent execution** — run agents in isolated containers for security and scalability
- **Theia IDE integration** — embedded web IDE for editing files surfaced during agent execution
- **Repository browser** — in-platform browsing and searching of connected repositories
- **Notification system** — in-app and webhook notifications when plans complete, agents are blocked, or reviews need attention

### Longer-term / Ideas

- **Multi-provider embedding** — switchable embedding backends without reprocessing
- **Ollama / local LLM support** — first-class support for self-hosted models
- **Agent marketplace** — publish and share agent profiles across organisations

---

## Notes

- Database schema changes must always be made via new Alembic migration files — never edit existing migration files directly.
- If you are working inside a subproject, check for a local `README.md` or `AGENTS.md` first.
- Migration history and design documents live in `docs/history/`.

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

## License

TelaiOS is released under the [MIT License](LICENSE). © 2026 Infotech Consults.
