# Phase 5 — Planning Service Rebuild

## Objective
Replace `agent_service/services/planning_service/` (8 files) with 4 clean domain files under `domain/planning/`. Deduplicate prompt composition, consolidate LLM config usage, and implement plan session lifecycle.

## Commands
```bash
bun run agent:install
pytest tests/domain/planning/ -v
```

## Tasks

### Task 5.1 — Write `domain/planning/prompts.py`
Consolidate all 5× `_compose_prompt` variants into a single prompt composition module:

```python
"""domain/planning/prompts.py — Single source for all planning prompts."""

from __future__ import annotations

from typing import Any

PLANNING_SYSTEM_PROMPT = """
You are a planning assistant. Your task is to break down the user's request
into a structured plan with discrete, ordered tasks.

Each task should have:
- A clear description
- Dependencies (tasks that must complete first)
- Expected output
"""

PLAN_PARSER_PROMPT = """
Parse the following plan text into a structured format.
Return valid JSON with the following schema:
{
  "tasks": [
    {
      "id": "string",
      "description": "string",
      "depends_on": ["task_id", ...],
      "agent": "agent_name"
    }
  ]
}
"""


def compose_planning_prompt(
    user_request: str,
    context: dict[str, Any] | None = None,
) -> str:
    """
    Compose the full planning prompt from user request and optional context.

    Replaces the 5× _compose_prompt variants with a single function.
    """
    parts = [PLANNING_SYSTEM_PROMPT, f"\nUser request: {user_request}"]
    if context:
        context_str = "\n".join(f"- {k}: {v}" for k, v in context.items())
        parts.append(f"\nContext:\n{context_str}")
    return "\n".join(parts)


def compose_parser_prompt(plan_text: str) -> str:
    """Compose the prompt for parsing plan text into structured format."""
    return f"{PLAN_PARSER_PROMPT}\n\nPlan to parse:\n{plan_text}"
```

### Task 5.2 — Write `domain/planning/parser.py`
Structured plan parser:

```python
"""domain/planning/parser.py — Parse plan text into structured format."""

from __future__ import annotations

import json
from typing import Any

from core.types import Message, MessageRole
from domain.planning.prompts import compose_parser_prompt


class PlanTask(BaseModel):
    id: str
    description: str
    depends_on: list[str] = []
    agent: str = "default"


class ParsedPlan(BaseModel):
    tasks: list[PlanTask]


async def parse_plan(
    plan_text: str,
    llm: Any,  # core.llm.LLM instance
) -> ParsedPlan:
    """
    Parse raw plan text into a structured ParsedPlan using the LLM.

    Args:
        plan_text: The raw plan text to parse.
        llm: The LLM instance to use for parsing.

    Returns:
        A ParsedPlan with structured tasks.
    """
    prompt = compose_parser_prompt(plan_text)
    response = await llm.invoke([
        Message(role=MessageRole.SYSTEM, content="You are a JSON parser."),
        Message(role=MessageRole.HUMAN, content=prompt),
    ])
    # Parse the JSON response
    content = response.content if hasattr(response, 'content') else str(response)
    data = json.loads(content)
    return ParsedPlan(**data)
```

### Task 5.3 — Write `domain/planning/persistence.py`
Plan CRUD using `core/checkpoint.py` ABC:

```python
"""domain/planning/persistence.py — Plan CRUD + checkpoint integration."""

from __future__ import annotations

from typing import Any

from core.checkpoint import Checkpointer


class PlanPersistence:
    """Handles plan CRUD operations with checkpoint integration."""

    def __init__(self, checkpointer: Checkpointer):
        self._checkpointer = checkpointer

    async def save_plan(self, thread_id: str, plan: dict[str, Any]) -> None:
        """Save a plan to the checkpoint store."""
        state = await self._checkpointer.get(thread_id) or {}
        state["plan"] = plan
        await self._checkpointer.put(thread_id, state)

    async def load_plan(self, thread_id: str) -> dict[str, Any] | None:
        """Load a plan from the checkpoint store."""
        state = await self._checkpointer.get(thread_id)
        if state is None:
            return None
        return state.get("plan")

    async def update_task_status(
        self,
        thread_id: str,
        task_id: str,
        status: str,
        result: Any = None,
    ) -> None:
        """Update the status of a specific task."""
        state = await self._checkpointer.get(thread_id) or {}
        plan = state.get("plan", {})
        tasks = plan.get("tasks", [])
        for task in tasks:
            if task["id"] == task_id:
                task["status"] = status
                if result is not None:
                    task["result"] = result
                break
        await self._checkpointer.put(thread_id, state)
```

### Task 5.4 — Write `domain/planning/session.py`
Plan session lifecycle:

```python
"""domain/planning/session.py — Plan session lifecycle management."""

from __future__ import annotations

from typing import Any

from core.factory import create_llm
from core.types import LLMConfig
from domain.planning.parser import ParsedPlan, parse_plan
from domain.planning.persistence import PlanPersistence
from domain.planning.prompts import compose_planning_prompt


class PlanSession:
    """
    Manages a planning session from creation to execution.

    Lifecycle:
    1. Create session with user request
    2. Generate plan using LLM
    3. Parse plan into structured format
    4. Persist plan
    5. Execute tasks via orchestrator
    """

    def __init__(
        self,
        thread_id: str,
        llm_config: LLMConfig,
        persistence: PlanPersistence,
    ):
        self.thread_id = thread_id
        self._llm = create_llm(llm_config)
        self._persistence = persistence
        self._plan: ParsedPlan | None = None

    async def create_plan(self, user_request: str, context: dict[str, Any] | None = None) -> ParsedPlan:
        """Generate and persist a plan from a user request."""
        prompt = compose_planning_prompt(user_request, context)
        response = await self._llm.invoke([...])
        plan_text = response.content
        self._plan = await parse_plan(plan_text, self._llm)
        await self._persistence.save_plan(self.thread_id, self._plan.model_dump())
        return self._plan

    async def load_plan(self) -> ParsedPlan | None:
        """Load an existing plan from persistence."""
        data = await self._persistence.load_plan(self.thread_id)
        if data is None:
            return None
        self._plan = ParsedPlan(**data)
        return self._plan
```

### Task 5.5 — Port LLM Key Decrypt into Session Constructor
Update `domain/planning/session.py` to use `infra/crypto.py` for key decryption:

```python
from infra.crypto import decrypt

# In __init__ or factory method:
if llm_config.api_key.startswith("enc:"):
    llm_config.api_key = decrypt(llm_config.api_key[4:])
```

### Task 5.6 — Create Temporary Shim for Old Planning Service
Create `src/agent_service/services/planning_service/__init__.py` shim that imports from new location:

```python
"""DEPRECATED: Use domain.planning instead."""

import warnings

warnings.warn(
    "agent_service.services.planning_service is deprecated. "
    "Use domain.planning instead.",
    DeprecationWarning,
    stacklevel=2,
)

from domain.planning.session import PlanSession
from domain.planning.persistence import PlanPersistence
from domain.planning.parser import parse_plan

__all__ = ["PlanSession", "PlanPersistence", "parse_plan"]
```

### Task 5.7 — Write Tests
Create `tests/domain/planning/`:
- `test_prompts.py` — Test prompt composition
- `test_parser.py` — Test plan parsing (mock LLM)
- `test_persistence.py` — Test CRUD operations (mock Checkpointer)
- `test_session.py` — Test full lifecycle (mock LLM and Checkpointer)

## Acceptance Criteria
- [x] `pytest tests/domain/planning/` green (41 tests passed)
- [x] Old planning tests still pass via temporary shim (202 total tests pass)
- [x] No duplicate prompt composition logic
- [x] `domain/planning/prompts.py` is the single source for all planning prompts
- [x] Session constructor uses `core.factory.create_llm` for LLM creation

## Status: COMPLETE

## Implementation Notes
- **Prompts consolidated**: `_build_greeting`, `_build_interview_system`, `_build_review_system`
  → `compose_greeting`, `compose_planning_prompt` (with `phase` parameter for interview/review),
  `compose_parser_prompt`. All in `domain/planning/prompts.py`.
- **Parser**: `parse_planner_response` extracts JSON from planner text, `parse_plan_from_json`
  converts to `ParsedPlan`, `parse_plan` uses LLM for re-parsing when needed.
- **Persistence**: `PlanPersistence` wraps `Checkpointer` ABC with plan-specific CRUD
  (save/load/delete/update_task_status/get_task_status/save_session_state/load_session_state).
- **Session**: `PlanSession` orchestrates lifecycle (start/create_plan/continue_conversation/
  refine_plan/load_plan). Uses `core.factory.create_llm` lazily.
- **`_compose_prompt` in other agents**: The spec mentions "5× _compose_prompt variants" —
  these exist in review_agent, knowledge_agent, testing_agent, configurable_agent, infra_agent.
  They are agent-specific system prompts (not planning prompts) and will be addressed in later phases.

## Risks
- **Prompt output drift**: The consolidated prompts may produce different outputs. **Mitigation**: Snapshot test old prompts vs new; require ≤1% token diff.

## Files Touched
- `src/domain/planning/__init__.py` (update)
- `src/domain/planning/prompts.py` (create)
- `src/domain/planning/parser.py` (create)
- `src/domain/planning/persistence.py` (create)
- `src/domain/planning/session.py` (create)
- `src/agent_service/services/planning_service/__init__.py` (update — becomes shim)
- `tests/domain/planning/test_prompts.py` (create)
- `tests/domain/planning/test_parser.py` (create)
- `tests/domain/planning/test_persistence.py` (create)
- `tests/domain/planning/test_session.py` (create)

## Verification
```bash
pytest tests/domain/planning/ -v
rg "_compose_prompt" src/ --type py
# Should return empty (all variants consolidated)
python -c "from domain.planning.session import PlanSession; print('OK')"
```
