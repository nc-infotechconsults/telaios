"""
Unit tests for the infra agent create_react_agent migration (T3).

Covers:
- detect_stack identifies common stacks from indicator files
- detect_stack returns "unknown" for empty workspace
- _build_workspace_tools write_file / read_file are workspace-scoped
- InfraAgent.on_execute collects Written files from ToolMessage results
"""
from __future__ import annotations

import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, ToolMessage

from agent_service.agents.infra.template_gen import detect_stack
from agent_service.agents.infra.infra_agent import _build_workspace_tools


class TestDetectStack:
    @pytest.mark.asyncio
    async def test_detects_python_from_requirements(self):
        with tempfile.TemporaryDirectory() as tmp:
            open(os.path.join(tmp, "requirements.txt"), "w").close()
            assert await detect_stack(tmp) == "python"

    @pytest.mark.asyncio
    async def test_detects_python_from_pyproject(self):
        with tempfile.TemporaryDirectory() as tmp:
            open(os.path.join(tmp, "pyproject.toml"), "w").close()
            assert await detect_stack(tmp) == "python"

    @pytest.mark.asyncio
    async def test_detects_node_from_package_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            open(os.path.join(tmp, "package.json"), "w").close()
            assert await detect_stack(tmp) == "node"

    @pytest.mark.asyncio
    async def test_detects_go(self):
        with tempfile.TemporaryDirectory() as tmp:
            open(os.path.join(tmp, "go.mod"), "w").close()
            assert await detect_stack(tmp) == "go"

    @pytest.mark.asyncio
    async def test_unknown_for_empty_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            assert await detect_stack(tmp) == "unknown"


class TestBuildWorkspaceTools:
    @pytest.mark.asyncio
    async def test_write_and_read_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = _build_workspace_tools(tmp)
            write = next(t for t in tools if t.name == "write_file")
            read = next(t for t in tools if t.name == "read_file")

            result = await write.coroutine(path="Dockerfile", content="FROM python:3.12")
            assert result == "Written: Dockerfile"
            content = await read.coroutine(path="Dockerfile")
            assert "FROM python:3.12" in content

    @pytest.mark.asyncio
    async def test_write_blocks_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = _build_workspace_tools(tmp)
            write = next(t for t in tools if t.name == "write_file")
            result = await write.coroutine(path="../../etc/crontab", content="bad")
            assert "Error" in result


class TestInfraAgentExecute:
    """InfraAgent.on_execute should collect Written: paths from ToolMessages."""

    @pytest.mark.asyncio
    async def test_on_execute_collects_written_files(self):
        from agent_service.agents.infra.infra_agent import InfraAgent, InfraAgentConfig
        from agent_service.core.agent_framework.context import AgentContext

        with tempfile.TemporaryDirectory() as tmp:
            agent = InfraAgent("infra-1", InfraAgentConfig())
            agent._llm = MagicMock()  # won't be called; we mock create_react_agent

            fake_messages = [
                AIMessage(content="I will generate the files."),
                ToolMessage(content="Written: Dockerfile", name="write_file", tool_call_id="1"),
                ToolMessage(content="Written: docker-compose.yml", name="write_file", tool_call_id="2"),
                AIMessage(content="Done."),
            ]
            fake_graph = MagicMock()
            fake_graph.ainvoke = AsyncMock(return_value={"messages": fake_messages})

            ctx = MagicMock(spec=AgentContext)
            ctx.executionId = "exec-1"
            ctx.workspaces = {"myrepo": tmp}
            ctx.task = MagicMock()
            ctx.task.description = "Deploy a web app"

            with patch("agent_service.agents.infra.infra_agent.create_react_agent", return_value=fake_graph):
                with patch("agent_service.agents.infra.infra_agent.get_agent_event_bus") as mock_bus:
                    mock_bus.return_value.publish = AsyncMock()
                    await agent.on_execute(ctx)

            import json
            output = json.loads(agent._result.output)
            assert output["filesGenerated"] == 2
            assert "myrepo/Dockerfile" in output["files"]
            assert "myrepo/docker-compose.yml" in output["files"]
            assert agent._result.success is True
