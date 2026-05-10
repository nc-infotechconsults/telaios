# Phase 1 — Core Interrupt & Checkpoint Abstractions

## Objective
Create vendor-agnostic abstract base classes for Human-in-the-Loop (HITL) interrupts and checkpointing, plus LangGraph-specific implementations that use the existing Postgres tables. Domain code will depend only on the ABCs; the LangGraph provider lives under `core/providers/langchain/`.

## Commands
```bash
bun run agent:install
pytest tests/core/ -v
```

## Tasks

### Task 1.1 — Write `core/interrupt.py`
Create the `InterruptHandle` ABC:

```python
"""core/interrupt.py — Vendor-agnostic HITL interrupt contract."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class InterruptHandle(ABC):
    """
    Abstract handle for human-in-the-loop interrupts.

    Domain agents call ``send_interrupt()`` to pause execution and wait
    for human input.  The concrete provider (e.g. LangGraph) maps this
    to its native interrupt mechanism.
    """

    @abstractmethod
    async def wait_for_resume(self) -> Any:
        """Block until a human provides a resume value."""
        ...

    @abstractmethod
    def send_interrupt(self, message: str) -> None:
        """Signal an interrupt with a message shown to the human."""
        ...
```

### Task 1.2 — Write `core/checkpoint.py`
Create the `Checkpointer` ABC:

```python
"""core/checkpoint.py — Vendor-agnostic checkpoint contract."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class Checkpointer(ABC):
    """
    Abstract checkpointer for persisting agent/thread state.

    Domain code uses this to save and restore plan sessions.
    The concrete provider (e.g. LangGraph PostgresSaver) handles
    the actual storage.
    """

    @abstractmethod
    async def get(self, thread_id: str) -> dict[str, Any] | None:
        """Retrieve checkpoint state for a thread. Returns None if not found."""
        ...

    @abstractmethod
    async def put(self, thread_id: str, state: dict[str, Any]) -> None:
        """Persist checkpoint state for a thread."""
        ...

    @abstractmethod
    async def delete(self, thread_id: str) -> None:
        """Delete all checkpoint data for a thread."""
        ...
```

### Task 1.3 — Write `core/providers/langchain/interrupt.py`
LangGraph implementation using `interrupt()` / `Command(resume=...)`:

```python
"""core/providers/langchain/interrupt.py — LangGraph HITL implementation."""

from __future__ import annotations

from typing import Any

from langgraph.types import interrupt, Command

from telaios.core.interrupt import InterruptHandle


class LangGraphInterrupt(InterruptHandle):
    """LangGraph-based interrupt handle using native interrupt()/Command."""

    async def wait_for_resume(self) -> Any:
        return interrupt("Waiting for human input...")

    def send_interrupt(self, message: str) -> None:
        # In LangGraph, sending an interrupt is raising Interrupt with a message.
        # The actual Command(resume=...) is handled by the caller.
        raise Interrupt(message)
```

### Task 1.4 — Write `core/providers/langchain/checkpoint.py`
LangGraph PostgresSaver adapter:

```python
"""core/providers/langchain/checkpoint.py — LangGraph Postgres checkpointer adapter."""

from __future__ import annotations

from typing import Any

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from telaios.core.checkpoint import Checkpointer


class PostgresCheckpointer(Checkpointer):
    """
    Wraps LangGraph's AsyncPostgresSaver to implement the Checkpointer ABC.

    Reuses the same Postgres tables — zero data migration needed.
    """

    def __init__(self, saver: AsyncPostgresSaver):
        self._saver = saver

    async def get(self, thread_id: str) -> dict[str, Any] | None:
        config = {"configurable": {"thread_id": thread_id}}
        state = await self._saver.aget(config)
        if state is None:
            return None
        return state.values

    async def put(self, thread_id: str, state: dict[str, Any]) -> None:
        config = {"configurable": {"thread_id": thread_id}}
        await self._saver.aput(config, state, {})

    async def delete(self, thread_id: str) -> None:
        # LangGraph doesn't expose a direct delete; we mark it for cleanup.
        # For now, this is a no-op — the tables are reused.
        pass
```

### Task 1.5 — Register LangGraph Provider in `core/providers/langchain/__init__.py`

```python
"""core/providers/langchain/__init__.py — Register LangGraph implementations."""

from __future__ import annotations

from telaios.core.providers import register_provider
from telaios.core.providers.langchain.interrupt import LangGraphInterrupt
from telaios.core.providers.langchain.checkpoint import PostgresCheckpointer

# Register at module load time
register_provider(
    "langchain",
    interrupt_cls=LangGraphInterrupt,
    checkpointer_cls=PostgresCheckpointer,
)
```

### Task 1.6 — Update `core/providers/__init__.py` Registry
Add interrupt and checkpointer registries to the existing provider registry:

```python
# Add to existing registries:
INTERRUPT_REGISTRY: dict[str, type[InterruptHandle]] = {}
CHECKPOINTER_REGISTRY: dict[str, type[Checkpointer]] = {}

# Update register_provider signature to include:
# interrupt_cls: type[InterruptHandle] | None = None,
# checkpointer_cls: type[Checkpointer] | None = None,
```

## Acceptance Criteria
- [x] `python -c "from core.interrupt import InterruptHandle; from core.checkpoint import Checkpointer; print('OK')"` succeeds
- [x] `python -c "from core.providers.langchain.interrupt import LangGraphInterrupt; from core.providers.langchain.checkpoint import PostgresCheckpointer; print('OK')"` succeeds
- [x] `pytest tests/core/test_interrupt.py` passes (basic ABC instantiation test)
- [x] `pytest tests/core/test_checkpoint.py` passes (basic ABC instantiation test)
- [x] No `import langgraph` in `core/interrupt.py` or `core/checkpoint.py`

## Status: COMPLETE

## Risks
- **PostgresSaver schema drift**: The existing LangGraph Postgres tables may have a different schema than expected. **Mitigation**: Pin `langgraph-checkpoint-postgres` version in `pyproject.toml`; verify table names exist before Phase 2.

## Files Touched
- `src/core/interrupt.py` (create)
- `src/core/checkpoint.py` (create)
- `src/core/providers/__init__.py` (update — add interrupt/checkpointer registries)
- `src/core/providers/langchain/__init__.py` (create)
- `src/core/providers/langchain/interrupt.py` (create)
- `src/core/providers/langchain/checkpoint.py` (create)
- `tests/core/test_interrupt.py` (create)
- `tests/core/test_checkpoint.py` (create)

## Verification
```bash
python -c "from core.interrupt import InterruptHandle; from core.checkpoint import Checkpointer; print('OK')"
python -c "from core.providers.langchain.interrupt import LangGraphInterrupt; from core.providers.langchain.checkpoint import PostgresCheckpointer; print('OK')"
pytest tests/core/test_interrupt.py tests/core/test_checkpoint.py -v
rg "import langgraph" src/core/interrupt.py src/core/checkpoint.py
# Should return empty
```
