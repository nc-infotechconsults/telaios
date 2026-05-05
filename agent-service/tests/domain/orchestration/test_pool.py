"""tests/domain/orchestration/test_pool.py — Tests for worker pool."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from core.types import AgentInput, AgentOutput, Message, MessageRole
from domain.orchestration.pool import WorkerPool


def _make_mock_agent(response: str = "done"):
    """Create a mock Agent that returns a fixed response."""
    agent = AsyncMock()
    agent.run = AsyncMock(return_value=AgentOutput(content=response))
    return agent


class TestWorkerPool:
    """Tests for WorkerPool."""

    @pytest.mark.asyncio
    async def test_execute_single(self):
        agent = _make_mock_agent("hello")
        pool = WorkerPool(agent, max_concurrent=2)
        result = await pool.execute("t1", "do something")
        assert result.content == "hello"
        agent.run.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_batch(self):
        agent = _make_mock_agent("ok")
        pool = WorkerPool(agent, max_concurrent=3)
        tasks = [("t1", "input1"), ("t2", "input2"), ("t3", "input3")]
        results = await pool.execute_batch(tasks)
        assert len(results) == 3
        assert all(r.content == "ok" for r in results.values())

    @pytest.mark.asyncio
    async def test_execute_batch_with_error(self):
        agent = AsyncMock()
        agent.run = AsyncMock(side_effect=RuntimeError("agent failed"))
        pool = WorkerPool(agent, max_concurrent=2)
        tasks = [("t1", "input1"), ("t2", "input2")]
        results = await pool.execute_batch(tasks)
        assert len(results) == 2
        assert all("Error" in r.content for r in results.values())

    @pytest.mark.asyncio
    async def test_concurrency_limit(self):
        """Verify that max_concurrent is respected."""
        call_count = 0
        max_concurrent_seen = 0

        async def tracking_run(input: AgentInput):
            nonlocal call_count, max_concurrent_seen
            call_count += 1
            max_concurrent_seen = max(max_concurrent_seen, call_count)
            await asyncio.sleep(0.05)
            call_count -= 1
            return AgentOutput(content="done")

        agent = AsyncMock()
        agent.run = tracking_run
        pool = WorkerPool(agent, max_concurrent=2)

        tasks = [(f"t{i}", f"input{i}") for i in range(10)]
        results = await pool.execute_batch(tasks)
        assert len(results) == 10
        assert max_concurrent_seen <= 2


class TestWorkerPoolStress:
    """Stress test with 50 concurrent dummy agents."""

    @pytest.mark.asyncio
    async def test_50_concurrent_tasks(self):
        agent = _make_mock_agent("ok")
        pool = WorkerPool(agent, max_concurrent=10)
        tasks = [(f"t{i}", f"input{i}") for i in range(50)]
        results = await pool.execute_batch(tasks)
        assert len(results) == 50
        assert all(r.content == "ok" for r in results.values())
