"""
domain/orchestration/pool.py
----------------------------
Agent worker pool for concurrent task execution.

Uses ``core.Agent`` ABC — no framework imports.

Usage::

    from domain.orchestration.pool import WorkerPool

    pool = WorkerPool(agent, max_concurrent=5)
    result = await pool.execute("task-1", "Do something")
    results = await pool.execute_batch([("t1", "input1"), ("t2", "input2")])
"""

from __future__ import annotations

import asyncio
from typing import Any

from core.agent import Agent
from core.types import AgentInput, AgentOutput, Message, MessageRole


class WorkerPool:
    """
    Manages a pool of agent workers for concurrent task execution.

    Workers pull tasks from a queue and execute them using the injected Agent.
    Concurrency is limited by a semaphore.
    """

    def __init__(self, agent: Agent, max_concurrent: int = 5):
        self._agent = agent
        self._max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def execute(self, task_id: str, input_text: str) -> AgentOutput:
        """Execute a single task using the agent.

        Args:
            task_id: Identifier for the task (for logging/tracking).
            input_text: The input text to send to the agent.

        Returns:
            The agent's output.
        """
        async with self._semaphore:
            agent_input = AgentInput(
                messages=[Message(role=MessageRole.HUMAN, content=input_text)]
            )
            return await self._agent.run(agent_input)

    async def execute_batch(
        self, tasks: list[tuple[str, str]]
    ) -> dict[str, AgentOutput]:
        """Execute multiple tasks concurrently, respecting max_concurrent limit.

        Args:
            tasks: List of (task_id, input_text) tuples.

        Returns:
            Dict mapping task_id to AgentOutput (or error output).
        """
        results: dict[str, AgentOutput] = {}
        coros = [self.execute(tid, input_text) for tid, input_text in tasks]
        outputs = await asyncio.gather(*coros, return_exceptions=True)

        for (tid, _), output in zip(tasks, outputs):
            if isinstance(output, Exception):
                results[tid] = AgentOutput(content=f"Error: {output}")
            else:
                results[tid] = output

        return results
