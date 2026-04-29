"""
Utilities to compile sub_agents entries into LangChain StructuredTool instances.

Each entry in sub_agents has the shape:
  { "agent_id": str, "tool_name": str, "tool_description": str }

The compiled StructuredTools are passed directly to create_react_agent.
"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel

from agent_service.agents.coordinator.drivers.base import AgentTask

if TYPE_CHECKING:
    from agent_service.agents.coordinator.pool import AgentPool

logger = logging.getLogger(__name__)


class _SubAgentInput(BaseModel):
    task_description: str


def build_sub_agent_tools(
    sub_agents: List[Dict[str, Any]],
    pool: "AgentPool",
) -> List[StructuredTool]:
    """
    Build StructuredTool instances for each sub_agent entry.

    Returns:
        List of StructuredTool objects ready to pass to create_react_agent.
    """
    tools: List[StructuredTool] = []
    seen_names: set[str] = set()

    for entry in sub_agents:
        agent_id: Optional[str] = entry.get("agent_id")
        tool_name: Optional[str] = entry.get("tool_name")
        tool_description: str = entry.get("tool_description") or f"Call the {tool_name} sub-agent"

        if not agent_id or not tool_name:
            logger.warning("sub_agent entry missing agent_id or tool_name: %r", entry)
            continue

        if tool_name in seen_names:
            logger.warning("Duplicate sub-agent tool_name %r — skipping", tool_name)
            continue
        seen_names.add(tool_name)

        driver = pool.get_driver(agent_id)
        if not driver:
            logger.warning("No driver found for sub-agent %s (tool=%s) — skipping", agent_id, tool_name)
            continue

        def _make_tool(
            _driver=driver, _name=tool_name, _desc=tool_description
        ) -> StructuredTool:
            async def _coroutine(task_description: str) -> str:
                sub_task = AgentTask(
                    id=f"sub-{uuid.uuid4().hex[:8]}",
                    title=_name,
                    description=task_description,
                    type="custom",
                    agent_profile_id=None,
                )
                try:
                    result = await _driver.execute(sub_task, {})
                    return result.output or result.error or "Sub-agent returned no output"
                except Exception as exc:
                    return f"Sub-agent error: {exc}"

            return StructuredTool.from_function(
                coroutine=_coroutine,
                name=_name,
                description=_desc,
                args_schema=_SubAgentInput,
            )

        tools.append(_make_tool())

    return tools
