"""tests/domain/orchestration/test_scheduler.py — Tests for DAG scheduler."""

from __future__ import annotations

import pytest

from domain.orchestration.scheduler import DAGScheduler, TaskNode


class TestTaskNode:
    """Tests for TaskNode."""

    def test_basic_node(self):
        node = TaskNode("t1")
        assert node.task_id == "t1"
        assert node.depends_on == []
        assert node.status == "pending"
        assert node.result is None

    def test_node_with_deps(self):
        node = TaskNode("t2", depends_on=["t1"])
        assert node.depends_on == ["t1"]

    def test_repr(self):
        node = TaskNode("t1")
        assert "t1" in repr(node)


class TestDAGScheduler:
    """Tests for DAGScheduler."""

    def test_linear_chain(self):
        tasks = [
            TaskNode("a"),
            TaskNode("b", ["a"]),
            TaskNode("c", ["b"]),
        ]
        scheduler = DAGScheduler(tasks)
        order = scheduler.get_execution_order()
        assert order == ["a", "b", "c"]

    def test_diamond_dependency(self):
        tasks = [
            TaskNode("a"),
            TaskNode("b", ["a"]),
            TaskNode("c", ["a"]),
            TaskNode("d", ["b", "c"]),
        ]
        scheduler = DAGScheduler(tasks)
        order = scheduler.get_execution_order()
        assert order.index("a") < order.index("b")
        assert order.index("a") < order.index("c")
        assert order.index("b") < order.index("d")
        assert order.index("c") < order.index("d")

    def test_independent_tasks(self):
        tasks = [TaskNode("a"), TaskNode("b"), TaskNode("c")]
        scheduler = DAGScheduler(tasks)
        order = set(scheduler.get_execution_order())
        assert order == {"a", "b", "c"}

    def test_circular_dependency_raises(self):
        tasks = [
            TaskNode("a", ["c"]),
            TaskNode("b", ["a"]),
            TaskNode("c", ["b"]),
        ]
        scheduler = DAGScheduler(tasks)
        with pytest.raises(ValueError, match="Circular"):
            scheduler.get_execution_order()

    def test_get_ready_tasks_initial(self):
        tasks = [
            TaskNode("a"),
            TaskNode("b", ["a"]),
            TaskNode("c"),
        ]
        scheduler = DAGScheduler(tasks)
        ready = scheduler.get_ready_tasks()
        ready_ids = {t.task_id for t in ready}
        assert ready_ids == {"a", "c"}

    def test_get_ready_tasks_after_completion(self):
        tasks = [
            TaskNode("a"),
            TaskNode("b", ["a"]),
            TaskNode("c", ["a"]),
        ]
        scheduler = DAGScheduler(tasks)
        scheduler.mark_completed("a")
        ready = scheduler.get_ready_tasks()
        ready_ids = {t.task_id for t in ready}
        assert ready_ids == {"b", "c"}

    def test_mark_completed(self):
        tasks = [TaskNode("a")]
        scheduler = DAGScheduler(tasks)
        scheduler.mark_completed("a", result="done")
        assert scheduler.get_task("a").status == "completed"
        assert scheduler.get_task("a").result == "done"

    def test_mark_failed(self):
        tasks = [TaskNode("a")]
        scheduler = DAGScheduler(tasks)
        scheduler.mark_failed("a", error=RuntimeError("oops"))
        assert scheduler.get_task("a").status == "failed"
        assert isinstance(scheduler.get_task("a").result, RuntimeError)

    def test_mark_running(self):
        tasks = [TaskNode("a")]
        scheduler = DAGScheduler(tasks)
        scheduler.mark_running("a")
        assert scheduler.get_task("a").status == "running"

    def test_mark_unknown_task_raises(self):
        tasks = [TaskNode("a")]
        scheduler = DAGScheduler(tasks)
        with pytest.raises(KeyError):
            scheduler.mark_completed("missing")

    def test_all_completed(self):
        tasks = [TaskNode("a"), TaskNode("b")]
        scheduler = DAGScheduler(tasks)
        assert not scheduler.all_completed()
        scheduler.mark_completed("a")
        assert not scheduler.all_completed()
        scheduler.mark_completed("b")
        assert scheduler.all_completed()

    def test_all_completed_with_failures(self):
        tasks = [TaskNode("a"), TaskNode("b")]
        scheduler = DAGScheduler(tasks)
        scheduler.mark_completed("a")
        scheduler.mark_failed("b")
        assert scheduler.all_completed()

    def test_get_failed_tasks(self):
        tasks = [TaskNode("a"), TaskNode("b")]
        scheduler = DAGScheduler(tasks)
        scheduler.mark_failed("a")
        failed = scheduler.get_failed_tasks()
        assert len(failed) == 1
        assert failed[0].task_id == "a"

    def test_empty_graph(self):
        scheduler = DAGScheduler([])
        assert scheduler.get_execution_order() == []
        assert scheduler.get_ready_tasks() == []
        assert scheduler.all_completed()
