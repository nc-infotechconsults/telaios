# Spec: Design Studio Agent-Based Redesign

## Objective
Redesign the Design Studio feature so it is no longer mocked/fallback-based. Instead, it delegates to a specialized **Designer Agent Profile** that is managed through the existing agent profile system (same as other agents). The designer agent will be responsible for generating UI artifacts using structured output, with proper system prompt, LLM configuration, and lifecycle management.

**Success Criteria:**
- A Designer Agent Profile exists in `library_agents` with specialized UI design capabilities.
- `DesignSession` tracks which designer agent is assigned to the session.
- The design chat service delegates artifact generation to the designer agent instead of making raw LLM calls.
- The designer agent uses structured output for artifact generation (html, css, js, rationale).
- Fallback behavior is preserved but clearly marked; the system attempts real agent execution first.
- All existing tests pass; new tests cover agent delegation and structured output.
- Quality gates (ruff, mypy, lint-imports, pytest) pass.

## Assumptions
1. The existing `LibraryAgent` / `AgentProfile` system is the correct abstraction for managing specialized agents.
2. The designer agent will be a `system` type agent (not `custom`) since it's a built-in specialized role.
3. Each `DesignSession` can optionally specify a designer agent; a project-level or global default is used otherwise.
4. The agent framework (`core.Agent`) supports structured output through `AgentConfig.structured_output`.
5. The designer agent's system prompt and structured output schema are versioned with the agent profile.

## Tech Stack
- Backend: Python 3.14, FastAPI, SQLAlchemy Async, existing Agent framework (`core.Agent`, `core.factory.create_agent`)
- Frontend: React 18 + TypeScript (no changes needed in this phase)
- Persistence: PostgreSQL (add `designer_agent_id` to `design_sessions`)

## Commands
```bash
# Server setup
cd server && uv sync --extra storage

# Run migrations
cd server && uv run alembic upgrade head

# Run quality gates
cd server && uv run ruff check . && uv run ruff format --check .
cd server && uv run mypy src/telaios
cd server && uv run lint-imports
cd server && uv run pytest

# Targeted tests
cd server && uv run pytest tests/unit/modules/design_chat/ -q
cd server && uv run pytest tests/integration/modules/test_design_chat.py -q
```

## Project Structure
```
server/src/telaios/
  db/models/
    design_chat.py          # Add designer_agent_id to DesignSession
    library.py              # Add default designer agent on startup (seed)
  modules/
    design_chat/
      schemas.py            # Add designer_agent_id to DesignSessionCreate/Read
      service.py            # Refactor to use DesignerAgent instead of direct LLM
      router.py             # No changes needed
      repository.py         # No changes needed
    library/
      service.py            # Add ensure_designer_agent() helper
      repository.py         # No changes needed
      schemas.py            # No changes needed
    agent_profiles/
      schemas.py            # No changes needed
      service.py            # No changes needed
  core/
    factory.py              # No changes needed (create_agent already exists)
    types.py                # No changes needed
  alembic/versions/         # New migration for design_sessions.designer_agent_id
```

## Code Style
```python
# Agent-based design generation — delegates to a configured Designer AgentProfile
async def _generate_with_designer_agent(
    *,
    agent_config: AgentConfig,
    prompt: str,
    revision: int,
) -> tuple[str, dict[str, Any]]:
    """Generate artifact via Designer Agent using structured output."""
    agent = create_agent(agent_config)
    response = await agent.run([
        Message(role=MessageRole.HUMAN, content=_build_prompt(prompt, revision))
    ])
    # Parse structured response...
```

## Testing Strategy
- **Unit tests** (`tests/unit/modules/design_chat/`):
  - Test designer agent creation/lookup.
  - Test structured output parsing from agent response.
  - Test fallback when agent is not configured.
- **Integration tests** (`tests/integration/modules/test_design_chat.py`):
  - Test full flow: create session with designer agent → send message → verify artifact metadata.
  - Test backward compatibility: sessions without designer_agent_id still work.
- **Test doubles**: Mock `create_agent` and `agent.run` to avoid real LLM calls.

## Boundaries
- **Always do:**
  - Run all quality gates before finishing.
  - Preserve backward compatibility for existing design sessions.
  - Use the existing agent profile abstractions (don't invent a new agent system).
  - Store the designer agent reference on the design session.
- **Ask first:**
  - Changing the frontend design session creation UI (out of scope for this server-focused redesign).
  - Adding new environment variables for designer agent defaults.
  - Modifying the core agent framework to support new capabilities.
- **Never do:**
  - Bypass the agent profile system and make raw LLM calls from the design chat service.
  - Remove fallback behavior entirely (graceful degradation is important).
  - Break existing design sessions that don't have a designer agent assigned.

## Open Questions
1. Should the designer agent be auto-created on application startup if it doesn't exist, or should it be created via a migration/seed script?
2. Should `designer_agent_id` be nullable (with fallback to global default) or required?
3. Should we support multiple designer agents (e.g., "Mobile Designer", "Marketing Designer") or just one default?

## Implementation Plan

### Phase 1: Database Schema
- Add `designer_agent_id` (nullable UUID, FK to `library_agents.id`) to `DesignSession`.
- Create Alembic migration.

### Phase 2: Designer Agent Profile
- Define a default designer agent configuration (system prompt, structured output schema for artifacts).
- Add seed logic to ensure a designer agent exists in `library_agents` on startup.

### Phase 3: Service Refactor
- Update `DesignChatService` to:
  - Accept or resolve a designer agent for the session.
  - Build `AgentConfig` from the designer agent's profile.
  - Use `create_agent(agent_config).run()` instead of direct `create_llm().invoke()`.
  - Parse structured output from agent response.
- Preserve fallback for when no agent is configured.

### Phase 4: Schema Updates
- Add `designer_agent_id` to `DesignSessionCreate` and `DesignSessionRead` schemas.

### Phase 5: Tests & Verification
- Update unit tests for new agent-based flow.
- Update integration tests.
- Run full quality gates.

## Success Criteria (Measurable)
- [ ] `library_agents` table contains a designer agent profile after startup.
- [ ] `design_sessions` table has `designer_agent_id` column.
- [ ] `DesignChatService.send_message` delegates to `create_agent` instead of `create_llm`.
- [ ] Artifact generation produces structured output with `source: "agent"` metadata when agent is configured.
- [ ] All 1200+ tests pass.
- [ ] Ruff, mypy, and import-linter pass with zero issues.
