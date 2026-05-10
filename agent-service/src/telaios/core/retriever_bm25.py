"""Dependency-free BM25-like retriever used by integration tests."""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any


class BM25Retriever:
    """Small in-memory sparse retriever for dict documents."""

    def __init__(self) -> None:
        self._docs: list[dict[str, Any]] = []
        self._doc_terms: list[Counter[str]] = []
        self._doc_freqs: Counter[str] = Counter()

    def add_documents(self, docs: list[dict[str, Any]]) -> None:
        self._docs = list(docs)
        self._doc_terms = [Counter(self._tokenize(doc.get("content", ""))) for doc in docs]
        self._doc_freqs = Counter()
        for terms in self._doc_terms:
            self._doc_freqs.update(terms.keys())

    def retrieve(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        query_terms = self._tokenize(query)
        if not query_terms:
            return []

        scored: list[tuple[float, dict[str, Any]]] = []
        total_docs = max(len(self._docs), 1)
        for doc, terms in zip(self._docs, self._doc_terms):
            score = 0.0
            for term in query_terms:
                if terms[term] == 0:
                    continue
                idf = math.log((total_docs + 1) / (self._doc_freqs[term] + 1)) + 1
                score += terms[term] * idf
            if score > 0:
                scored.append((score, doc))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [{**doc, "score": score} for score, doc in scored[:top_k]]

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        return re.findall(r"[a-z0-9]+", text.lower())
