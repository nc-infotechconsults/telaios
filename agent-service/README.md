# agent-service

Python implementation of the TelaiOS Agent Service.

## Overview

FastAPI + LangChain/LangGraph service that handles:
- LLM-driven planning (interactive chat → task DAGs)
- Multi-agent task execution (code, review, test, knowledge, infra agents)
- Document processing pipeline (extract → chunk → embed → RAG search)
- **RAG Strategies**: SIMPLE, GRAPH, HYBRID, AGENTIC, CRAG, SELF_RAG
- **Document Tools**: extract, analyze, summarize, qa, convert, compare
- **Skills System**: filesystem-based skill loading and execution
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
| BM25 | rank-bm25 |
| HTML parsing | beautifulsoup4 |
| Markdown | markdown-it-py, markdown |
| Skills | python-frontmatter |
| Graph | networkx |

## Setup

```bash
pip install -e ".[dev]"
```

## Running

```bash
uvicorn agent_service.main:app --host 0.0.0.0 --port 8000 --reload
```

Or via the repository root:

```bash
bun run agent:dev
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
| `POST` | `/api/v2/documents/{id}/analyze` | Document structure analysis |
| `POST` | `/api/v2/documents/{id}/convert` | Convert document format |
| `POST` | `/api/v2/documents/{id}/extract` | Structured data extraction |
| `POST` | `/api/v2/documents/{id}/summarize` | Generate summary |
| `POST` | `/api/v2/documents/{id}/compare` | Compare documents |

## Project Structure

```
src/
├── core/                           # Provider-agnostic RAG core
│   ├── llm.py                      # Abstract LLM interface
│   ├── graph_store.py              # Abstract graph store
│   ├── retriever_bm25.py           # BM25 retriever
│   ├── fusion.py                   # RRF fusion
│   ├── types.py                    # Domain types and configs
│   ├── strategies/                 # RAG strategies (zero provider imports)
│   │   ├── simple.py
│   │   ├── graph.py
│   │   ├── hybrid.py
│   │   ├── agentic.py
│   │   ├── crag.py
│   │   └── self_rag.py
│   └── providers/
│       ├── langchain/              # LangChain adapter layer
│       │   ├── llm.py
│       │   └── rag.py
│       ├── networkx/               # In-memory graph store
│       └── neo4j/                  # Neo4j graph store
│
├── agent_service/                  # FastAPI service
│   ├── main.py                     # FastAPI app entry point
│   ├── config.py                   # Pydantic Settings
│   ├── crypto.py                   # AES-256-CBC encrypt/decrypt
│   ├── api/
│   │   ├── chat.py                 # SSE + message endpoints
│   │   ├── documents.py            # Document processing endpoint
│   │   ├── documents_v2.py         # Enhanced document API
│   │   ├── plans.py                # Plan resume endpoint
│   │   ├── health.py               # Health + LLM test
│   │   └── v2/                     # API v2 router
│   ├── core/
│   │   ├── llm.py                  # LLM factory (provider-specific)
│   │   ├── redis.py                # Redis singleton
│   │   ├── types.py                # MCP types (Pydantic)
│   │   └── agent_framework/
│   │       ├── base_agent.py       # Abstract BaseAgent
│   │       ├── context.py          # Context types
│   │       ├── event_bus.py        # Redis pub/sub
│   │       └── registry.py         # Agent type registry
│   ├── agents/
│   │   ├── register.py             # Register all agents
│   │   ├── coordinator/
│   │   │   ├── pool.py             # AgentPool
│   │   │   ├── scheduler.py        # Execution scheduler
│   │   │   └── drivers/
│   │   │       ├── base.py         # CodingAgentDriver protocol
│   │   │       ├── base_agent_driver.py
│   │   │       ├── langgraph.py    # LangGraph driver
│   │   │       ├── opencode.py     # OpenCode driver
│   │   │       └── github_copilot.py
│   │   ├── review/
│   │   │   ├── review_agent.py
│   │   │   └── diff_parser.py
│   │   ├── testing/
│   │   │   ├── testing_agent.py
│   │   │   └── test_runner.py
│   │   ├── knowledge/
│   │   │   └── knowledge_agent.py
│   │   └── infra/
│   │       ├── infra_agent.py
│   │       └── template_gen.py
│   ├── services/
│   │   ├── data_client.py          # httpx async client for data-api
│   │   ├── document_extractor.py   # PDF/DOCX/XLSX/text extraction
│   │   ├── document_processor.py   # S3 download → extract → chunk → embed
│   │   ├── document_converter.py   # Format conversion (PDF↔MD↔HTML)
│   │   ├── document_analyzer.py    # Document structure analysis
│   │   ├── embedding_service.py    # fastembed / OpenAI embeddings
│   │   ├── execution_service.py    # Bootstrap agent execution
│   │   ├── orchestration_service.py
│   │   ├── planning_service.py     # LLM planning loop
│   │   ├── repo_explorer.py        # Git clone/list/read/search
│   │   ├── sse_manager.py          # SSE broadcast manager
│   │   ├── text_chunker.py         # Text chunking with overlap
│   │   └── document_tools/         # Document agent tools
│   │       ├── extract.py
│   │       ├── analyze.py
│   │       ├── summarize.py
│   │       └── qa.py
│   └── tools/
│       ├── registry.py             # Tool registry
│       └── skill/                  # Skills system
│           ├── types.py
│           ├── parser.py
│           ├── validator.py
│           ├── loader.py
│           ├── registry.py
│           └── adapter.py
│
└── tools/                          # Shared tools (outside agent_service)
    └── skill/                      # Skill system (shared)
        ├── types.py
        ├── parser.py
        ├── validator.py
        ├── loader.py
        └── registry.py
```

## RAG Strategies

See [docs/STRATEGIES.md](docs/STRATEGIES.md) for detailed strategy comparison, configuration, and benchmarks.

### Quick Start

```python
from telaios.core.types import RagConfig, LLMConfig
from telaios.core.strategies import HybridRAGStrategy

config = RagConfig(
    strategy="hybrid",
    llm=LLMConfig(provider="openai", model="gpt-4o", api_key="sk-..."),
)
```

## Skills

Skills are loaded automatically from the configured `SKILLS_DIR` at startup.

### Adding a Skill

1. Create `skills/{name}/SKILL.md` with frontmatter
2. Add scripts to `skills/{name}/scripts/`
3. Restart the service
