# Phase 6 — Orchestration Layer (Coordinator Migration)

## Objective
Move scheduler/pool/drivers out of `agents/coordinator/` into `domain/orchestration/`. Ensure all orchestration code uses `core.Agent` ABC only — zero LangGraph imports in domain code.

## Commands
```bash
bun run agent:install
pytest tests/domain/orchestration/ -v
```

## Tasks

### Task 6.1 — Write `domain/orchestration/scheduler.py`
Generic DAG scheduler honoring `depends_on`:

```python
"""domain/orchestration/scheduler.py — DAG scheduler for task execution."""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Any


class TaskNode:
    def __init__(self, task_id: str, depends_on: list[str] | None = None):
        self.task_id = task_id
        self.depends_on = depends_on or []
        self.status = "pending"  # pending | running | completed | failed
        self.result: Any = None


class DAGScheduler:
    """
    Schedules tasks based on dependency graph.

    Tasks are executed in topological order, respecting depends_on constraints.
    """

    def __init__(self, tasks: list[TaskNode]):
        self._tasks = {t.task_id: t for t in tasks}
        self._graph = self._build_graph(tasks)

    def _build_graph(self, tasks: list[TaskNode]) -> dict[str, list[str]]:
        graph = defaultdict(list)
        for task in tasks:
            for dep in task.depends_on:
                graph[dep].append(task.task_id)
        return graph

    def get_execution_order(self) -> list[str]:
        """Return tasks in topological order."""
        in_degree = defaultdict(int)
        for task in self._tasks.values():
            for dep in task.depends_on:
                in_degree[task.task_id] += 1

        queue = deque([tid for tid in self._tasks if in_degree[tid] == 0])
        order = []

        while queue:
            task_id = queue.popleft()
            order.append(task_id)
            for dependent in self._graph[task_id]:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        if len(order) != len(self._tasks):
            raise ValueError("Circular dependency detected in task graph")

        return order

    def get_ready_tasks(self) -> list[TaskNode]:
        """Return tasks that are ready to execute (all deps completed)."""
        ready = []
        for task in self._tasks.values():
            if task.status != "pending":
                continue
            deps_completed = all(
                self._tasks[dep].status == "completed"
                for dep in task.depends_on
            )
            if deps_completed:
                ready.append(task)
        return ready

    def mark_completed(self, task_id: str, result: Any) -> None:
        self._tasks[task_id].status = "completed"
        self._tasks[task_id].result = result

    def mark_failed(self, task_id: str, error: Exception) -> None:
        self._tasks[task_id].status = "failed"
        self._tasks[task_id].result = error
```

### Task 6.2 — Write `domain/orchestration/pool.py`
Agent worker pool:

```python
"""domain/orchestration/pool.py — Agent worker pool for concurrent execution."""

from __future__ import annotations

import asyncio
from typing import Any

from telaios.core.agent import Agent
from telaios.core.types import AgentInput, AgentOutput, Message, MessageRole


class WorkerPool:
    """
    Manages a pool of agent workers for concurrent task execution.

    Workers pull tasks from a queue and execute them using the injected Agent.
    """

    def __init__(self, agent: Agent, max_concurrent: int = 5):
        self._agent = agent
        self._max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def execute(self, task_id: str, input_text: str) -> AgentOutput:
        """Execute a single task using the agent."""
        async with self._semaphore:
            agent_input = AgentInput(
                messages=[Message(role=MessageRole.HUMAN, content=input_text)]
            )
            return await self._agent.run(agent_input)

    async def execute_batch(self, tasks: list[tuple[str, str]]) -> dict[str, AgentOutput]:
        """Execute multiple tasks concurrently, respecting max_concurrent limit."""
        results = {}
        coros = [self.execute(tid, input_text) for tid, input_text in tasks]
        outputs = await asyncio.gather(*coros, return_exceptions=True)

        for (tid, _), output in zip(tasks, outputs):
            if isinstance(output, Exception):
                results[tid] = AgentOutput(content=f"Error: {output}")
            else:
                results[tid] = output

        return results
```

### Task 6.3 — Write `domain/orchestration/drivers.py`
Vendor-specific drivers interface:

```python
"""domain/orchestration/drivers.py — Vendor driver interface for orchestration."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from telaios.core.agent import Agent
from telaios.core.types import AgentInput, AgentOutput


class AgentDriver(ABC):
    """
    Abstract driver for executing agents on a specific platform.

    Concrete implementations (OpenCode, GitHub Copilot) handle the
    platform-specific invocation details.
    """

    @abstractmethod
    async def execute(self, agent: Agent, input: AgentInput) -> AgentOutput:
        """Execute an agent using the driver's platform."""
        ...

    @abstractmethod
    async def stream(self, agent: Agent, input: AgentInput):
        """Stream execution events from the agent."""
        ...
```

### Task 6.4 — Create `core/providers/opencode/driver.py`
OpenCode driver implementation:

```python
"""core/providers/opencode/driver.py — OpenCode agent driver."""

from __future__ import annotations

from typing import Any

from telaios.core.agent import Agent
from telaios.core.types import AgentInput, AgentOutput
from telaios.domain.orchestration.drivers import AgentDriver


class OpenCodeDriver(AgentDriver):
    """Driver for executing agents via OpenCode platform."""

    async def execute(self, agent: Agent, input: AgentInput) -> AgentOutput:
        return await agent.run(input)

    async def stream(self, agent: Agent, input: AgentInput):
        async for event in agent.astream(input):
            yield event
```

### Task 6.5 — Create `core/providers/github_copilot/driver.py`
GitHub Copilot driver implementation:

```python
"""core/providers/github_copilot/driver.py — GitHub Copilot agent driver."""

from __future__ import annotations

from typing import Any

from telaios.core.agent import Agent
from telaios.core.types import AgentInput, AgentOutput
from telaios.domain.orchestration.drivers import AgentDriver


class GitHubCopilotDriver(AgentDriver):
    """Driver for executing agents via GitHub Copilot platform."""

    async def execute(self, agent: Agent, input: AgentInput) -> AgentOutput:
        # GitHub Copilot specific invocation
        return await agent.run(input)

    async def stream(self, agent: Agent, input: AgentInput):
        async for event in agent.astream(input):
            yield event
```

### Task 6.6 — Verify Zero LangGraph Imports in Domain
Run verification:
```bash
rg "import langgraph" src/domain/orchestration/
# Should return empty
```

### Task 6.7 — Write Tests
Create `tests/domain/orchestration/`:
- `test_scheduler.py` — Test DAG scheduling, cycle detection, ready tasks
- `test_pool.py` — Test worker pool concurrency
- `test_drivers.py` — Test driver interface (mock Agent)

## Acceptance Criteria
- [x] `pytest tests/domain/orchestration/` green (27 tests passed)
- [x] No `import langgraph` in `domain/orchestration/`
- [x] All orchestration code uses `core.Agent` ABC only
- [x] Stress test with 50 concurrent dummy agents passes

## Status: COMPLETE

## Implementation Notes
- **Scheduler**: `DAGScheduler` with Kahn's topological sort, cycle detection,
  ready-task detection, mark completed/failed/running, all_completed, get_failed_tasks.
- **Pool**: `WorkerPool` with semaphore-based concurrency limiting. `execute` for single
  tasks, `execute_batch` for concurrent execution. Error handling wraps exceptions in
  `AgentOutput(content="Error: ...")`.
- **Drivers**: `AgentDriver` ABC with `execute` and `stream` methods. Concrete
  `OpenCodeDriver` and `GitHubCopilotDriver` delegate to agent's `run`/`astream`.
- **Tests**: 27 tests covering scheduler (15), pool (5), drivers (7). Includes stress
  test with 50 concurrent tasks.

## Risks
- **Race conditions in pool**: Concurrent execution may cause issues. **Mitigation**: Stress-test with 50 concurrent dummy agents.

## Files Touched
- `src/domain/orchestration/__init__.py` (update)
- `src/domain/orchestration/scheduler.py` (create)
- `src/domain/orchestration/pool.py` (create)
- `src/domain/orchestration/drivers.py` (create)
- `src/core/providers/opencode/driver.py` (create)
- `src/core/providers/github_copilot/driver.py` (create)
- `tests/domain/orchestration/test_scheduler.py` (create)
- `tests/domain/orchestration/test_pool.py` (create)
- `tests/domain/orchestration/test_drivers.py` (create)

## Verification
```bash
pytest tests/domain/orchestration/ -v
rg "import langgraph" src/domain/orchestration/
# Should return empty
python -c "
import asyncio
from domain.orchestration.scheduler import DAGScheduler, TaskNode
tasks = [TaskNode('a'), TaskNode('b', ['a']), TaskNode('c', ['a', 'b'])]
s = DAGScheduler(tasks)
print(s.get_execution_order())
"
```
