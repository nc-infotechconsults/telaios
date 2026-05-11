"""tests/domain/orchestration/test_drivers.py — Tests for driver interface."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from telaios.core.types import (
    AgentInput,
    AgentOutput,
    Message,
    MessageRole,
    StreamEvent,
    StreamEventType,
)
from telaios.domain.orchestration.drivers import AgentDriver


class TestAgentDriverABC:
    """Tests for AgentDriver ABC."""

    def test_cannot_instantiate(self):
        with pytest.raises(TypeError, match="abstract"):
            AgentDriver()  # type: ignore[abstract]


def _make_mock_agent():
    """Create a mock Agent."""
    agent = AsyncMock()
    agent.run = AsyncMock(return_value=AgentOutput(content="result"))
    return agent


class TestOpenCodeDriver:
    """Tests for OpenCodeDriver."""

    @pytest.mark.asyncio
    async def test_execute(self):
        from telaios.core.providers.opencode.driver import OpenCodeDriver

        agent = _make_mock_agent()
        driver = OpenCodeDriver()
        input = AgentInput(messages=[Message(role=MessageRole.HUMAN, content="hello")])
        result = await driver.execute(agent, input)
        assert result.content == "result"
        agent.run.assert_called_once_with(input)

    @pytest.mark.asyncio
    async def test_stream(self):
        from telaios.core.providers.opencode.driver import OpenCodeDriver

        async def mock_astream(input):
            yield StreamEvent(type=StreamEventType.TEXT_CHUNK, data="hi")

        agent = _make_mock_agent()
        agent.astream = mock_astream
        driver = OpenCodeDriver()
        input = AgentInput(messages=[Message(role=MessageRole.HUMAN, content="hello")])
        events = []
        async for event in driver.stream(agent, input):
            events.append(event)
        assert len(events) == 1
        assert events[0].type == StreamEventType.TEXT_CHUNK


class TestGitHubCopilotDriver:
    """Tests for GitHubCopilotDriver."""

    @pytest.mark.asyncio
    async def test_execute(self):
        from telaios.core.providers.github_copilot.driver import GitHubCopilotDriver

        agent = _make_mock_agent()
        driver = GitHubCopilotDriver()
        input = AgentInput(messages=[Message(role=MessageRole.HUMAN, content="hello")])
        result = await driver.execute(agent, input)
        assert result.content == "result"

    @pytest.mark.asyncio
    async def test_stream(self):
        from telaios.core.providers.github_copilot.driver import GitHubCopilotDriver

        async def mock_astream(input):
            yield StreamEvent(type=StreamEventType.AGENT_START, data="start")
            yield StreamEvent(type=StreamEventType.TEXT_CHUNK, data="hello")
            yield StreamEvent(type=StreamEventType.AGENT_END, data="end")

        agent = _make_mock_agent()
        agent.astream = mock_astream
        driver = GitHubCopilotDriver()
        input = AgentInput(messages=[Message(role=MessageRole.HUMAN, content="hello")])
        events = []
        async for event in driver.stream(agent, input):
            events.append(event)
        assert len(events) == 3
