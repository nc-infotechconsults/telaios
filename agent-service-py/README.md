# agent-service-py

Python implementation of the SWE AI Platform Agent Service.

## Overview

FastAPI + LangChain/LangGraph service that handles:
- LLM-driven planning (interactive chat → task DAGs)
- Multi-agent task execution (code, review, test, knowledge, infra agents)
- Document processing pipeline (extract → chunk → embed → RAG search)
- Real-time SSE streaming to the frontend
- Redis pub/sub event bus for inter-agent communication

## Technology Stack

| Component | Library |
|-----------|---------|
| Web framework | FastAPI + sse-starlette |
| LLM | langchain-openai / langchain-anthropic |
| Agent graphs | langgraph |
| HTTP client | httpx (async) |
| Redis | redis.asyncio |
| Git | gitpython |
| S3 / MinIO | aioboto3 |
| PDF extraction | PyMuPDF (fitz) |
| DOCX extraction | python-docx |
| XLSX extraction | openpyxl |
| Embeddings | fastembed (local ONNX) / langchain-openai |
| Validation | pydantic-settings |
| Crypto | cryptography (AES-256-CBC) |
| Testing | pytest + pytest-asyncio |

## Setup

```bash
pip install -e ".[dev]"
```

## Running

```bash
uvicorn agent_service.main:app --host 0.0.0.0 --port 8000 --reload
```

Or via the root workspace:

```bash
bun run agent-py:dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | HTTP port |
| `DATA_API_URL` | `http://localhost:3000` | data-api base URL |
| `DATA_API_KEY` | `` | Bearer token for data-api |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `ENCRYPTION_KEY` | `default-key-change-in-production!` | AES-256 key source |
| `WORKSPACES_ROOT` | `/tmp/swe-ai-workspaces` | Git workspace root |
| `AGENT_POOL_SIZE` | `3` | Max concurrent agents |
| `LLM_PROVIDER` | `openai` | `openai` or `anthropic` |
| `LLM_MODEL` | `gpt-4o` | Model name |
| `LLM_API_KEY` | `` | LLM API key |
| `LLM_BASE_URL` | `` | Custom LLM base URL |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO/S3 endpoint |
| `S3_ACCESS_KEY` | `sweai` | S3 access key |
| `S3_SECRET_KEY` | `sweai-secret` | S3 secret key |
| `S3_BUCKET` | `sweai-documents` | S3 bucket name |
| `S3_REGION` | `us-east-1` | S3 region |
| `EMBEDDING_MODEL` | `BAAI/bge-small-en-v1.5` | Embedding model |
| `EMBEDDING_API_KEY` | `` | Separate embedding API key |
| `EMBEDDING_BASE_URL` | `` | Custom embedding base URL |

## Testing

```bash
pytest tests/unit/
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/test-llm` | Test LLM connectivity |
| `GET` | `/chat/{plan_id}/stream` | SSE stream |
| `POST` | `/chat/{plan_id}/message` | Send user message |
| `POST` | `/documents/{document_id}/process` | Trigger document processing |
| `POST` | `/plans/{plan_id}/resume` | Resume plan execution |

## Project Structure

```
src/agent_service/
├── main.py                     # FastAPI app entry point
├── config.py                   # Pydantic Settings
├── crypto.py                   # AES-256-CBC encrypt/decrypt
├── api/
│   ├── chat.py                 # SSE + message endpoints
│   ├── documents.py            # Document processing endpoint
│   ├── plans.py                # Plan resume endpoint
│   └── health.py               # Health + LLM test
├── core/
│   ├── llm.py                  # LLM factory
│   ├── redis.py                # Redis singleton
│   ├── types.py                # MCP types (Pydantic)
│   └── agent_framework/
│       ├── base_agent.py       # Abstract BaseAgent
│       ├── context.py          # Context types
│       ├── event_bus.py        # Redis pub/sub
│       └── registry.py         # Agent type registry
├── agents/
│   ├── register.py             # Register all agents
│   ├── coordinator/
│   │   ├── pool.py             # AgentPool
│   │   ├── scheduler.py        # Execution scheduler
│   │   └── drivers/
│   │       ├── base.py         # CodingAgentDriver protocol
│   │       ├── base_agent_driver.py
│   │       ├── langgraph.py    # LangGraph driver
│   │       ├── opencode.py     # OpenCode driver
│   │       └── github_copilot.py
│   ├── review/
│   │   ├── review_agent.py
│   │   └── diff_parser.py
│   ├── testing/
│   │   ├── testing_agent.py
│   │   └── test_runner.py
│   ├── knowledge/
│   │   └── knowledge_agent.py
│   └── infra/
│       ├── infra_agent.py
│       └── template_gen.py
└── services/
    ├── data_client.py          # httpx async client for data-api
    ├── document_extractor.py   # PDF/DOCX/XLSX/text extraction
    ├── document_processor.py   # S3 download → extract → chunk → embed → store
    ├── embedding_service.py    # fastembed / OpenAI embeddings
    ├── execution_service.py    # Bootstrap agent execution
    ├── orchestration_service.py
    ├── planning_service.py     # LLM planning loop
    ├── repo_explorer.py        # Git clone/list/read/search
    ├── sse_manager.py          # SSE broadcast manager
    └── text_chunker.py         # Text chunking with overlap
```
