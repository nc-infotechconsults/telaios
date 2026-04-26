from __future__ import annotations

import json
from typing import Any, Dict, Optional

from langchain_core.messages import AIMessage as _AI, HumanMessage, SystemMessage, ToolMessage as _TM
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from .state import _CodingState
from .tools import CustomToolHandler, _dispatch_tool


def build_graph(
    bound_llm: Any,
    all_tools: list,
    custom_handlers: Optional[Dict[str, CustomToolHandler]] = None,
) -> CompiledStateGraph:
    """Compile a think→act LangGraph for a single coding task."""

    async def think(state: _CodingState) -> dict:
        lc_msgs = []
        for m in state["messages"]:
            role = m.get("role")
            content = m.get("content", "")
            if role == "system":
                lc_msgs.append(SystemMessage(content=content))
            elif role == "user":
                lc_msgs.append(HumanMessage(content=content))
            elif role == "assistant":
                try:
                    parsed = json.loads(content)
                    if isinstance(parsed, list) and parsed and "name" in parsed[0]:
                        lc_msgs.append(
                            _AI(
                                content="",
                                tool_calls=[
                                    {"name": tc["name"], "args": tc.get("args", {}), "id": tc["id"], "type": "tool_call"}
                                    for tc in parsed
                                ],
                            )
                        )
                        continue
                except Exception:
                    pass
                lc_msgs.append(_AI(content=content))
            elif role == "tool":
                lc_msgs.append(_TM(content=content, tool_call_id=m.get("tool_call_id", "")))

        response = await bound_llm.ainvoke(lc_msgs)
        ai_msg: _AI = response
        tool_calls = getattr(ai_msg, "tool_calls", []) or []

        if not tool_calls:
            text = ai_msg.content if isinstance(ai_msg.content, str) else json.dumps(ai_msg.content)
            return {"messages": [{"role": "assistant", "content": text}], "result": text, "done": True}

        return {"messages": [{"role": "assistant", "content": json.dumps(tool_calls)}]}

    async def act(state: _CodingState) -> dict:
        last_msg = state["messages"][-1]
        try:
            tool_calls = json.loads(last_msg["content"])
        except Exception:
            return {"done": True, "error": "Failed to parse tool calls from assistant message."}

        tool_messages: list[dict] = []
        for call in tool_calls:
            result = await _dispatch_tool(
                call["name"], call.get("args", {}), state["workspaces"], custom_handlers
            )
            text = result["text"]
            is_error = result["is_error"]

            if call["name"] == "finish" and not is_error:
                tool_messages.append({"role": "tool", "content": text, "tool_call_id": call["id"], "name": call["name"]})
                return {"messages": tool_messages, "result": text, "done": True}

            tool_messages.append({
                "role": "tool",
                "content": f"[ERROR] {text}" if is_error else text,
                "tool_call_id": call["id"],
                "name": call["name"],
            })

        return {"messages": tool_messages}

    workflow = StateGraph(_CodingState)
    workflow.add_node("think", think)
    workflow.add_node("act", act)
    workflow.set_entry_point("think")
    workflow.add_conditional_edges("think", lambda s: END if s.get("done") else "act")
    workflow.add_edge("act", "think")
    return workflow.compile()
