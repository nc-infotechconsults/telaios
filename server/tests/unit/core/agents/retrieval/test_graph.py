"""Tests for build_retrieval_graph and RetrievalAgent."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock

from telaios.core.agents.retrieval.state import MAX_ITERATIONS, SearchPlan, SearchStep, EvaluationResult
from telaios.core.types import Chunk


def _chunk(i: int) -> Chunk:
    return Chunk(id=str(i), document_id="doc", content=f"chunk content {i}", metadata={})


def _make_llm(plan=None, evaluation=None, answer="The answer is X [1]."):
    """Mock LangChain chat model that returns deterministic structured outputs."""
    from langchain_core.messages import AIMessage

    if plan is None:
        plan = SearchPlan(steps=[
            SearchStep(sub_query="auth middleware", tool="vector_search", reason="impl")
        ])
    if evaluation is None:
        evaluation = EvaluationResult(
            is_sufficient=True, missing_aspects=[], follow_up_queries=[], confidence=0.9
        )

    mock = MagicMock()

    def with_structured_output(schema):
        inner = MagicMock()
        if schema.__name__ == "SearchPlan":
            inner.ainvoke = AsyncMock(return_value=plan)
        elif schema.__name__ == "EvaluationResult":
            inner.ainvoke = AsyncMock(return_value=evaluation)
        else:
            inner.ainvoke = AsyncMock(return_value=schema())
        return inner

    mock.with_structured_output = with_structured_output
    mock.ainvoke = AsyncMock(return_value=AIMessage(content=answer))
    return mock


def _make_tools(chunks=None):
    tools = MagicMock()
    tools.execute = AsyncMock(return_value=(chunks or [_chunk(1)], [0.8]))
    return tools


class TestBuildRetrievalGraph:
    def test_graph_compiles(self):
        from telaios.core.agents.retrieval.graph import build_retrieval_graph
        from telaios.core.knowledge.config import KnowledgePipelineConfig

        graph = build_retrieval_graph(
            llm=_make_llm(),
            tools=_make_tools(),
            config=KnowledgePipelineConfig(),
        )
        assert graph is not None

    @pytest.mark.asyncio
    async def test_graph_runs_to_completion(self):
        from telaios.core.agents.retrieval.graph import build_retrieval_graph
        from telaios.core.agents.retrieval.state import RetrievalState
        from telaios.core.knowledge.config import KnowledgePipelineConfig

        graph = build_retrieval_graph(
            llm=_make_llm(),
            tools=_make_tools(),
            config=KnowledgePipelineConfig(),
        )
        initial: RetrievalState = {
            "query": "how does auth work?",
            "project_id": "proj-1",
            "source": "all",
            "top_k": 5,
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
        final = await graph.ainvoke(initial)
        assert final["answer"] != "" or final["evidence"] != []

    @pytest.mark.asyncio
    async def test_graph_iterates_when_not_sufficient(self):
        """Evaluator says not sufficient once, then sufficient. Dispatcher must run twice."""
        from telaios.core.agents.retrieval.graph import build_retrieval_graph
        from telaios.core.agents.retrieval.state import RetrievalState
        from telaios.core.knowledge.config import KnowledgePipelineConfig

        plan = SearchPlan(steps=[
            SearchStep(sub_query="q1", tool="vector_search", reason="r")
        ])

        not_sufficient = EvaluationResult(
            is_sufficient=False,
            missing_aspects=["missing X"],
            follow_up_queries=["how does X work"],
            confidence=0.3,
        )
        sufficient = EvaluationResult(
            is_sufficient=True, missing_aspects=[], follow_up_queries=[], confidence=0.9
        )

        call_count = 0

        from langchain_core.messages import AIMessage
        mock_llm = MagicMock()

        def with_structured_output(schema):
            inner = MagicMock()
            if schema.__name__ == "SearchPlan":
                inner.ainvoke = AsyncMock(return_value=plan)
            elif schema.__name__ == "EvaluationResult":
                nonlocal call_count
                async def eval_ainvoke(msgs):
                    nonlocal call_count
                    call_count += 1
                    return not_sufficient if call_count == 1 else sufficient
                inner.ainvoke = eval_ainvoke
            return inner

        mock_llm.with_structured_output = with_structured_output
        mock_llm.ainvoke = AsyncMock(return_value=AIMessage(content="Final answer [1]."))

        graph = build_retrieval_graph(
            llm=mock_llm,
            tools=_make_tools(),
            config=KnowledgePipelineConfig(),
        )
        initial: RetrievalState = {
            "query": "q", "project_id": "p", "source": "all", "top_k": 5,
            "search_plan": [], "pending_steps": [], "evidence": [],
            "evidence_scores": [], "iteration": 0, "max_iterations": MAX_ITERATIONS,
            "is_sufficient": False, "follow_up_queries": [], "answer": "", "citations": [],
        }
        final = await graph.ainvoke(initial)
        assert call_count == 2  # evaluator ran twice
        assert final["iteration"] == 2


class TestRetrievalAgent:
    @pytest.mark.asyncio
    async def test_arun_returns_knowledge_query_result(self):
        from telaios.core.agents.retrieval.agent import RetrievalAgent
        from telaios.core.knowledge.config import KnowledgePipelineConfig
        from telaios.core.knowledge.pipeline import KnowledgeQueryResult

        config = KnowledgePipelineConfig()

        agent = RetrievalAgent(
            llm=_make_llm(),
            tools=_make_tools(),
            config=config,
            project_id="proj-1",
            source="all",
            top_k=5,
        )
        result = await agent.arun("how does auth work?")

        assert isinstance(result, KnowledgeQueryResult)
        assert result.query == "how does auth work?"
        assert isinstance(result.chunks, list)
        assert isinstance(result.answer, str)
