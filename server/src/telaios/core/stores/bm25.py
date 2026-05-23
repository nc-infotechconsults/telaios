"""BM25Store — in-memory sparse retrieval index, project_id aware."""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9_]+", text.lower())


class _BM25Index:
    """BM25 index over a fixed document set."""

    K1 = 1.5
    B = 0.75

    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self._docs = docs
        self._doc_terms = [Counter(_tokenize(d.get("content", ""))) for d in docs]
        self._doc_freqs: Counter[str] = Counter()
        for terms in self._doc_terms:
            self._doc_freqs.update(terms.keys())
        total = sum(len(Counter(_tokenize(d.get("content", "")))) for d in docs)
        self._avg_dl = total / max(len(docs), 1)

    def search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        query_terms = _tokenize(query)
        if not query_terms:
            return []

        n = max(len(self._docs), 1)
        scored: list[tuple[float, dict[str, Any]]] = []

        for doc, terms in zip(self._docs, self._doc_terms, strict=True):
            dl = sum(terms.values())
            score = 0.0
            for term in query_terms:
                tf = terms[term]
                if tf == 0:
                    continue
                df = self._doc_freqs[term]
                idf = math.log((n - df + 0.5) / (df + 0.5) + 1)
                norm_tf = (tf * (self.K1 + 1)) / (tf + self.K1 * (1 - self.B + self.B * dl / self._avg_dl))
                score += idf * norm_tf
            if score > 0:
                scored.append((score, doc))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [{**doc, "_bm25_score": score} for score, doc in scored[:top_k]]


class BM25Store:
    """
    In-memory BM25 store, keyed by (collection, project_id).

    Rebuilt from Qdrant after each ingest and at warm-up.
    project_id=None means no filtering (all docs in collection).
    """

    def __init__(self) -> None:
        # key: (collection, project_id or "")
        self._indexes: dict[tuple[str, str], _BM25Index] = {}

    def rebuild(
        self,
        collection: str,
        docs: list[dict[str, Any]],
        project_id: str | None = None,
    ) -> None:
        """Replace the index for *(collection, project_id)*."""
        key = (collection, project_id or "")
        self._indexes[key] = _BM25Index(docs)

    def search(
        self,
        collection: str,
        query: str,
        project_id: str | None = None,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """Return scored documents. Falls back to global index if project index absent."""
        key = (collection, project_id or "")
        index = self._indexes.get(key) or self._indexes.get((collection, ""))
        if index is None:
            return []
        return index.search(query, top_k=top_k)

    def has_index(self, collection: str, project_id: str | None = None) -> bool:
        return (collection, project_id or "") in self._indexes

    def delete_project(self, collection: str, project_id: str) -> None:
        """Remove the BM25 index for *(collection, project_id)*."""
        self._indexes.pop((collection, project_id), None)


__all__ = ["BM25Store"]
