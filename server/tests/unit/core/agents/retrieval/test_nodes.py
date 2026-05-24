"""Unit tests for retrieval agent node functions."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock

from telaios.core.agents.retrieval.state import (
    SearchStep, SearchPlan, EvaluationResult, RetrievalState, MAX_ITERATIONS
)
from telaios.core.types import Chunk


def _base_state(**overrides) -> RetrievalState:
    state: RetrievalState = {
        "query": "how does the auth flow work?",
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
    state.update(overrides)
    return state


def _chunk(i: int) -> Chunk:
    return Chunk(id=str(i), document_id="doc", content=f"evidence chunk {i}", metadata={})


class TestQueryAnalystNode:
    @pytest.mark.asyncio
    async def test_produces_search_plan(self):
        from telaios.core.agents.retrieval.nodes import make_query_analyst_node

        plan = SearchPlan(steps=[
            SearchStep(sub_query="auth middleware", tool="vector_search", reason="impl details"),
        ])
        mock_llm = MagicMock()
        mock_llm.with_structured_output = MagicMock(return_value=AsyncMock(ainvoke=AsyncMock(return_value=plan)))

        node = make_query_analyst_node(mock_llm)
        state = _base_state()
        result = await node(state)

        assert "search_plan" in result
        assert "pending_steps" in result
        assert len(result["search_plan"]) >= 1

    @pytest.mark.asyncio
    async def test_fallback_on_llm_failure(self):
        from telaios.core.agents.retrieval.nodes import make_query_analyst_node

        mock_llm = MagicMock()
        structured = MagicMock()
        structured.ainvoke = AsyncMock(side_effect=Exception("LLM down"))
        mock_llm.with_structured_output = MagicMock(return_value=structured)

        node = make_query_analyst_node(mock_llm)
        state = _base_state()
        result = await node(state)

        assert "search_plan" in result
        assert len(result["search_plan"]) >= 1
        assert result["search_plan"][0].tool == "vector_search"


class TestRetrievalDispatcherNode:
    @pytest.mark.asyncio
    async def test_pops_first_step_and_appends_evidence(self):
        from telaios.core.agents.retrieval.nodes import make_retrieval_dispatcher_node

        step = SearchStep(sub_query="auth", tool="vector_search", reason="r")
        mock_tools = MagicMock()
        mock_tools.execute = AsyncMock(return_value=([_chunk(1)], [0.8]))

        node = make_retrieval_dispatcher_node(mock_tools)
        state = _base_state(pending_steps=[step])
        result = await node(state)

        assert len(result["evidence"]) == 1
        assert len(result["evidence_scores"]) == 1
        assert result["pending_steps"] == []

    @pytest.mark.asyncio
    async def test_leaves_remaining_steps(self):
        from telaios.core.agents.retrieval.nodes import make_retrieval_dispatcher_node

        steps = [
            SearchStep(sub_query="q1", tool="vector_search", reason="r"),
            SearchStep(sub_query="q2", tool="bm25", reason="r"),
        ]
        mock_tools = MagicMock()
        mock_tools.execute = AsyncMock(return_value=([_chunk(1)], [0.5]))

        node = make_retrieval_dispatcher_node(mock_tools)
        state = _base_state(pending_steps=steps)
        result = await node(state)

        assert len(result["pending_steps"]) == 1
        assert result["pending_steps"][0].sub_query == "q2"

    @pytest.mark.asyncio
    async def test_tool_failure_skips_step_gracefully(self):
        from telaios.core.agents.retrieval.nodes import make_retrieval_dispatcher_node

        step = SearchStep(sub_query="q", tool="vector_search", reason="r")
        mock_tools = MagicMock()
        mock_tools.execute = AsyncMock(side_effect=Exception("timeout"))

        node = make_retrieval_dispatcher_node(mock_tools)
        state = _base_state(pending_steps=[step])
        result = await node(state)

        assert result["pending_steps"] == []
        assert result["evidence"] == []
        assert result["evidence_scores"] == []


class TestResultEvaluatorNode:
    @pytest.mark.asyncio
    async def test_marks_sufficient_and_routes_to_synthesizer(self):
        from telaios.core.agents.retrieval.nodes import make_result_evaluator_node

        evaluation = EvaluationResult(
            is_sufficient=True, missing_aspects=[], follow_up_queries=[], confidence=0.95
        )
        mock_llm = MagicMock()
        structured = MagicMock()
        structured.ainvoke = AsyncMock(return_value=evaluation)
        mock_llm.with_structured_output = MagicMock(return_value=structured)

        node = make_result_evaluator_node(mock_llm)
        state = _base_state(evidence=[_chunk(1)], iteration=0)
        result = await node(state)

        assert result["is_sufficient"] is True
        assert result["pending_steps"] == []

    @pytest.mark.asyncio
    async def test_insufficient_produces_new_pending_steps(self):
        from telaios.core.agents.retrieval.nodes import make_result_evaluator_node

        evaluation = EvaluationResult(
            is_sufficient=False,
            missing_aspects=["error handling details"],
            follow_up_queries=["how does error handling work"],
            confidence=0.4,
        )
        mock_llm = MagicMock()
        structured = MagicMock()
        structured.ainvoke = AsyncMock(return_value=evaluation)
        mock_llm.with_structured_output = MagicMock(return_value=structured)

        node = make_result_evaluator_node(mock_llm)
        state = _base_state(evidence=[_chunk(1)], iteration=0)
        result = await node(state)

        assert result["is_sufficient"] is False
        assert len(result["pending_steps"]) >= 1
        assert result["iteration"] == 1

    @pytest.mark.asyncio
    async def test_max_iterations_forces_sufficient(self):
        from telaios.core.agents.retrieval.nodes import make_result_evaluator_node

        evaluation = EvaluationResult(
            is_sufficient=False,
            missing_aspects=["still missing"],
            follow_up_queries=["more queries"],
            confidence=0.2,
        )
        mock_llm = MagicMock()
        structured = MagicMock()
        structured.ainvoke = AsyncMock(return_value=evaluation)
        mock_llm.with_structured_output = MagicMock(return_value=structured)

        node = make_result_evaluator_node(mock_llm)
        state = _base_state(evidence=[_chunk(1)], iteration=MAX_ITERATIONS)
        result = await node(state)

        assert result["is_sufficient"] is True

    @pytest.mark.asyncio
    async def test_evaluator_failure_treats_as_sufficient(self):
        from telaios.core.agents.retrieval.nodes import make_result_evaluator_node

        mock_llm = MagicMock()
        structured = MagicMock()
        structured.ainvoke = AsyncMock(side_effect=Exception("LLM error"))
        mock_llm.with_structured_output = MagicMock(return_value=structured)

        node = make_result_evaluator_node(mock_llm)
        state = _base_state(evidence=[_chunk(1)], iteration=0)
        result = await node(state)

        assert result["is_sufficient"] is True

    @pytest.mark.asyncio
    async def test_empty_evidence_treated_as_sufficient(self):
        from telaios.core.agents.retrieval.nodes import make_result_evaluator_node

        mock_llm = MagicMock()
        structured = MagicMock()
        structured.ainvoke = AsyncMock(side_effect=Exception("should not be called"))
        mock_llm.with_structured_output = MagicMock(return_value=structured)

        node = make_result_evaluator_node(mock_llm)
        state = _base_state(evidence=[])  # no evidence
        result = await node(state)

        assert result["is_sufficient"] is True
        structured.ainvoke.assert_not_called()  # LLM should NOT be called


class TestSynthesizerNode:
    @pytest.mark.asyncio
    async def test_produces_answer(self):
        from telaios.core.agents.retrieval.nodes import make_synthesizer_node
        from telaios.core.knowledge.config import KnowledgePipelineConfig
        from langchain_core.messages import AIMessage

        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=AIMessage(content="The auth flow uses JWT [1]."))

        node = make_synthesizer_node(mock_llm, KnowledgePipelineConfig())
        state = _base_state(
            evidence=[_chunk(1)],
            evidence_scores=[0.9],
            search_plan=[SearchStep(sub_query="auth", tool="vector_search", reason="r")],
        )
        result = await node(state)

        assert "answer" in result
        assert "JWT" in result["answer"]

    @pytest.mark.asyncio
    async def test_synthesizer_failure_returns_empty_answer(self):
        from telaios.core.agents.retrieval.nodes import make_synthesizer_node
        from telaios.core.knowledge.config import KnowledgePipelineConfig

        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(side_effect=Exception("LLM error"))

        node = make_synthesizer_node(mock_llm, KnowledgePipelineConfig())
        state = _base_state(evidence=[_chunk(1)])
        result = await node(state)

        assert result["answer"] == ""
