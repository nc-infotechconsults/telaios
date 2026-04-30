"""
Unit tests for the Scheduler.

All external dependencies (data_client, sse_manager, redis, git) are mocked.
"""
from __future__ import annotations

import asyncio

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_task(overrides: dict = {}):
    return {
        "id": "task-1",
        "title": "Code Task",
        "description": "Write some code",
        "type": "code",
        "status": "pending",
        "agent_profile_id": "profile-1",
        "depends_on_task_ids": [],
        "repository_ids": ["repo-1"],
        **overrides,
    }


def make_repo(overrides: dict = {}):
    return {
        "id": "repo-1",
        "name": "test-repo",
        "remote_url": "https://github.com/test/test-repo",
        "branch": "main",
        "auth_type": "none",
        "credentials": "",
        **overrides,
    }


def _mock_driver(success: bool = True, output: str = "done", error: str | None = None, artifacts=None):
    from agent_service.agents.coordinator.drivers.base import AgentResult
    driver = MagicMock()
    driver.execute = AsyncMock(return_value=AgentResult(success=success, output=output, error=error, artifacts=artifacts or []))
    driver.get_status = AsyncMock(return_value="idle")
    return driver


def _mock_pool(driver=None):
    pool = MagicMock()
    # Role-based lookups return None so the post-exec pipeline is a no-op
    # (reviewer/tester not registered in these scheduler-level tests).
    pool.get_driver_by_role = MagicMock(return_value=None)
    pool.get_driver = MagicMock(return_value=driver)
    return pool


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_data_client():
    with patch("agent_service.agents.coordinator.scheduler.data_client") as m:
        m.get_project_repositories = AsyncMock(return_value=[make_repo()])
        m.get_plan_tasks = AsyncMock(return_value=[make_task()])
        m.update_plan = AsyncMock(return_value={})
        m.update_task = AsyncMock(return_value={})
        m.complete_plan_execution = AsyncMock(return_value=None)
        m.fail_plan_execution = AsyncMock(return_value=None)
        m.skip_dependent_tasks = AsyncMock(return_value=None)
        m.create_task_artifacts = AsyncMock(return_value=None)
        m.update_repository_status = AsyncMock(return_value={})
        yield m


@pytest.fixture
def mock_sse():
    with patch("agent_service.agents.coordinator.scheduler.sse_manager") as m:
        m.broadcast = MagicMock()
        yield m


@pytest.fixture
def mock_redis():
    redis_mock = AsyncMock()
    redis_mock.publish = AsyncMock(return_value=None)
    with patch("agent_service.agents.coordinator.scheduler.get_redis", return_value=redis_mock):
        yield redis_mock


@pytest.fixture
def mock_orchestration():
    orch_mock = MagicMock()
    orch_mock.notify_task_complete = MagicMock()
    with patch("agent_service.agents.coordinator.scheduler.OrchestrationService") as cls:
        cls.get_instance = MagicMock(return_value=orch_mock)
        yield orch_mock


@pytest.fixture
def mock_git():
    async def fake_subprocess(*args, **kwargs):
        proc = AsyncMock()
        proc.returncode = 1  # clone "fails" → triggers pull path
        proc.communicate = AsyncMock(return_value=(b"", b"already exists"))
        proc.wait = AsyncMock(return_value=0)
        return proc

    with patch("asyncio.create_subprocess_exec", side_effect=fake_subprocess):
        yield


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_marks_plan_as_executing(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    driver = _mock_driver()
    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    mock_data_client.update_plan.assert_any_call("plan-1", {"status": "executing"})


@pytest.mark.asyncio
async def test_marks_plan_as_completed_on_success(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    driver = _mock_driver()
    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    mock_data_client.complete_plan_execution.assert_called_once_with("plan-1")


@pytest.mark.asyncio
async def test_marks_plan_as_failed_on_exception(mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    with patch("agent_service.agents.coordinator.scheduler.data_client") as m:
        m.get_project_repositories = AsyncMock(side_effect=RuntimeError("Network down"))
        m.update_plan = AsyncMock(return_value={})
        m.fail_plan_execution = AsyncMock(return_value=None)

        driver = _mock_driver()
        pool = _mock_pool(driver)
        scheduler = Scheduler(pool)

        with pytest.raises(RuntimeError, match="Network down"):
            await scheduler.run("project-1", "plan-1")

        m.fail_plan_execution.assert_called_once_with("plan-1", "Network down")


@pytest.mark.asyncio
async def test_emits_plan_executing_sse(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    driver = _mock_driver()
    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    calls = [call.args[1] for call in mock_sse.broadcast.call_args_list]
    assert any(c.get("type") == "plan_executing" and c.get("plan_id") == "plan-1" for c in calls)


@pytest.mark.asyncio
async def test_emits_plan_completed_sse(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    driver = _mock_driver()
    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    calls = [call.args[1] for call in mock_sse.broadcast.call_args_list]
    assert any(c.get("type") == "plan_completed" and c.get("plan_id") == "plan-1" for c in calls)


@pytest.mark.asyncio
async def test_task_lifecycle_in_progress_then_done(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    driver = _mock_driver()
    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    calls = mock_data_client.update_task.call_args_list
    assert calls[0] == (("task-1", {"status": "in_progress"}),)
    assert calls[1][0][0] == "task-1"
    assert calls[1][0][1]["status"] == "done"


@pytest.mark.asyncio
async def test_task_fails_when_driver_returns_failure(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    driver = _mock_driver(success=False, output="", error="Compilation error")
    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    calls = mock_data_client.update_task.call_args_list
    assert calls[1][0][1]["status"] == "failed"
    assert calls[1][0][1]["result"] == "Compilation error"


@pytest.mark.asyncio
async def test_creates_artifacts_from_driver(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler
    from agent_service.agents.coordinator.drivers.base import AgentArtifact

    artifacts = [AgentArtifact(type="log", title="Tool Log", content="called tool X")]
    driver = _mock_driver(artifacts=artifacts)

    mock_data_client.get_project_repositories = AsyncMock(return_value=[])
    mock_data_client.get_plan_tasks = AsyncMock(return_value=[make_task({"repository_ids": []})])

    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    mock_data_client.create_task_artifacts.assert_called_once()
    args = mock_data_client.create_task_artifacts.call_args[0]
    assert args[0] == "task-1"
    assert any(a["title"] == "Tool Log" for a in args[1])


@pytest.mark.asyncio
async def test_no_artifacts_call_when_empty(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    mock_data_client.get_project_repositories = AsyncMock(return_value=[])
    mock_data_client.get_plan_tasks = AsyncMock(return_value=[make_task({"repository_ids": []})])

    driver = _mock_driver(artifacts=[])
    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    mock_data_client.create_task_artifacts.assert_not_called()


@pytest.mark.asyncio
async def test_cascade_skip_on_failure(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    task_a = make_task({"id": "task-a"})
    task_b = make_task({"id": "task-b", "depends_on_task_ids": ["task-a"]})
    mock_data_client.get_plan_tasks = AsyncMock(return_value=[task_a, task_b])

    driver = _mock_driver(success=False, output="", error="Failed")
    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    mock_data_client.skip_dependent_tasks.assert_called_once_with("task-a")


@pytest.mark.asyncio
async def test_skipped_sse_events_for_cascade(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    task_a = make_task({"id": "task-a"})
    task_b = make_task({"id": "task-b", "depends_on_task_ids": ["task-a"]})
    mock_data_client.get_plan_tasks = AsyncMock(return_value=[task_a, task_b])

    driver = _mock_driver(success=False, output="", error="Failed")
    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    calls = [call.args[1] for call in mock_sse.broadcast.call_args_list]
    assert any(
        c.get("type") == "task_status" and c.get("task_id") == "task-b" and c.get("status") == "skipped"
        for c in calls
    )


@pytest.mark.asyncio
async def test_no_skip_when_no_dependents(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    driver = _mock_driver(success=False, output="", error="Failed")
    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    mock_data_client.skip_dependent_tasks.assert_not_called()


@pytest.mark.asyncio
async def test_both_independent_tasks_dispatched(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler
    from agent_service.config import config

    # Allow concurrent tasks
    original = config.MAX_CONCURRENT_TASKS
    config.MAX_CONCURRENT_TASKS = 2

    try:
        t1 = make_task({"id": "t1", "depends_on_task_ids": []})
        t2 = make_task({"id": "t2", "depends_on_task_ids": []})
        mock_data_client.get_plan_tasks = AsyncMock(return_value=[t1, t2])

        driver = _mock_driver()
        pool = _mock_pool(driver)
        scheduler = Scheduler(pool)

        await scheduler.run("project-1", "plan-1")

        assert driver.execute.call_count == 2
    finally:
        config.MAX_CONCURRENT_TASKS = original


@pytest.mark.asyncio
async def test_skips_already_terminal_tasks(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler
    from agent_service.config import config

    original = config.MAX_CONCURRENT_TASKS
    config.MAX_CONCURRENT_TASKS = 2

    try:
        done_task = make_task({"id": "t1", "status": "done"})
        pending_task = make_task({"id": "t2", "depends_on_task_ids": ["t1"]})
        mock_data_client.get_plan_tasks = AsyncMock(return_value=[done_task, pending_task])

        driver = _mock_driver()
        pool = _mock_pool(driver)
        scheduler = Scheduler(pool)

        await scheduler.run("project-1", "plan-1")

        # Only the pending task should be dispatched
        assert driver.execute.call_count == 1
    finally:
        config.MAX_CONCURRENT_TASKS = original


@pytest.mark.asyncio
async def test_falls_back_to_profile_driver(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    profile_driver = _mock_driver()
    pool = MagicMock()
    pool.get_driver_by_role = MagicMock(return_value=None)
    pool.get_driver = MagicMock(return_value=profile_driver)

    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    pool.get_driver_by_role.assert_called()
    pool.get_driver.assert_called_with("profile-1")
    profile_driver.execute.assert_called_once()


@pytest.mark.asyncio
async def test_no_driver_results_in_failed_task(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    pool = MagicMock()
    pool.get_driver_by_role = MagicMock(return_value=None)
    pool.get_driver = MagicMock(return_value=None)

    task = make_task({"agent_profile_id": None})
    mock_data_client.get_plan_tasks = AsyncMock(return_value=[task])

    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    update_calls = mock_data_client.update_task.call_args_list
    assert any(
        call[0][1].get("status") == "failed" and "No driver found" in (call[0][1].get("result") or "")
        for call in update_calls
    )


@pytest.mark.asyncio
async def test_empty_plan_completes_immediately(mock_data_client, mock_sse, mock_redis, mock_orchestration, mock_git):
    from agent_service.agents.coordinator.scheduler import Scheduler

    mock_data_client.get_project_repositories = AsyncMock(return_value=[])
    mock_data_client.get_plan_tasks = AsyncMock(return_value=[])

    driver = _mock_driver()
    pool = _mock_pool(driver)
    scheduler = Scheduler(pool)

    await scheduler.run("project-1", "plan-1")

    mock_data_client.complete_plan_execution.assert_called_once_with("plan-1")
    driver.execute.assert_not_called()
