"""State types for the RetrievalAgent LangGraph StateGraph."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from telaios.core.knowledge.pipeline import Citation
from telaios.core.types import Chunk

MAX_ITERATIONS = 3


class SearchStep(BaseModel):
    sub_query: str
    tool: Literal["vector_search", "graph_structural", "bm25", "generated_docs"]
    reason: str


class SearchPlan(BaseModel):
    steps: list[SearchStep]


class EvaluationResult(BaseModel):
    is_sufficient: bool
    missing_aspects: list[str]
    follow_up_queries: list[str]
    confidence: float = Field(ge=0.0, le=1.0)


class RetrievalState(TypedDict):
    query: str
    project_id: str
    source: str              # "all" | "documents" | "repositories"
    top_k: int
    search_plan: list[SearchStep]
    pending_steps: list[SearchStep]
    evidence: list[Chunk]
    evidence_scores: list[float]
    iteration: int
    max_iterations: int
    is_sufficient: bool
    follow_up_queries: list[str]
    answer: str
    citations: list[Citation]


__all__ = [
    "MAX_ITERATIONS",
    "EvaluationResult",
    "RetrievalState",
    "SearchPlan",
    "SearchStep",
]
