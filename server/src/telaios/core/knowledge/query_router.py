"""Query intent classifier — routes natural language queries to graph or vector search.

Regex-based, no LLM. Fast enough to run on every query without latency cost.
Returns (QueryIntent, extracted_params) so callers can dispatch accordingly.
"""

from __future__ import annotations

import re
from enum import Enum


class QueryIntent(str, Enum):
    DEPENDENCY = "dependency"         # "which class uses UserService"
    INHERITANCE = "inheritance"       # "what extends BaseController"
    ENDPOINT_COUNT = "endpoint_count" # "how many REST APIs are there"
    ENDPOINT_LIST = "endpoint_list"   # "list all available endpoints"
    ENDPOINT_DETAIL = "endpoint_detail"  # "request body for POST /users"
    SEMANTIC = "semantic"             # everything else → vector search


# Ordered: more specific patterns first
_PATTERNS: list[tuple[QueryIntent, list[str]]] = [
    (QueryIntent.ENDPOINT_DETAIL, [
        r"\b(request body|payload|input body|body type)\b",
        r"\bwhat (is the |are the )?(body|payload|parameter[s]?|input).{0,30}(post|put|patch|get|delete|endpoint|api)\b",
        r"\b(post|put|patch|get|delete)\s+/[\w{}/.-]+",
        r"\bfor\s+(post|put|get|delete|patch)\s+(request|call|endpoint|api)?\b",
        r"\baccept[s]?\s+(what|which)\b",
    ]),
    (QueryIntent.ENDPOINT_COUNT, [
        r"\bhow many\b.{0,30}\b(api[s]?|endpoint[s]?|route[s]?|rest\b)",
        r"\b(count|number of|total).{0,20}(api[s]?|endpoint[s]?|route[s]?)\b",
        r"\bhow many\b.{0,30}\b(get|post|put|delete|patch)\b.{0,20}\b(method[s]?|endpoint[s]?)\b",
    ]),
    (QueryIntent.ENDPOINT_LIST, [
        r"\b(list|show|what|which).{0,20}(all\s+)?(available\s+|existing\s+)?(api[s]?|endpoint[s]?|route[s]?|rest\b)",
        r"\bwhat endpoints?\b",
        r"\brest api[s]?\b.{0,30}\b(available|exist|defined|exposed)\b",
        r"\bexposed (api[s]?|endpoint[s]?)\b",
        r"\b(flask|fastapi|django|nestjs|express)\b.{0,30}\b(endpoint[s]?|route[s]?)\b",
        r"\broute[s]?\b.{0,20}\b(expose[sd]?|defined|available)\b",
    ]),
    (QueryIntent.INHERITANCE, [
        r"\b(extend[s]?|implement[s]?|subclass(?:es)?|inherit[s]?)\b",
        r"\bclass hierarch",
        r"\bparent (class|interface)\b",
        r"\bchild class(?:es)?\b",
        r"\bwhat (class(?:es)?|type[s]?) (extend[s]?|implement[s]?)\b",
        r"\bsuper(class|type|interface)\b",
    ]),
    (QueryIntent.DEPENDENCY, [
        r"\b(which|what)\s+(class(?:es)?|service[s]?|component[s]?|bean[s]?|function[s]?|module[s]?)\s+(use[sd]?|depend[s]? on|import[s]?|reference[s]?|call[s]?|inject[s]?|autowire[sd]?)\b",
        r"\bwho\s+(use[sd]?|call[sd]?|depend[s]?\s+on|inject[s]?)\b",
        r"\bdepend[s]? on\b",
        r"\bdependencies\s+(of|for)\b",
        r"\bwhat uses?\b.{0,30}\b[A-Z]\w+\b",
        r"\bwhich\s+(class(?:es)?|service[s]?|function[s]?)\s+use[s]?\b",
        r"\bimport[s]?\b.{0,30}\b[A-Z]\w+\b",
        r"\bwhere is\b.{0,30}\b[A-Z]\w+(Repository|Service|Controller|Manager|Handler)\b.{0,20}\bused\b",
        r"\bwhich functions?\s+call\s+\w+\b",
    ]),
]

# PascalCase words that look like class names but are not
_CLASS_NAME_EXCLUDE = frozenset({
    "REST", "API", "HTTP", "GET", "POST", "PUT", "DELETE", "PATCH",
    "URL", "URI", "JSON", "XML", "SQL", "DTO", "ID", "OK", "IT",
    "A", "I",
})


def classify_query(text: str) -> tuple[QueryIntent, dict[str, str]]:
    """Classify query intent and extract key parameters.

    Returns (intent, params) where params may contain:
    - class_name: PascalCase class/service/repository name mentioned in query
    - http_method: GET | POST | PUT | DELETE | PATCH
    - path: /path/segment extracted from query
    """
    lower = text.lower()

    for intent, patterns in _PATTERNS:
        for pattern in patterns:
            if re.search(pattern, lower, re.IGNORECASE):
                params = _extract_params(text, lower, intent)
                return intent, params

    return QueryIntent.SEMANTIC, {}


def _extract_params(text: str, lower: str, intent: QueryIntent) -> dict[str, str]:
    params: dict[str, str] = {}

    if intent in (QueryIntent.DEPENDENCY, QueryIntent.INHERITANCE, QueryIntent.ENDPOINT_DETAIL):
        # Extract PascalCase identifiers (likely class names)
        candidates = [
            w for w in re.findall(r"\b([A-Z][a-zA-Z0-9]+)\b", text)
            if w not in _CLASS_NAME_EXCLUDE and len(w) > 2
        ]
        if candidates:
            # Last PascalCase word tends to be the target entity
            params["class_name"] = candidates[-1]

    if intent in (QueryIntent.ENDPOINT_DETAIL, QueryIntent.ENDPOINT_LIST):
        # HTTP method
        m = re.search(r"\b(GET|POST|PUT|DELETE|PATCH|get|post|put|delete|patch)\b", text)
        if m:
            params["http_method"] = m.group(1).upper()
        # Path segment
        pm = re.search(r"(/[\w{}/.-]+(?:/[\w{}/.-]*)*)", text)
        if pm:
            params["path"] = pm.group(1)

    return params


__all__ = ["QueryIntent", "classify_query"]
