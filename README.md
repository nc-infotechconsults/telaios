# Telaio

A web-based platform for AI-assisted software project planning and autonomous code execution.

## Architecture

- **Frontend**: Vite + React (CSR), TypeScript, HeroUI, React Flow
- **Data API**: TypeScript + Express + TypeORM + PostgreSQL
- **Agent Service**: TypeScript + Express + LangGraph.js
- **Coding Agents**: LangGraph.js driver (default), OpenCode SDK, GitHub Copilot SDK
- **Real-time**: WebSockets
- **Cache/PubSub**: Redis

## Quick Start

```bash
cp .env.example .env
# Edit .env with your LLM API keys and encryption key
docker compose up
```

Services:
- Frontend: http://localhost:5173
- Data API: http://localhost:3000
- Agent Service: http://localhost:8000

## Development (without Docker)

### Data API
```bash
cd data-api
npm install
npm run migration:run
npm run dev
```

### Agent Service
```bash
cd agent-service
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Features

- Conversational AI planning agent (LangGraph.js state machine)
- Dependency-ordered execution plan with DAG visualization (React Flow)
- Multi-repo project support (distributed/microservice architectures)
- Pluggable coding agent drivers: LangGraph.js, OpenCode SDK, GitHub Copilot SDK
- Configurable agent profiles with MCP tools and Claude Skills
- Multi-provider LLM support: OpenAI, Anthropic, vLLM, Ollama, LM Studio
- Runtime LLM configuration via web UI (no restart needed)
