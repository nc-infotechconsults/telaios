"""
core/agents/planner/agent.py — LangGraph StateGraph for the planner agent.

Graph topology (split-node design):

    START
      │
      ▼
    planner_node          ← Two sequential LLM calls:
      │                     1. llm_with_tools  (bind_tools; may emit tool_calls)
      │                     2. llm_structured  (with_structured_output; only if no tool_calls)
      ▼
    route_after_planner() ← tool_calls → tool_node
                            questions/tasks → hitl_node
                            else → END
      │            │
      ▼            ▼
    tool_node    hitl_node          ← interrupt(pause_payload)
      │            │                  On resume: routes based on resume value
      │            ▼
      │          route_after_hitl() ← confirm → END
      │                               refuse/answer → planner_node
      │
      └──────────────► planner_node (loop for more tool calls or re-planning)

The split-node design avoids double LLM calls on resume: LangGraph re-executes
the interrupted node (hitl_node) from scratch, and ``interrupt()`` returns the
resume value immediately so planner_node is NOT re-run.

Sources:
  - LangGraph interrupt / HITL:
    https://langchain-ai.github.io/langgraph/how-tos/human_in_the_loop/
  - LangGraph Command:
    https://langchain-ai.github.io/langgraph/concepts/low_level/#command
  - ToolNode:
    https://langchain-ai.github.io/langgraph/how-tos/tool-calling/
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Any, Literal

from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.types import Command, interrupt
from typing_extensions import TypedDict

from telaios.core.agents.planner.schemas import (
    PlanningSessionStatus,
    PlanResponseFormat,
)

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langgraph.checkpoint.base import BaseCheckpointSaver


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


class PlannerState(TypedDict):
    """Graph state for the planner agent.

    ``thread_id`` and ``user_id`` live in the LangGraph config
    (``configurable``), not in state — they are routing keys, not data.
    """

    messages: Annotated[list[AnyMessage], add_messages]
    status: PlanningSessionStatus
    plan: PlanResponseFormat | None


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are a precise planning agent. Your job is to help the user design a
clear, detailed, and actionable plan for their software project.

Guidelines:
- Ask clarifying questions (use the `questions` field) if the request is
  ambiguous or you need more information to produce a high-quality plan.
- Search available documents and repositories using the provided tools to
  ground your plan in real project artifacts before producing tasks.
- When you have enough information, produce a structured list of tasks
  (use the `tasks` field) with clear names, short descriptions, and details.
- Use the `response` field for any natural language explanation or context
  you want to share with the user alongside questions or tasks.
- Be concise and precise. Avoid filler text.
"""


# ---------------------------------------------------------------------------
# Helper: format plan response as readable text for the conversation history
# ---------------------------------------------------------------------------


def _plan_to_text(result: PlanResponseFormat) -> str:
    parts: list[str] = []
    if result.response:
        parts.append(result.response)
    if result.tasks:
        parts.append(f"\nPlan ready ({len(result.tasks)} task(s)):")
        for task in result.tasks:
            parts.append(f"  [{task.category}] {task.name}: {task.short_description}")
    if result.questions:
        parts.append("\nClarifying questions:")
        for q in result.questions:
            parts.append(f"  - {q.question}")
    return "\n".join(parts) if parts else "(no output)"


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------


def build_planner_graph(
    llm: BaseChatModel,
    tools: list[Any],
    checkpointer: BaseCheckpointSaver[Any],
) -> Any:
    """Build and compile the planner StateGraph.

    Args:
        llm: A LangChain chat model.  The graph binds tools and structured
            output to it internally.
        tools: Tool list from ``make_tools()``.
        checkpointer: Any ``BaseCheckpointSaver`` (``MemorySaver`` for tests,
            ``AsyncPostgresSaver`` in production).

    Returns:
        A compiled LangGraph ``CompiledGraph``.
    """
    llm_with_tools = llm.bind_tools(tools)
    llm_structured = llm.with_structured_output(PlanResponseFormat)

    # ── Nodes ──────────────────────────────────────────────────────────────

    async def planner_node(state: PlannerState, config: RunnableConfig) -> dict[str, Any]:
        """Invoke the LLM. Two-step: tools first, then structured output."""
        response = await llm_with_tools.ainvoke(state["messages"], config)

        if getattr(response, "tool_calls", None):
            # Route to tool_node; let it append ToolMessages then loop back.
            return {"messages": [response]}

        # No tool calls — get the final structured plan/questions.
        plan: PlanResponseFormat = await llm_structured.ainvoke(state["messages"], config)  # type: ignore[assignment]

        new_status = state.get("status", PlanningSessionStatus.PENDING)
        if plan.questions:
            new_status = PlanningSessionStatus.INTERVIEWING
        elif plan.tasks:
            new_status = PlanningSessionStatus.AWAITING_CONFIRMATION

        ai_msg = AIMessage(content=_plan_to_text(plan))
        return {
            "messages": [ai_msg],
            "plan": plan,
            "status": new_status,
        }

    def hitl_node(
        state: PlannerState,
    ) -> Command[Literal["planner_node", "__end__"]]:
        """Pause graph execution and wait for human input.

        The ``interrupt()`` call suspends the graph; on resume the
        ``Command(resume=...)`` value is returned here and we route
        accordingly — without re-running ``planner_node``.
        """
        plan = state.get("plan")
        pause_payload: dict[str, Any] = {}
        if plan is not None:
            if plan.questions:
                pause_payload = {
                    "type": "questions",
                    "questions": [q.model_dump() for q in plan.questions],
                }
            elif plan.tasks:
                pause_payload = {
                    "type": "plan_ready",
                    "tasks": [t.model_dump() for t in plan.tasks],
                    "response": plan.response,
                }

        resume_value = interrupt(pause_payload)

        # --- Route based on what the human sent ----------------------------
        if resume_value == "confirm":
            return Command(
                update={"status": PlanningSessionStatus.ACCEPTED},
                goto="__end__",
            )

        if isinstance(resume_value, dict) and resume_value.get("type") == "refuse":
            reason = resume_value.get("reason", "Please revise the plan.")
            return Command(
                update={
                    "messages": [
                        HumanMessage(
                            content=f"I have reviewed the plan and I want changes. Reason: {reason}"
                        )
                    ],
                    "status": PlanningSessionStatus.REFUSED,
                },
                goto="planner_node",
            )

        # Default: user answered questions — continue planning.
        return Command(
            update={
                "messages": [HumanMessage(content=str(resume_value))],
                "status": PlanningSessionStatus.INTERVIEWING,
            },
            goto="planner_node",
        )

    # ── Routing functions ──────────────────────────────────────────────────

    def route_after_planner(
        state: PlannerState,
    ) -> Literal["tool_node", "hitl_node", "__end__"]:
        """Decide where to go after planner_node completes."""
        last_msg = state["messages"][-1]
        if getattr(last_msg, "tool_calls", None):
            return "tool_node"

        plan = state.get("plan")
        if plan is not None and (plan.questions or plan.tasks):
            return "hitl_node"

        # Planner gave a response with neither tasks nor questions.
        # End the turn; the user can send another message.
        return "__end__"

    # ── Graph assembly ─────────────────────────────────────────────────────

    tool_node = ToolNode(tools)

    graph = StateGraph(PlannerState)
    graph.add_node("planner_node", planner_node)
    graph.add_node("hitl_node", hitl_node)
    graph.add_node("tool_node", tool_node)

    graph.add_edge(START, "planner_node")
    graph.add_conditional_edges(
        "planner_node",
        route_after_planner,
        {"tool_node": "tool_node", "hitl_node": "hitl_node", END: END},
    )
    graph.add_edge("tool_node", "planner_node")
    # hitl_node returns Command with goto; no explicit edge needed.

    return graph.compile(checkpointer=checkpointer, interrupt_before=[])


__all__ = [
    "SYSTEM_PROMPT",
    "PlannerState",
    "build_planner_graph",
]
