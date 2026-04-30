"""
Unit tests for the post-execution review+test pipeline in Scheduler (6C).

All tests use mock drivers — no LLM or network calls.

Covers:
- Pipeline is skipped when neither reviewer nor tester is registered
- Approved review → no retry, tester runs once
- Rejected review on first attempt → code retry → re-review → approved → tester runs
- Review retry limit reached → pipeline gives up (still returns coding result)
- Test failure → code retry → tests pass
- Parse helpers handle malformed JSON gracefully
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from agent_service.agents.coordinator.drivers.base import AgentArtifact, AgentResult, AgentTask
from agent_service.agents.coordinator.scheduler import (
    _parse_approved,
    _parse_failures,
    _parse_passed,
    _parse_required_changes,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_pool(reviewer=None, tester=None):
    pool = MagicMock()
    pool.get_driver_by_role.side_effect = lambda role: {
        "reviewer": reviewer,
        "tester": tester,
    }.get(role)
    return pool


def _coding_result(success=True, output="done"):
    return AgentResult(success=success, output=output, artifacts=[])


def _review_result(approved: bool, changes: list | None = None):
    data = {"approved": approved, "summary": "review", "required_changes": changes or []}
    return AgentResult(
        success=True,
        output=json.dumps(data),
        artifacts=[
            AgentArtifact(type="review", title="Review", content=json.dumps(data), content_type="application/json"),
        ],
    )


def _test_result(passed: bool, failures: list | None = None):
    data = {"passed": passed, "summary": "tests", "tests_run": 5, "failures": failures or []}
    return AgentResult(
        success=passed,
        output=json.dumps(data),
        artifacts=[
            AgentArtifact(type="test_result", title="Tests", content=json.dumps(data), content_type="application/json"),
        ],
    )


def _make_scheduler(reviewer=None, tester=None):
    pool = _make_pool(reviewer=reviewer, tester=tester)
    from agent_service.agents.coordinator.scheduler import Scheduler
    s = Scheduler.__new__(Scheduler)
    s._pool = pool
    s._library_agent_id_by_profile = {}
    s._emit = MagicMock()
    return s


_TASK = {
    "id": "task-1",
    "title": "Implement feature",
    "description": "Build the thing",
    "type": "code",
    "agent_profile_id": "profile-1",
    "repository_ids": [],
}

_AGENT_TASK = AgentTask(
    id="task-1",
    title="Implement feature",
    description="Build the thing",
    type="code",
    agent_profile_id="profile-1",
)

_WORKSPACES = {}


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestPipelineSkipped:
    @pytest.mark.asyncio
    async def test_no_reviewer_no_tester_returns_original_result(self):
        s = _make_scheduler()
        coding = _coding_result()
        result, extra = await s._run_post_exec_pipeline_v2(
            "proj", _TASK, _AGENT_TASK, coding, AsyncMock(), _WORKSPACES
        )
        assert result is coding
        assert extra == []


class TestApprovedReviewThenTest:
    @pytest.mark.asyncio
    async def test_review_approved_and_tests_pass(self):
        reviewer_driver = AsyncMock()
        reviewer_driver.execute = AsyncMock(return_value=_review_result(approved=True))

        tester_driver = AsyncMock()
        tester_driver.execute = AsyncMock(return_value=_test_result(passed=True))

        s = _make_scheduler(reviewer=reviewer_driver, tester=tester_driver)
        coding = _coding_result()
        coding_driver = AsyncMock()

        result, extra = await s._run_post_exec_pipeline_v2(
            "proj", _TASK, _AGENT_TASK, coding, coding_driver, _WORKSPACES
        )

        # Coding driver NOT retried
        coding_driver.execute.assert_not_called()
        # Review ran once, test ran once
        reviewer_driver.execute.assert_called_once()
        tester_driver.execute.assert_called_once()
        # Extra artifacts: 1 review + 1 test
        assert len(extra) == 2
        assert result.success is True


class TestRejectedReviewRetry:
    @pytest.mark.asyncio
    async def test_rejected_then_approved_on_retry(self):
        reviewer_driver = AsyncMock()
        reviewer_driver.execute = AsyncMock(
            side_effect=[
                _review_result(approved=False, changes=["Add error handling"]),
                _review_result(approved=True),
            ]
        )

        tester_driver = AsyncMock()
        tester_driver.execute = AsyncMock(return_value=_test_result(passed=True))

        s = _make_scheduler(reviewer=reviewer_driver, tester=tester_driver)
        coding = _coding_result()
        coding_driver = AsyncMock()
        coding_driver.execute = AsyncMock(return_value=_coding_result())

        result, extra = await s._run_post_exec_pipeline_v2(
            "proj", _TASK, _AGENT_TASK, coding, coding_driver, _WORKSPACES
        )

        # Coding driver retried once after rejected review
        coding_driver.execute.assert_called_once()
        # Review ran twice
        assert reviewer_driver.execute.call_count == 2
        # Test ran once after final approval
        tester_driver.execute.assert_called_once()


class TestReviewRetryLimitReached:
    @pytest.mark.asyncio
    async def test_always_rejected_gives_up_after_max_retries(self):
        from agent_service.agents.coordinator.scheduler import _MAX_PIPELINE_RETRIES

        reviewer_driver = AsyncMock()
        reviewer_driver.execute = AsyncMock(
            return_value=_review_result(approved=False, changes=["Still broken"])
        )

        tester_driver = AsyncMock()

        s = _make_scheduler(reviewer=reviewer_driver, tester=tester_driver)
        coding = _coding_result()
        coding_driver = AsyncMock()
        coding_driver.execute = AsyncMock(return_value=_coding_result())

        result, extra = await s._run_post_exec_pipeline_v2(
            "proj", _TASK, _AGENT_TASK, coding, coding_driver, _WORKSPACES
        )

        # Review ran MAX_PIPELINE_RETRIES + 1 times (initial + retries)
        assert reviewer_driver.execute.call_count == _MAX_PIPELINE_RETRIES + 1
        # Tester never ran because review never approved
        tester_driver.execute.assert_not_called()
        # Pipeline still returns a result (not None)
        assert result is not None


class TestTestFailureRetry:
    @pytest.mark.asyncio
    async def test_tests_fail_then_pass_on_retry(self):
        reviewer_driver = AsyncMock()
        reviewer_driver.execute = AsyncMock(return_value=_review_result(approved=True))

        tester_driver = AsyncMock()
        tester_driver.execute = AsyncMock(
            side_effect=[
                _test_result(passed=False, failures=["test_foo FAILED"]),
                _test_result(passed=True),
            ]
        )

        s = _make_scheduler(reviewer=reviewer_driver, tester=tester_driver)
        coding = _coding_result()
        coding_driver = AsyncMock()
        coding_driver.execute = AsyncMock(return_value=_coding_result())

        result, extra = await s._run_post_exec_pipeline_v2(
            "proj", _TASK, _AGENT_TASK, coding, coding_driver, _WORKSPACES
        )

        # Review ran once (approved)
        reviewer_driver.execute.assert_called_once()
        # Coding retried once after test failure
        coding_driver.execute.assert_called_once()
        # Tests ran twice
        assert tester_driver.execute.call_count == 2


# ── Parse helper tests ────────────────────────────────────────────────────────

class TestParseHelpers:
    def test_parse_approved_true(self):
        assert _parse_approved('{"approved": true}') is True

    def test_parse_approved_false(self):
        assert _parse_approved('{"approved": false}') is False

    def test_parse_approved_invalid_json(self):
        assert _parse_approved("not json") is False

    def test_parse_required_changes(self):
        data = json.dumps({"required_changes": ["fix a", "fix b"]})
        assert _parse_required_changes(data) == ["fix a", "fix b"]

    def test_parse_required_changes_missing_key(self):
        assert _parse_required_changes('{"approved": true}') == []

    def test_parse_passed_true(self):
        assert _parse_passed('{"passed": true}') is True

    def test_parse_passed_false(self):
        assert _parse_passed('{"passed": false}') is False

    def test_parse_failures(self):
        data = json.dumps({"failures": ["test_a FAILED"]})
        assert _parse_failures(data) == ["test_a FAILED"]

    def test_parse_failures_empty(self):
        assert _parse_failures('{"passed": true, "failures": []}') == []
