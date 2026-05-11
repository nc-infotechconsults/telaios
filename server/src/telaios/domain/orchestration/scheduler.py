"""
domain/orchestration/scheduler.py
---------------------------------
DAG scheduler for task execution.

Schedules tasks based on dependency graph, executing in topological order.
No framework imports — uses only stdlib and core types.

Usage::

    from domain.orchestration.scheduler import DAGScheduler, TaskNode

    tasks = [
        TaskNode("a"),
        TaskNode("b", depends_on=["a"]),
        TaskNode("c", depends_on=["a", "b"]),
    ]
    scheduler = DAGScheduler(tasks)
    order = scheduler.get_execution_order()  # ["a", "b", "c"]
"""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Any


class TaskNode:
    """A single task in the execution graph."""

    def __init__(self, task_id: str, depends_on: list[str] | None = None):
        self.task_id = task_id
        self.depends_on = depends_on or []
        self.status = "pending"  # pending | running | completed | failed
        self.result: Any = None

    def __repr__(self) -> str:
        return f"TaskNode({self.task_id!r}, status={self.status!r})"


class DAGScheduler:
    """
    Schedules tasks based on dependency graph.

    Tasks are executed in topological order, respecting depends_on constraints.
    Supports dynamic task completion and ready-task detection.
    """

    def __init__(self, tasks: list[TaskNode]):
        self._tasks = {t.task_id: t for t in tasks}
        self._graph = self._build_graph(tasks)

    def _build_graph(self, tasks: list[TaskNode]) -> dict[str, list[str]]:
        """Build adjacency list: dependency → list of dependents."""
        graph: dict[str, list[str]] = defaultdict(list)
        for task in tasks:
            for _dep in task.depends_on:
                graph[_dep].append(task.task_id)
        return graph

    def get_execution_order(self) -> list[str]:
        """Return tasks in topological order (Kahn's algorithm).

        Raises:
            ValueError: If the graph contains a circular dependency.
        """
        in_degree: dict[str, int] = defaultdict(int)
        for task in self._tasks.values():
            for _dep in task.depends_on:
                in_degree[task.task_id] += 1

        queue = deque([tid for tid in self._tasks if in_degree[tid] == 0])
        order: list[str] = []

        while queue:
            task_id = queue.popleft()
            order.append(task_id)
            for dependent in self._graph.get(task_id, []):
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        if len(order) != len(self._tasks):
            raise ValueError("Circular dependency detected in task graph")

        return order

    def get_ready_tasks(self) -> list[TaskNode]:
        """Return tasks that are ready to execute (all deps completed)."""
        ready: list[TaskNode] = []
        for task in self._tasks.values():
            if task.status != "pending":
                continue
            deps_completed = all(
                self._tasks[dep].status == "completed"
                for dep in task.depends_on
                if dep in self._tasks
            )
            if deps_completed:
                ready.append(task)
        return ready

    def mark_completed(self, task_id: str, result: Any = None) -> None:
        """Mark a task as completed with an optional result."""
        if task_id not in self._tasks:
            raise KeyError(f"Unknown task: {task_id}")
        self._tasks[task_id].status = "completed"
        self._tasks[task_id].result = result

    def mark_failed(self, task_id: str, error: Exception | None = None) -> None:
        """Mark a task as failed with an optional error."""
        if task_id not in self._tasks:
            raise KeyError(f"Unknown task: {task_id}")
        self._tasks[task_id].status = "failed"
        self._tasks[task_id].result = error

    def mark_running(self, task_id: str) -> None:
        """Mark a task as currently running."""
        if task_id not in self._tasks:
            raise KeyError(f"Unknown task: {task_id}")
        self._tasks[task_id].status = "running"

    def get_task(self, task_id: str) -> TaskNode:
        """Get a task by ID."""
        return self._tasks[task_id]

    def all_completed(self) -> bool:
        """Return True if all tasks are completed or failed."""
        return all(t.status in ("completed", "failed") for t in self._tasks.values())

    def get_failed_tasks(self) -> list[TaskNode]:
        """Return all tasks that have failed."""
        return [t for t in self._tasks.values() if t.status == "failed"]
