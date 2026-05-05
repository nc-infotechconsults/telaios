"""tests/domain/planning/test_prompts.py — Tests for prompt composition."""

from __future__ import annotations

from domain.planning.prompts import (
    compose_greeting,
    compose_parser_prompt,
    compose_planning_prompt,
)


class TestComposeGreeting:
    """Tests for compose_greeting."""

    def test_greeting_without_title(self):
        greeting = compose_greeting()
        assert "planning assistant" in greeting.lower()
        assert "what are you building" in greeting.lower()

    def test_greeting_with_title(self):
        greeting = compose_greeting("My Feature")
        assert "My Feature" in greeting
        assert "planning assistant" in greeting.lower()

    def test_greeting_with_none_title(self):
        greeting = compose_greeting(None)
        assert "what are you building" in greeting.lower()


class TestComposePlanningPrompt:
    """Tests for compose_planning_prompt."""

    def test_basic_interview_prompt(self):
        prompt = compose_planning_prompt("Build a REST API")
        assert "planning assistant" in prompt.lower()
        assert "ready_for_plan" in prompt
        assert "JSON" in prompt

    def test_prompt_with_context(self):
        context = {
            "project_name": "my-app",
            "repos": [{"id": "r1", "name": "backend"}],
        }
        prompt = compose_planning_prompt("Build auth", context=context)
        assert "my-app" in prompt or "backend" in prompt

    def test_review_phase_prompt(self):
        prompt = compose_planning_prompt(
            "Add more tests",
            phase="review",
            plan_draft={"tasks": [{"title": "Task 1"}]},
        )
        assert "revise" in prompt.lower() or "review" in prompt.lower()
        assert "Task 1" in prompt

    def test_prompt_with_system_override(self):
        prompt = compose_planning_prompt(
            "Build API",
            system_prompt_override="Custom instructions",
            system_prompt_mode="override",
        )
        assert "Custom instructions" in prompt

    def test_prompt_with_system_append(self):
        prompt = compose_planning_prompt(
            "Build API",
            system_prompt_override="Extra context",
            system_prompt_mode="append",
        )
        assert "Extra context" in prompt
        assert "planning assistant" in prompt.lower()

    def test_structured_output_instructions_present(self):
        prompt = compose_planning_prompt("Test")
        assert "ready_for_plan" in prompt
        assert "message" in prompt


class TestComposeParserPrompt:
    """Tests for compose_parser_prompt."""

    def test_basic_parser_prompt(self):
        prompt = compose_parser_prompt('{"tasks": []}')
        assert '{"tasks": []}' in prompt
        assert "Parse" in prompt or "parse" in prompt

    def test_parser_prompt_includes_schema(self):
        prompt = compose_parser_prompt("test plan")
        assert "id" in prompt
        assert "description" in prompt
        assert "depends_on" in prompt
