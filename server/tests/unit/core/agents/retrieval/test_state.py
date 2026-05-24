"""Unit tests for RetrievalState and SearchStep validation."""
from __future__ import annotations

import pytest
from telaios.core.agents.retrieval.state import (
    SearchStep,
    SearchPlan,
    EvaluationResult,
)


class TestSearchStep:
    def test_valid_vector_search_step(self):
        step = SearchStep(sub_query="how does auth work", tool="vector_search", reason="semantic question")
        assert step.tool == "vector_search"

    def test_valid_graph_structural_step(self):
        step = SearchStep(sub_query="which classes extend BaseController", tool="graph_structural", reason="inheritance")
        assert step.tool == "graph_structural"

    def test_invalid_tool_raises(self):
        with pytest.raises(Exception):
            SearchStep(sub_query="q", tool="nonexistent_tool", reason="r")


class TestSearchPlan:
    def test_empty_plan(self):
        plan = SearchPlan(steps=[])
        assert plan.steps == []

    def test_plan_with_steps(self):
        steps = [
            SearchStep(sub_query="q1", tool="vector_search", reason="r1"),
            SearchStep(sub_query="q2", tool="bm25", reason="r2"),
        ]
        plan = SearchPlan(steps=steps)
        assert len(plan.steps) == 2


class TestEvaluationResult:
    def test_sufficient_result(self):
        result = EvaluationResult(
            is_sufficient=True,
            missing_aspects=[],
            follow_up_queries=[],
            confidence=0.9,
        )
        assert result.is_sufficient is True
        assert result.confidence == 0.9

    def test_insufficient_result_with_follow_ups(self):
        result = EvaluationResult(
            is_sufficient=False,
            missing_aspects=["missing error handling details"],
            follow_up_queries=["how does the error handler work"],
            confidence=0.4,
        )
        assert not result.is_sufficient
        assert len(result.follow_up_queries) == 1

    def test_confidence_out_of_bounds_raises(self):
        with pytest.raises(Exception):
            EvaluationResult(
                is_sufficient=True,
                missing_aspects=[],
                follow_up_queries=[],
                confidence=1.5,
            )
