from __future__ import annotations

from typing import Any, List, Optional

from langgraph.prebuilt import create_react_agent
from langgraph.graph.state import CompiledStateGraph


def build_graph(
    llm: Any,
    tools: List[Any],
    system_prompt: Optional[str] = None,
) -> CompiledStateGraph:
    """Compile a ReAct LangGraph for a single coding task."""
    return create_react_agent(llm, tools, prompt=system_prompt)
