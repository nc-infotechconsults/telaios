# Spec: Conversational UI Design Studio

## Assumptions I'm Making
1. This feature is project-scoped (not global) and lives inside an existing project workspace.
2. MVP should focus on generating and iterating UI designs from chat, not directly committing code to repositories.
3. Generated output should be safe to preview in-browser via a sandboxed iframe (no server-side code execution).
4. We should reuse the current auth/RBAC model (viewer can read, editor+ can generate/update).
5. First version can target HTML/CSS-oriented design artifacts, with optional React/TSX export metadata.

## Objective
Add a "Design Studio" workflow where a user can chat with an agent to generate, refine, and version UI designs, similar to Claude Design-style iterative collaboration.

Success means:
- users can open a design chat session in a project,
- send a prompt and receive streamed assistant output,
- receive a structured design artifact revision (UI code + rationale),
- preview the generated UI safely in-app,
- iterate through multiple revisions in the same session.

## Tech Stack
- Backend: Python 3.14, FastAPI, SQLAlchemy Async, existing LLM abstraction (`create_llm`)
- Frontend: React 18 + TypeScript + HeroUI + existing SSE patterns
- Persistence: PostgreSQL (new design-session and design-artifact entities)

## Commands
- Server focused tests:
  - `cd server && uv run pytest tests/integration/modules/test_design_chat.py -q`
- Server quality gates:
  - `cd server && uv run ruff check . && uv run ruff format --check .`
  - `cd server && uv run mypy src/telaios`
  - `cd server && uv run lint-imports`
  - `cd server && uv run pytest`
- Frontend checks:
  - `cd frontend && npm run build`
  - `cd frontend && npm run test:e2e -- e2e/design-chat.spec.ts`

## Project Structure
- `server/src/telaios/db/models/design_chat.py` — SQLAlchemy models for design sessions/messages/artifacts
- `server/src/telaios/modules/design_chat/` — `router.py`, `service.py`, `repository.py`, `schemas.py`, `__init__.py`
- `server/alembic/versions/<timestamp>_design_chat.py` — schema migration
- `server/src/telaios/main.py` — module registration
- `server/tests/integration/modules/test_design_chat.py` — integration tests
- `frontend/src/pages/DesignChat.tsx` — primary design studio page
- `frontend/src/components/design/` — preview pane, revision list, artifact card/chat helpers
- `frontend/src/lib/api.ts` — REST client functions for design sessions/messages
- `frontend/src/lib/sse.ts` — design SSE hook
- `frontend/src/types/index.ts` — design DTO/event types
- `frontend/src/main.tsx` and `frontend/src/pages/ProjectDetail.tsx` — route + navigation entry point

## API and Data Contract
- Create/list sessions:
  - `POST /projects/{project_id}/design/sessions`
  - `GET /projects/{project_id}/design/sessions`
- Session detail and history:
  - `GET /design/sessions/{session_id}`
  - `GET /design/sessions/{session_id}/messages`
  - `GET /design/sessions/{session_id}/artifacts`
- Chat + streaming:
  - `POST /design/sessions/{session_id}/message`
  - `GET /design/sessions/{session_id}/stream`
- SSE event contract (initial):
  - `design_chat_thinking`
  - `design_chat_token`
  - `design_artifact` (structured revision payload)
  - `design_chat_end`
  - `error`

## Code Style
Use small composable helpers and explicit typed payloads.

```python
def _is_revision_request(content: str) -> bool:
    normalized = content.strip().lower()
    return normalized.startswith("revise:") or "change" in normalized
```

```ts
type DesignWsEvent =
  | { type: "design_chat_token"; content: string }
  | { type: "design_artifact"; artifact: DesignArtifact }
  | { type: "design_chat_end" };
```

## Testing Strategy
- Backend integration tests at HTTP boundary for:
  - session creation/list/read,
  - message send and assistant persistence,
  - artifact revision persistence,
  - SSE event emission order and payload shape,
  - RBAC enforcement (viewer/editor).
- Frontend E2E tests for:
  - entering design studio from project,
  - sending prompt and receiving streaming response,
  - rendering returned artifact in preview pane,
  - revision history selection and re-render,
  - mobile/desktop viewport toggle in preview.

## Boundaries
- Always:
  - Persist both user and assistant messages.
  - Persist every generated artifact as a new immutable revision.
  - Render preview only in sandboxed context.
  - Validate and type-check agent output before saving.
- Ask first:
  - Adding external runtime/sandbox infrastructure.
  - Executing generated JavaScript beyond iframe sandbox.
  - Automatic repository write/commit flow from design artifacts.
- Never:
  - Execute generated UI code on the backend.
  - Render unsanitized HTML in main DOM without isolation.
  - Bypass project membership/RBAC checks.

## Success Criteria
- A user can create a design session under a project and open it from the UI.
- Posting a message triggers streamed assistant output and stores assistant/user turns.
- At least one structured design artifact revision is created from a generation turn.
- Selecting a revision updates the preview pane reliably.
- Preview is sandboxed and does not execute unsafe content in app context.
- All server quality gates pass.
- Frontend build and targeted E2E pass.

## Open Questions
- Should MVP support only HTML/CSS artifacts, or also first-class React component bundles?
- Should design artifacts later map into plan tasks automatically (out of scope for MVP by default)?
- Should non-editor users be read-only observers in design chat sessions?
