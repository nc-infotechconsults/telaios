"""RetrievalAgent — orchestrates the retrieval LangGraph for one query."""

from __future__ import annotations

from typing import Any

from telaios.core.agents.retrieval.graph import build_retrieval_graph
from telaios.core.agents.retrieval.state import MAX_ITERATIONS, RetrievalState
from telaios.core.agents.retrieval.tools import RetrievalTools
from telaios.core.knowledge.pipeline import Citation, KnowledgeQueryResult


class RetrievalAgent:
    def __init__(
        self,
        llm: Any,
        tools: RetrievalTools,
        config: Any,       # KnowledgePipelineConfig
        project_id: str,
        source: str,
        top_k: int,
    ) -> None:
        self._graph = build_retrieval_graph(llm=llm, tools=tools, config=config)
        self._project_id = project_id
        self._source = source
        self._top_k = top_k

    async def arun(self, query: str) -> KnowledgeQueryResult:
        initial: RetrievalState = {
            "query": query,
            "project_id": self._project_id,
            "source": self._source,
            "top_k": self._top_k,
            "search_plan": [],
            "pending_steps": [],
            "evidence": [],
            "evidence_scores": [],
            "iteration": 0,
            "max_iterations": MAX_ITERATIONS,
            "is_sufficient": False,
            "follow_up_queries": [],
            "answer": "",
            "citations": [],
        }
        final = await self._graph.ainvoke(initial)

        sources_searched = list({step.tool for step in final.get("search_plan", [])})
        return KnowledgeQueryResult(
            query=query,
            chunks=final.get("evidence", []),
            scores=final.get("evidence_scores", []),
            sources_searched=sources_searched,
            answer=final.get("answer", ""),
            citations=final.get("citations", []),
        )


__all__ = ["RetrievalAgent"]
