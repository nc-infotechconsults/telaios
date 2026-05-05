"""tests/domain/planning/test_parser.py — Tests for plan parsing."""

from __future__ import annotations

import pytest

from domain.planning.parser import (
    ParsedPlan,
    PlanTask,
    parse_plan,
    parse_plan_from_json,
    parse_planner_response,
)


class TestParsePlannerResponse:
    """Tests for parse_planner_response."""

    def test_valid_json_response(self):
        text = '{"message": "Here is your plan", "ready_for_plan": true, "plan": {"tasks": []}}'
        result = parse_planner_response(text)
        assert result is not None
        assert result["message"] == "Here is your plan"
        assert result["ready_for_plan"] is True
        assert result["plan"] == {"tasks": []}

    def test_json_with_surrounding_text(self):
        text = 'Some text before {"message": "hello", "ready_for_plan": false, "plan": null} and after'
        result = parse_planner_response(text)
        assert result is not None
        assert result["message"] == "hello"

    def test_invalid_json_returns_none(self):
        result = parse_planner_response("no json here")
        assert result is None

    def test_missing_message_returns_none(self):
        result = parse_planner_response('{"ready_for_plan": true}')
        assert result is None

    def test_non_string_message_returns_none(self):
        result = parse_planner_response('{"message": 123}')
        assert result is None


class TestParsePlanFromJson:
    """Tests for parse_plan_from_json."""

    def test_basic_plan(self):
        plan_data = {
            "tasks": [
                {"id": "t1", "description": "First task", "depends_on": [], "agent": "default"},
                {"id": "t2", "description": "Second task", "depends_on": ["t1"], "agent": "reviewer"},
            ]
        }
        plan = parse_plan_from_json(plan_data)
        assert len(plan.tasks) == 2
        assert plan.tasks[0].id == "t1"
        assert plan.tasks[0].description == "First task"
        assert plan.tasks[0].depends_on == []
        assert plan.tasks[1].depends_on == ["t1"]

    def test_empty_plan(self):
        plan = parse_plan_from_json({"tasks": []})
        assert len(plan.tasks) == 0

    def test_missing_tasks_key(self):
        plan = parse_plan_from_json({})
        assert len(plan.tasks) == 0

    def test_task_with_title_fallback(self):
        plan_data = {"tasks": [{"title": "My Task"}]}
        plan = parse_plan_from_json(plan_data)
        assert len(plan.tasks) == 1
        assert plan.tasks[0].description == "My Task"


class TestPlanTask:
    """Tests for PlanTask model."""

    def test_basic_task(self):
        task = PlanTask(id="t1", description="Do something")
        assert task.id == "t1"
        assert task.depends_on == []
        assert task.agent == "default"

    def test_task_with_deps(self):
        task = PlanTask(id="t2", description="Depends on t1", depends_on=["t1"])
        assert task.depends_on == ["t1"]


class TestParsedPlan:
    """Tests for ParsedPlan model."""

    def test_plan_serialization(self):
        plan = ParsedPlan(tasks=[
            PlanTask(id="t1", description="Task 1"),
            PlanTask(id="t2", description="Task 2", depends_on=["t1"]),
        ])
        data = plan.model_dump()
        assert len(data["tasks"]) == 2
        restored = ParsedPlan(**data)
        assert restored.tasks[1].depends_on == ["t1"]


@pytest.mark.asyncio
async def test_parse_plan_direct_json():
    """Test parse_plan with direct JSON extraction."""
    text = '{"message": "Plan ready", "ready_for_plan": true, "plan": {"tasks": [{"id": "t1", "description": "Do thing"}]}}'
    plan = await parse_plan(text)
    assert len(plan.tasks) == 1
    assert plan.tasks[0].id == "t1"


@pytest.mark.asyncio
async def test_parse_plan_empty_returns_empty():
    """Test parse_plan with unparseable text returns empty plan."""
    plan = await parse_plan("not json at all")
    assert len(plan.tasks) == 0
