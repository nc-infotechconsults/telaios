"""
Unit tests for the planning react node migration (T2).

Covers:
- route_after_planner routes to save_draft_node on ready_for_plan JSON
- route_after_planner routes to interview_wait_node for plain text
- route_after_planner routes to interview_wait_node for malformed JSON
- react_planner_node slices only new messages from the sub-agent result
"""
from __future__ import annotations

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

# crypto.py raises at import time if ENCRYPTION_KEY is absent.
os.environ.setdefault("ENCRYPTION_KEY", "test_key_" + "a" * 32)

from agent_service.services.planning_service.nodes import route_after_planner


def _state_with_last(content: str) -> dict:
    """Build a minimal PlannerState-like dict with an AIMessage as last message."""
    return {"messages": [AIMessage(content=content)]}


_READY_JSON = json.dumps(
    {
        "message": "I have enough information to create the plan.",
        "ready_for_plan": True,
        "plan": {
            "title": "MVP",
            "phases": [{"name": "Setup", "tasks": [{"title": "init", "description": "init project"}]}],
        },
    }
)

_NOT_READY_JSON = json.dumps({"message": "What stack do you use?", "ready_for_plan": False})


class TestRouteAfterPlanner:
    def test_routes_to_save_draft_when_ready(self):
        state = _state_with_last(_READY_JSON)
        assert route_after_planner(state) == "save_draft_node"

    def test_routes_to_interview_wait_when_not_ready(self):
        state = _state_with_last(_NOT_READY_JSON)
        assert route_after_planner(state) == "interview_wait_node"

    def test_routes_to_interview_wait_for_plain_text(self):
        state = _state_with_last("Tell me more about your project.")
        assert route_after_planner(state) == "interview_wait_node"

    def test_routes_to_interview_wait_for_empty_content(self):
        state = _state_with_last("")
        assert route_after_planner(state) == "interview_wait_node"

    def test_routes_to_interview_wait_for_ready_without_plan(self):
        # ready_for_plan=True but no plan field → should NOT go to save_draft
        bad = json.dumps({"message": "almost", "ready_for_plan": True})
        state = _state_with_last(bad)
        assert route_after_planner(state) == "interview_wait_node"


class TestReactPlannerNodeMessageSlicing:
    """Verify that react_planner_node only returns messages added by the sub-agent."""

    @pytest.mark.asyncio
    async def test_new_messages_are_returned(self):
        original_msg = HumanMessage(content="describe your project")
        new_ai_msg = AIMessage(content=_READY_JSON)

        fake_graph = MagicMock()
        fake_graph.ainvoke = AsyncMock(
            return_value={"messages": [original_msg, new_ai_msg]}
        )

        patches = [
            patch("agent_service.services.planning_service.nodes.create_react_agent", return_value=fake_graph),
            patch("agent_service.services.planning_service.nodes.data_client.get_settings", new=AsyncMock(return_value={})),
            patch("agent_service.services.planning_service.nodes._build_repo_tools", return_value=[]),
            patch("agent_service.services.planning_service.nodes._build_llm", return_value=MagicMock()),
            patch("agent_service.services.planning_service.nodes._build_interview_system", return_value="system"),
            patch("agent_service.services.planning_service.nodes._broadcast_new_messages", new=AsyncMock()),
        ]

        state = {
            "messages": [original_msg],
            "project": {"name": "Test"},
            "plan_id": "p1",
            "project_id": "proj-1",
            "session_id": "s1",
            "user_id": "u1",
            "context": {},
            "planner_agent": None,
            "repos": [],
        }

        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            from agent_service.services.planning_service.nodes import react_planner_node
            result = await react_planner_node(state)

        # Only the new message should be returned
        assert "messages" in result
        assert new_ai_msg in result["messages"]
        assert original_msg not in result["messages"]
