from __future__ import annotations

from typing import Annotated, Any, Dict, List, Optional

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class PlannerState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    plan_id: str
    project_id: str
    plan_title: Optional[str]
    project_context: Optional[Dict[str, Any]]
    repos: List[Dict[str, Any]]
    planner_agent: Optional[Dict[str, Any]]
    phase: str  # "interview" | "review"
    plan_draft: Optional[Dict[str, Any]]


class PlannedTask:
    def __init__(self, data: Dict[str, Any]) -> None:
        self.title: str = data["title"]
        self.description: str = data.get("description", "")
        self.type: str = data.get("type", "general")
        self.execution_order: int = data.get("execution_order", 0)
        self.depends_on_task_indices: List[int] = data.get("depends_on_task_indices", [])
        self.repository_ids: List[str] = data.get("repository_ids", [])
