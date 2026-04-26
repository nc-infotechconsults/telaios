"""
Utilities to compile sub_agents entries into native LangGraph tool definitions
and custom dispatch handlers.

Each entry in sub_agents has the shape:
  { "agent_id": str, "tool_name": str, "tool_description": str }

The compiled tools appear as regular tool definitions to the LLM and are
dispatched through the custom_handlers mechanism in _dispatch_tool.
"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

from agent_service.agents.coordinator.drivers.base import AgentTask
from agent_service.agents.coordinator.drivers.langgraph.tools import CustomToolHandler

if TYPE_CHECKING:
    from agent_service.agents.coordinator.pool import AgentPool

logger = logging.getLogger(__name__)


def build_sub_agent_tools(
    sub_agents: List[Dict[str, Any]],
    pool: "AgentPool",
) -> Tuple[List[Dict[str, Any]], Dict[str, CustomToolHandler]]:
    """
    Build tool definitions and dispatch handlers for each sub_agent entry.

    Returns:
        tool_defs: list of tool schema dicts to pass to bind_tools()
        handlers: dict mapping tool_name -> async handler for _dispatch_tool()
    """
    tool_defs: List[Dict[str, Any]] = []
    handlers: Dict[str, CustomToolHandler] = {}

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

        tool_defs.append({
            "name": tool_name,
            "description": tool_description,
            "schema": {
                "type": "object",
                "properties": {
                    "task_description": {
                        "type": "string",
                        "description": "A clear description of what you want this sub-agent to do.",
                    },
                },
                "required": ["task_description"],
            },
        })

        # Bind loop variables explicitly to avoid closure bugs
        def _make_handler(
            _driver=driver, _tool_name=tool_name, _agent_id=agent_id
        ) -> CustomToolHandler:
            async def _handler(args: Dict[str, Any]) -> Dict[str, Any]:
                task_description = args.get("task_description", "")
                sub_task = AgentTask(
                    id=f"sub-{uuid.uuid4().hex[:8]}",
                    title=_tool_name,
                    description=task_description,
                    type="custom",
                    agent_profile_id=_agent_id,
                )
                try:
                    result = await _driver.execute(sub_task, {})
                    text = result.output or result.error or "Sub-agent returned no output"
                    return {"text": text, "is_error": bool(result.error and not result.output)}
                except Exception as exc:
                    return {"text": f"Sub-agent error: {exc}", "is_error": True}

            return _handler

        handlers[tool_name] = _make_handler()

    return tool_defs, handlers
