"""
src/core/fusion.py
------------------
Result fusion utilities for combining multiple retrieval runs.

Reciprocal Rank Fusion (RRF) is a simple, parameter-free method for
combining rankings from multiple retrievers without needing training data.

Source: Reciprocal Rank Fusion -
https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.types import Chunk, RetrievalResult


def reciprocal_rank_fusion(
    results_lists: list[list["Chunk"]],
    k: int = 60,
) -> list[tuple["Chunk", float]]:
    """
    Fuse multiple ranked result lists using Reciprocal Rank Fusion.

    RRF combines rankings without requiring score normalization or training.
    The formula is: RRF(d) = sum(1 / (k + rank(d))) for each retrieved list.

    Args:
        results_lists: List of ranked result lists (each list is ordered
                       from most relevant to least relevant).
        k: Constant that controls how much rank matters vs. being present.
           Higher k reduces the impact of rank differences. Default: 60.

    Returns:
        List of (chunk, score) tuples ordered by fused RRF score (descending).

    Example:
        >>> chunks_a = [chunk1, chunk2, chunk3]
        >>> chunks_b = [chunk2, chunk1, chunk4]
        >>> fused = reciprocal_rank_fusion([chunks_a, chunks_b])
        >>> # chunk2 ranks higher because it appears in both lists
    """
    if not results_lists:
        return []

    rrf_scores: dict[str, float] = {}
    chunk_map: dict[str, "Chunk"] = {}

    for result_list in results_lists:
        for rank, chunk in enumerate(result_list, start=1):
            chunk_id = chunk.id
            if chunk_id not in rrf_scores:
                rrf_scores[chunk_id] = 0.0
                chunk_map[chunk_id] = chunk
            rrf_scores[chunk_id] += 1.0 / (k + rank)

    sorted_chunk_ids = sorted(
        rrf_scores.keys(),
        key=lambda cid: rrf_scores[cid],
        reverse=True,
    )

    return [(chunk_map[cid], rrf_scores[cid]) for cid in sorted_chunk_ids]


def reciprocal_rank_fusion_with_scores(
    results_with_scores: list[list[tuple["Chunk", float]]],
    k: int = 60,
) -> list[tuple["Chunk", float]]:
    """
    Fuse retrieval results that already have scores (e.g., from vector search).

    This variant takes (chunk, score) tuples and uses the score ranks within
    each list for the RRF formula, ignoring the actual score values.

    Args:
        results_with_scores: List of (chunk, score) lists per retriever.
        k: RRF constant (default: 60).

    Returns:
        List of (chunk, fused_score) tuples ordered by fused score.
    """
    if not results_with_scores:
        return []

    rrf_scores: dict[str, float] = {}
    chunk_map: dict[str, "Chunk"] = {}

    for result_list in results_with_scores:
        for rank, (chunk, _) in enumerate(result_list, start=1):
            chunk_id = chunk.id
            if chunk_id not in rrf_scores:
                rrf_scores[chunk_id] = 0.0
                chunk_map[chunk_id] = chunk
            rrf_scores[chunk_id] += 1.0 / (k + rank)

    sorted_chunk_ids = sorted(
        rrf_scores.keys(),
        key=lambda cid: rrf_scores[cid],
        reverse=True,
    )

    return [(chunk_map[cid], rrf_scores[cid]) for cid in sorted_chunk_ids]