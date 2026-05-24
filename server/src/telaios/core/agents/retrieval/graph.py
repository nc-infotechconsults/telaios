"""build_retrieval_graph — assembles the RetrievalAgent LangGraph StateGraph."""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph

from telaios.core.agents.retrieval.nodes import (
    make_query_analyst_node,
    make_result_evaluator_node,
    make_retrieval_dispatcher_node,
    make_synthesizer_node,
)
from telaios.core.agents.retrieval.state import RetrievalState


def _route_dispatcher(state: RetrievalState) -> str:
    return "retrieval_dispatcher" if state["pending_steps"] else "result_evaluator"


def _route_evaluator(state: RetrievalState) -> str:
    return "synthesizer" if state["is_sufficient"] else "retrieval_dispatcher"


def build_retrieval_graph(llm: Any, tools: Any, config: Any) -> Any:
    """Compile and return the retrieval agent StateGraph."""
    query_analyst = make_query_analyst_node(llm)
    retrieval_dispatcher = make_retrieval_dispatcher_node(tools)
    result_evaluator = make_result_evaluator_node(llm)
    synthesizer = make_synthesizer_node(llm, config)

    graph = StateGraph(RetrievalState)
    graph.add_node("query_analyst", query_analyst)
    graph.add_node("retrieval_dispatcher", retrieval_dispatcher)
    graph.add_node("result_evaluator", result_evaluator)
    graph.add_node("synthesizer", synthesizer)

    graph.add_edge(START, "query_analyst")
    graph.add_edge("query_analyst", "retrieval_dispatcher")
    graph.add_conditional_edges(
        "retrieval_dispatcher",
        _route_dispatcher,
        {
            "retrieval_dispatcher": "retrieval_dispatcher",
            "result_evaluator": "result_evaluator",
        },
    )
    graph.add_conditional_edges(
        "result_evaluator",
        _route_evaluator,
        {
            "synthesizer": "synthesizer",
            "retrieval_dispatcher": "retrieval_dispatcher",
        },
    )
    graph.add_edge("synthesizer", END)

    return graph.compile()


__all__ = ["build_retrieval_graph"]
