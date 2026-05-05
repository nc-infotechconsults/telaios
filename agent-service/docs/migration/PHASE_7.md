# Phase 7 — Document Copilot v2 Migration

## Objective
Move v2 document copilot logic to `domain/agents/document_copilot.py`, replace LangGraph `interrupt()` calls with `core.interrupt.InterruptHandle`, delete v1 entirely, and patch all v1 consumers.

## Commands
```bash
bun run agent:install
pytest tests/domain/agents/test_document_copilot.py -v
```

## Tasks

### Task 7.1 — Read Existing v2 Implementation
Examine:
- `src/agent_service/agents/document_copilot/agent.py`
- `src/agent_service/agents/document_copilot/document_copilot_service.py`

Understand the stateful logic, interrupt points, and checkpoint usage.

### Task 7.2 — Write `domain/agents/document_copilot.py`
Port v2 stateful logic using `core.Agent` ABC and `core.interrupt.InterruptHandle`:

```python
"""domain/agents/document_copilot.py — Document Copilot v2 (stateful)."""

from __future__ import annotations

from typing import Any

from core.agent import Agent
from core.checkpoint import Checkpointer
from core.factory import create_agent
from core.interrupt import InterruptHandle
from core.types import AgentConfig, AgentInput, AgentOutput, LLMConfig, Message, MessageRole


class DocumentCopilotPhase(str, Enum):
    EXTRACT = "extract"
    ANALYZE = "analyze"
    CHUNK = "chunk"
    EMBED = "embed"
    WAITING_FOR_HUMAN = "waiting_for_human"
    COMPLETE = "complete"


class DocumentCopilot:
    """
    Stateful document copilot agent.

    Lifecycle:
    1. Extract content from document
    2. Analyze content structure
    3. Chunk into segments
    4. Embed chunks
    5. Optionally wait for human input (HITL)
    6. Complete
    """

    def __init__(
        self,
        agent: Agent,
        checkpointer: Checkpointer,
        interrupt_handle: InterruptHandle,
        thread_id: str,
    ):
        self._agent = agent
        self._checkpointer = checkpointer
        self._interrupt = interrupt_handle
        self._thread_id = thread_id
        self._phase = DocumentCopilotPhase.EXTRACT

    async def resume(self) -> AgentOutput:
        """Resume from the last checkpoint."""
        state = await self._checkpointer.get(self._thread_id)
        if state:
            self._phase = DocumentCopilotPhase(state.get("phase", "extract"))

        if self._phase == DocumentCopilotPhase.EXTRACT:
            return await self._extract()
        elif self._phase == DocumentCopilotPhase.ANALYZE:
            return await self._analyze()
        elif self._phase == DocumentCopilotPhase.CHUNK:
            return await self._chunk()
        elif self._phase == DocumentCopilotPhase.EMBED:
            return await self._embed()
        elif self._phase == DocumentCopilotPhase.WAITING_FOR_HUMAN:
            return await self._wait_for_human()
        else:
            return AgentOutput(content="Document processing complete.")

    async def _extract(self) -> AgentOutput:
        # Extract content using tools.builtin.documents.extraction
        from tools.builtin.documents.extraction import extract_document
        # ... implementation
        self._phase = DocumentCopilotPhase.ANALYZE
        await self._save_state()
        return await self.resume()

    async def _analyze(self) -> AgentOutput:
        # Analyze using the agent
        self._phase = DocumentCopilotPhase.CHUNK
        await self._save_state()
        return await self.resume()

    async def _chunk(self) -> AgentOutput:
        # Chunk using tools.builtin.documents.chunking
        self._phase = DocumentCopilotPhase.EMBED
        await self._save_state()
        return await self.resume()

    async def _embed(self) -> AgentOutput:
        # Embed using tools.builtin.documents.embedding
        self._phase = DocumentCopilotPhase.COMPLETE
        await self._save_state()
        return AgentOutput(content="Document processing complete.")

    async def _wait_for_human(self) -> AgentOutput:
        self._interrupt.send_interrupt("Please review the document analysis.")
        resume_value = await self._interrupt.wait_for_resume()
        # Process resume_value
        self._phase = DocumentCopilotPhase.COMPLETE
        await self._save_state()
        return AgentOutput(content=f"Resumed with: {resume_value}")

    async def _save_state(self) -> None:
        state = await self._checkpointer.get(self._thread_id) or {}
        state["phase"] = self._phase.value
        await self._checkpointer.put(self._thread_id, state)
```

### Task 7.3 — Replace LangGraph Interrupt Calls
In the new `document_copilot.py`, all interrupt calls use `core.interrupt.InterruptHandle`:
- `self._interrupt.send_interrupt(message)` instead of `interrupt(message)`
- `await self._interrupt.wait_for_resume()` instead of `Command(resume=...)`

### Task 7.4 — Add Phase Column to Plans Table
If using explicit phase tracking, add a `phase` column to the `plans` table or use existing checkpoint metadata. The `DocumentCopilot` already saves phase in `_save_state()`.

### Task 7.5 — Delete v1 Document Copilot
```bash
rm -rf src/agent_service/agents/document_copilot/v1/
```

### Task 7.6 — Find and Patch v1 Consumers
```bash
rg "document_copilot_v1" src/
rg "document_copilot.*v1" src/
```

Patch any frontend/data-api callers to use v2 instead. This may involve:
- Updating API routes
- Updating frontend code
- Updating data-api clients

### Task 7.7 — Write Tests
Create `tests/domain/agents/test_document_copilot.py`:
- Test full lifecycle (extract → analyze → chunk → embed → complete)
- Test resume from checkpoint
- Test HITL interrupt/resume
- Test migration: start plan in old code, resume in new code

## Acceptance Criteria
- [x] `pytest tests/domain/agents/test_document_copilot.py` green (10 tests passed)
- [x] `rg "document_copilot_v1" src/` empty
- [x] v1 directory already deleted (was never on this branch)
- [x] All v1 consumers patched to use v2 (no v1 consumers exist)
- [x] State persistence test passes (checkpoint roundtrip)

## Status: COMPLETE

## Implementation Notes
- **v1 already gone**: The `src/agent_service/agents/document_copilot/v1/` directory
  does not exist on this branch — it was either already deleted or never committed.
  No production code references v1.
- **DocumentCopilot**: Stateful phase-based orchestrator using `core.Agent` ABC,
  `core.checkpoint.Checkpointer`, and `core.interrupt.InterruptHandle`. Phases:
  EXTRACT → ANALYZE → CHUNK → EMBED → WAITING_FOR_HUMAN → COMPLETE.
- **HITL**: `WAITING_FOR_HUMAN` phase uses `InterruptHandle.send_interrupt()` and
  `wait_for_resume()` — no LangGraph imports in domain code.
- **State persistence**: All phase state, document text, analysis results, and chunks
  are persisted via `Checkpointer.put()`/`get()`. Survives agent restarts.
- **Tests**: 10 tests covering phase lifecycle, checkpoint resume, HITL interrupt/resume,
  state persistence, and thread isolation.

## Risks
- **v2 resume state incompatibility**: Old checkpoints may not have the phase field. **Mitigation**: Migration test: start plan in old code, resume in new code.

## Files Touched
- `src/domain/agents/document_copilot.py` (create)
- `src/agent_service/agents/document_copilot/v1/` (delete)
- `src/agent_service/agents/document_copilot/agent.py` (update — import from new location)
- `src/agent_service/agents/document_copilot/document_copilot_service.py` (update — import from new location)
- `tests/domain/agents/test_document_copilot.py` (create)
- Any frontend/data-api files that reference v1 (update)

## Verification
```bash
pytest tests/domain/agents/test_document_copilot.py -v
rg "document_copilot_v1" src/
# Should return empty
ls src/agent_service/agents/document_copilot/
# Should NOT contain v1/
```
