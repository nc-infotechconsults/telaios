# Telaio

Telaio is an AI-assisted software delivery platform with a React frontend, a Bun-powered data API, and a Python agent service that plans and executes work across connected repositories.

## Repository layout

| Path | Purpose |
| --- | --- |
| `frontend/` | Vite + React web app |
| `data-api/` | Bun + Express + TypeORM API backed by PostgreSQL |
| `agent-service/` | Python 3.12 + FastAPI + LangGraph agent runtime |
| `packages/shared/` | Shared JavaScript package(s) used by the Bun workspaces |
| `tests/` | Root smoke tests for the running stack |

## Architecture

- **Frontend**: Vite + React + TypeScript
- **Data API**: Bun + Express + TypeORM + PostgreSQL
- **Agent service**: Python + FastAPI + LangGraph
- **Realtime and coordination**: Redis, SSE, background workers
- **Document storage**: MinIO / S3-compatible storage

The frontend talks to the data API and agent service. The data API owns persistence and project metadata, while the Python agent service handles planning, orchestration, document processing, and agent execution.

Standalone IDE code is no longer kept in this repository. IDE capabilities should be provided through Theia integration instead.

## Prerequisites

- **Bun** for the JavaScript workspaces
- **Python 3.12** for `agent-service/`
- **Docker Compose** for local infrastructure or full-stack containerized runs

## Environment setup

```bash
cp .env.example .env
```

Fill in the secrets and API keys before starting the services.

## Local development

### 1. Start local infrastructure

```bash
bun run docker:dev
```

This brings up PostgreSQL, Redis, and MinIO from `docker-compose.dev.yml`.

### 2. Install dependencies

```bash
bun install
bun run apps:install
bun run agent:install
```

### 3. Run the services

Use separate terminals:

```bash
bun run data:dev
bun run agent:dev
bun run frontend:dev
```

The main endpoints are:

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Data API | http://localhost:3000 |
| Agent service | http://localhost:8000 |
| MinIO API | http://localhost:9000 |
| MinIO Console | http://localhost:9001 |

## Docker

To run the main application stack in containers:

```bash
docker compose up --build
```

`docker-compose.yml` starts PostgreSQL, Redis, MinIO, `data-api`, `agent-service`, and `frontend`.

## Common root commands

| Command | Purpose |
| --- | --- |
| `bun run apps:install` | Install dependencies for the Bun workspaces |
| `bun run agent:install` | Install Python agent-service dependencies |
| `bun run data:dev` | Start the data API |
| `bun run agent:dev` | Start the Python agent service with reload |
| `bun run frontend:dev` | Start the frontend |
| `bun run docker:postgres` | Start only PostgreSQL |
| `bun run docker:redis` | Start only Redis |
| `bun run docker:dev` | Start PostgreSQL, Redis, and MinIO |
| `bun run build` | Build the Bun workspaces and install the Python package |
| `bun run test` | Run the root smoke tests in `tests/` |

## Testing

```bash
bun run test
cd data-api && bun run test
bun run agent:test
cd frontend && bun run test:e2e
```

## Notes

- The JavaScript applications are managed from the root Bun workspace.
- `agent-service/` is intentionally separate from the Bun workspaces and uses Python packaging.
- If you are working inside a subproject, check for a local `README.md` or `AGENTS.md` first.
