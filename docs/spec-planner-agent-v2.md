# Spec: Planner Agent v2 — Production-Ready, Persistent, HITL

## Objective

Redesign `PlannerAgent` to be production-ready:

- **RAG-grounded plans** — the agent searches indexed documents and repositories (ChromaDB) before producing a plan, making plans verifiably grounded in real artifacts.
- **Session persistence** — a planning session (thread) survives server restarts; users can close the browser and resume later.
- **Human-in-the-loop (HITL)** — the graph pauses at two explicit boundaries:
  1. When the model has clarifying questions for the user.
  2. When the model is ready to present a complete plan (user must confirm or refuse with feedback).
- **HTTP API** — exposed via `modules/planner/` FastAPI router with SSE streaming.
- **TUI** — `telaios-planner` shares the same service layer; it is a dev/validation surface, not a parallel implementation.

Non-goals for this spec:
- Document ingestion / indexing (assumed pre-indexed in ChromaDB).
- Per-session document uploads.
- Multi-agent orchestration (one planner agent per thread).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent framework | LangGraph (`StateGraph`, `interrupt`, `Command`) |
| Checkpointing | `AsyncPostgresSaver` (LangGraph) via existing `PostgresCheckpointer` |
| Vector search | `ChromaRetriever` (existing) |
| LLM | `init_chat_model` + `bind_tools` (LangChain) |
| Streaming | LangGraph `astream_events` → FastAPI `StreamingResponse` (SSE) |
| HTTP | FastAPI, Pydantic v2 schemas |
| TUI | Textual (shares `PlannerService` directly) |

---

## Commands

```bash
# Server
cd server && uv run uvicorn telaios.main:app --reload --port 8000

# TUI (dev)
cd server && uv run telaios-planner

# Quality gates (run before finishing any task)
uv run ruff check . && uv run ruff format --check .
uv run mypy src/telaios
uv run lint-imports
uv run pytest tests/unit/
```

---

## Architecture

### Graph Topology

```
START
  │
  ▼
┌──────────────────┐
│   planner_node   │  LLM with tools bound; may call tools or produce
│   (LLM + tools)  │  a structured PlanResponseFormat.
└──────────────────┘
         │
    ┌────┴──────────────────────────────┐
    │  route_after_planner()            │
    │  • tool_calls present → "tools"   │
    │  • questions present  → "pause"   │
    │  • tasks present      → "pause"   │
    │  • else               → "tools"   │
    └───────────────────────────────────┘
         │            │            │
         ▼            ▼            ▼
   ┌──────────┐  ┌─────────┐  ┌──────────────────────────────────────┐
   │tool_node │  │  END    │  │  interrupt()                         │
   │(parallel)│  │(should  │  │  yields PausePayload to the caller   │
   └──────────┘  │not reach│  │  • type="questions" → user replies   │
         │       │normally)│  │  • type="plan_ready" → confirm/refuse│
         │       └─────────┘  └──────────────────────────────────────┘
         │                               │ (graph suspended; checkpointed)
         └──────────────────────────────►│
                         ┌───────────────┴──────────────────┐
                         │  Resume via Command(resume=...)  │
                         │  • user_reply     → planner_node  │
                         │  • confirm        → END           │
                         │  • refuse(reason) → planner_node  │
                         └──────────────────────────────────┘
```

**Key LangGraph mechanisms used:**
- `interrupt(payload)` — suspends the graph; payload is returned to the caller via `astream_events`.
- `Command(resume=value)` — resumes a suspended graph by injecting a value.
- `AsyncPostgresSaver` — checkpoints every node transition; threads survive restarts.
- `add_messages` reducer — append-only message list; correct for tool call/result pairs.

### State

```python
class PlannerState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    status: PlanStatus           # PENDING | INTERVIEWING | AWAITING_CONFIRMATION | ACCEPTED | REFUSED
    plan: PlanResponseFormat | None
```

`thread_id` and `user_id` live in the LangGraph config (`configurable`), not in state — they are routing keys, not graph data.

### Interrupt Payload

```python
class PausePayload(TypedDict):
    type: Literal["questions", "plan_ready"]
    data: PlanResponseFormat     # questions or tasks list
```

### Tools

Two tools for v2:

```python
@tool
async def search_documents(query: str) -> str:
    """Search indexed documents and return relevant excerpts."""
    ...

@tool
async def search_repository(query: str, collection: str | None = None) -> str:
    """Search indexed repository code and return relevant snippets."""
    ...
```

Both tools call `ChromaRetriever.aretrieve()` against the appropriate ChromaDB collection. Tool results are appended as `ToolMessage` objects by LangGraph's `ToolNode`.

---

## Module Layout

```
modules/planner/
  __init__.py         # re-exports: router, service
  router.py           # FastAPI APIRouter — HTTP + SSE endpoints
  service.py          # PlannerService — creates sessions, sends turns, resumes
  schemas.py          # Pydantic request/response models
  tools.py            # @tool definitions: search_documents, search_repository
  agent.py            # PlannerAgent (StateGraph builder) — replaces core/agents/planner_agent.py

core/agents/
  planner_agent.py    # DEPRECATED; kept for backward compat; delegates to modules/planner/agent.py
```

---

## API Surface

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/planner/threads` | Create a new thread; returns `{thread_id}` |
| `POST` | `/planner/threads/{thread_id}/messages` | Send a turn; SSE stream of events |
| `POST` | `/planner/threads/{thread_id}/confirm` | Confirm the ready plan |
| `POST` | `/planner/threads/{thread_id}/refuse` | Refuse with feedback; SSE stream resumes |
| `GET` | `/planner/threads/{thread_id}` | Get current thread state + last plan |
| `GET` | `/planner/threads` | List user's threads (paginated) |

### SSE Event Schema

All events are `text/event-stream` with JSON data:

```
event: chunk
data: {"content": "Building your plan..."}

event: tool_call
data: {"name": "search_documents", "args": {"query": "authentication flows"}}

event: tool_result
data: {"name": "search_documents", "content": "...excerpts..."}

event: pause
data: {"type": "questions", "questions": [...]}

event: pause
data: {"type": "plan_ready", "tasks": [...], "response": "..."}

event: done
data: {"status": "awaiting_confirmation"}

event: error
data: {"message": "..."}
```

### Request Schemas

```python
class SendMessageRequest(BaseModel):
    content: str

class RefuseRequest(BaseModel):
    reason: str
```

---

## PlannerService

Central service class; used by both the FastAPI router and the TUI.

```python
class PlannerService:
    def __init__(self, agent: PlannerAgent, checkpointer: AsyncPostgresSaver): ...

    async def create_thread(self, user_id: str) -> str:
        """Generate and register a new thread_id."""

    async def send(
        self,
        thread_id: str,
        user_id: str,
        content: str,
    ) -> AsyncIterator[SSEEvent]:
        """Run the graph from the current checkpoint; yield SSE events."""

    async def confirm(self, thread_id: str, user_id: str) -> None:
        """Resume the paused graph with confirm; transitions to ACCEPTED."""

    async def refuse(
        self,
        thread_id: str,
        user_id: str,
        reason: str,
    ) -> AsyncIterator[SSEEvent]:
        """Resume with refuse + reason; graph re-enters planner_node."""

    async def get_state(self, thread_id: str, user_id: str) -> PlannerThreadState:
        """Read current state from checkpointer."""
```

---

## TUI Integration

`planner_tui.py` is refactored to call `PlannerService` directly (no HTTP):

```python
# Worker — same interface, no HTTP needed
async def _run_planner(self, prompt: str, log: RichLog) -> None:
    async for event in self._service.send(self._thread_id, "dev-user", prompt):
        self._handle_event(event, log)
```

The TUI creates its own in-process `PlannerAgent` + `MemorySaver` (non-persistent) unless `--thread-id` CLI arg is passed (uses Postgres checkpointer for cross-restart testing).

---

## Testing Strategy

| Test type | Location | Coverage target |
|---|---|---|
| Unit — state/graph | `tests/unit/modules/planner/` | Graph routing, tool stubs |
| Unit — service | `tests/unit/modules/planner/` | `PlannerService` with `MemorySaver` |
| Unit — schemas | `tests/unit/modules/planner/` | Pydantic validation |
| Integration — API | `tests/integration/planner/` | Full SSE stream with fake LLM |
| Live — TUI | Manual | Run `telaios-planner`, confirm a plan |

Use `FakeListChatModel` (already in `core/fake_llm.py`) to drive the graph in unit tests without a real LLM.

---

## Boundaries

**Always do:**
- Run all quality gates before finishing any task.
- Follow `modules/<name>/` file convention (`router`, `service`, `repository`, `schemas`).
- Keep `PlannerService` import-free from `router.py` internals.
- Use `interrupt()` / `Command(resume=...)` — do NOT simulate HITL via status flags.

**Ask first:**
- Adding new tools beyond `search_documents` / `search_repository`.
- Changing the SSE event schema (breaks frontend contract).
- Adding new LangGraph nodes.

**Never do:**
- Import `modules/planner/router` or `modules/planner/repository` from other modules (use the public facade).
- Block the event loop inside a tool (use `asyncio.to_thread` if needed).
- Store secrets or API keys in state or checkpoint.

---

## Success Criteria

- [ ] A planning thread can be created, run, interrupted for questions, answered, and produce a confirmed plan — with a server restart mid-session and the thread resumes correctly.
- [ ] `POST /planner/threads/{id}/messages` streams SSE events; a `pause` event appears when the model has questions.
- [ ] `POST /planner/threads/{id}/confirm` resolves the plan; subsequent `GET` returns `status: accepted`.
- [ ] `POST /planner/threads/{id}/refuse` with a reason causes the graph to re-plan with the feedback in context.
- [ ] `telaios-planner` TUI exercises the same `PlannerService` codepath as the HTTP router.
- [ ] All unit tests pass; no new mypy errors in `modules/planner/`.
- [ ] The `search_documents` tool is called at least once per plan in the integration test.

---

## Open Questions

1. **Collection name strategy** — does each user get their own ChromaDB collection, or is there a shared `documents` collection filtered by metadata? (Affects tool signature.)
2. **Thread ownership** — should `user_id` be enforced at the checkpointer level, or is it an application-level guard in `PlannerService`?
3. **Max tool iterations** — should there be a hard cap on the planner→tools loop (e.g., 10 iterations) before the graph forces a plan or asks the user?
