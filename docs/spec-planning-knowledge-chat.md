# Spec: Knowledge-Grounded Planning Chat

## Objective
Make the planning chat fully functional end-to-end so a user message in a plan thread produces an assistant response and a structured draft plan. The draft must be grounded in both project repository context and uploaded document knowledge.

Success means:
- posting to `POST /chat/{plan_id}/message` triggers planner execution,
- assistant output is persisted and streamed to the UI,
- draft tasks are created in DB and emitted to the frontend as `plan_draft`,
- repository IDs are attached to tasks when relevant,
- document context is included in planning prompts and reflected in generated task descriptions.

## Tech Stack
- Backend: Python 3.14, FastAPI, SQLAlchemy Async
- Frontend: React + TypeScript (existing SSE client)
- LLM adapter: `telaios.core.factory.create_llm` (LangChain-backed providers)

## Commands
- Run focused integration tests:
  - `cd server && uv run pytest tests/integration/modules/test_chat.py -q`
- Run server quality gates:
  - `cd server && uv run ruff check . && uv run ruff format --check .`
  - `cd server && uv run mypy src/telaios`
  - `cd server && uv run lint-imports`
  - `cd server && uv run pytest`

## Project Structure
- `server/src/telaios/modules/chat/router.py` — chat post/stream endpoints and planning turn orchestration
- `server/src/telaios/modules/plans/prompts.py` — prompt composition and context formatting
- `server/tests/integration/modules/test_chat.py` — new integration coverage for planning chat behavior

## Code Style
Use module service boundaries and small pure helpers for normalization/fallback:

```python
def _is_confirm_message(content: str) -> bool:
    return content.strip().lower() in {"confirm", "/confirm", "confirm plan"}
```

## Testing Strategy
- Add integration tests at HTTP boundary for `POST /chat/{plan_id}/message`.
- Mock LLM invocation to validate prompt/context and deterministic plan output.
- Validate fallback path (no LLM) still generates assistant response and plan tasks.
- Validate confirm path updates plan status.

## Boundaries
- Always:
  - Persist both user and assistant messages.
  - Emit SSE events expected by frontend (`chat_thinking`, `chat_token`, `chat_end`, `plan_draft`, `plan_confirmed`, `error`).
  - Include repository and document knowledge in planner context.
- Ask first:
  - Schema migrations.
  - New external dependencies beyond existing stack.
- Never:
  - Break existing route contracts or auth checks.
  - Remove RBAC checks from chat/plans endpoints.

## Success Criteria
- A new message in planning chat leads to at least one assistant message persisted in `/plans/{plan_id}/messages`.
- When planner returns/derives a draft, tasks are present in `/plans/{plan_id}/tasks`.
- Generated tasks include repository assignments when repos exist.
- Prompt/context includes uploaded document knowledge and repository metadata.
- `confirm` message marks plan as `confirmed` and emits confirmation event.

## Open Questions
- None blocking for implementation in current architecture.
