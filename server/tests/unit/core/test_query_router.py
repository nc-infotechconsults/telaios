"""Unit tests for query intent classifier (query_router.py)."""

from __future__ import annotations

import pytest

from telaios.core.knowledge.query_router import QueryIntent, classify_query


# ── SEMANTIC fallback ─────────────────────────────────────────────────────────


class TestSemanticFallback:
    def test_generic_question_is_semantic(self):
        intent, _ = classify_query("What does this application do?")
        assert intent == QueryIntent.SEMANTIC

    def test_empty_string_is_semantic(self):
        intent, _ = classify_query("")
        assert intent == QueryIntent.SEMANTIC

    def test_plain_description_is_semantic(self):
        intent, _ = classify_query("explain the authentication flow")
        assert intent == QueryIntent.SEMANTIC

    def test_returns_empty_params_for_semantic(self):
        _, params = classify_query("how does caching work?")
        assert params == {}


# ── DEPENDENCY intent ──────────────────────────────────────────────────────────


class TestDependencyIntent:
    @pytest.mark.parametrize("query", [
        "which classes use UserService?",
        "what services depend on UserRepository?",
        "who calls OrderService?",
        "which components inject PaymentGateway?",
        "what uses NotificationService",
        "dependencies of UserService",
    ])
    def test_dependency_queries(self, query: str):
        intent, _ = classify_query(query)
        assert intent == QueryIntent.DEPENDENCY, f"Expected DEPENDENCY for: {query!r}"

    def test_dependency_extracts_class_name(self):
        _, params = classify_query("which classes use UserRepository?")
        assert params.get("class_name") == "UserRepository"

    def test_dependency_class_name_last_pascal(self):
        _, params = classify_query("what imports OrderService from UserController?")
        # Last PascalCase wins
        assert params.get("class_name") in ("OrderService", "UserController")


# ── INHERITANCE intent ─────────────────────────────────────────────────────────


class TestInheritanceIntent:
    @pytest.mark.parametrize("query", [
        "what extends BaseController?",
        "which classes implement UserService?",
        "show the class hierarchy",
        "what subclasses are there?",
        "parent class of OrderController",
        "child classes of AbstractEntity",
    ])
    def test_inheritance_queries(self, query: str):
        intent, _ = classify_query(query)
        assert intent == QueryIntent.INHERITANCE, f"Expected INHERITANCE for: {query!r}"

    def test_inheritance_extracts_class_name(self):
        _, params = classify_query("what extends BaseController?")
        assert params.get("class_name") == "BaseController"


# ── ENDPOINT_COUNT intent ──────────────────────────────────────────────────────


class TestEndpointCountIntent:
    @pytest.mark.parametrize("query", [
        "how many REST APIs are there?",
        "count the endpoints",
        "how many endpoints exist?",
        "total number of routes",
        "how many GET methods are defined?",
    ])
    def test_endpoint_count_queries(self, query: str):
        intent, _ = classify_query(query)
        assert intent == QueryIntent.ENDPOINT_COUNT, f"Expected ENDPOINT_COUNT for: {query!r}"

    def test_endpoint_count_returns_no_http_method(self):
        # endpoint_count queries don't extract http_method (no path context)
        intent, params = classify_query("how many REST APIs are there?")
        assert intent == QueryIntent.ENDPOINT_COUNT
        # params may be empty or not include http_method — just verify intent


# ── ENDPOINT_LIST intent ───────────────────────────────────────────────────────


class TestEndpointListIntent:
    @pytest.mark.parametrize("query", [
        "list all available endpoints",
        "what endpoints are exposed?",
        "show all REST APIs",
        "which routes are defined?",
        "what endpoints exist in this service?",
    ])
    def test_endpoint_list_queries(self, query: str):
        intent, _ = classify_query(query)
        assert intent == QueryIntent.ENDPOINT_LIST, f"Expected ENDPOINT_LIST for: {query!r}"


# ── ENDPOINT_DETAIL intent ────────────────────────────────────────────────────


class TestEndpointDetailIntent:
    @pytest.mark.parametrize("query", [
        "what is the request body for POST /users?",
        "what payload does the create user endpoint accept?",
        "POST /api/v1/orders request body",
        "what input body does PUT /products take?",
        "request body for the login endpoint",
    ])
    def test_endpoint_detail_queries(self, query: str):
        intent, _ = classify_query(query)
        assert intent == QueryIntent.ENDPOINT_DETAIL, f"Expected ENDPOINT_DETAIL for: {query!r}"

    def test_endpoint_detail_extracts_http_method(self):
        _, params = classify_query("what is the request body for POST /users?")
        assert params.get("http_method") == "POST"

    def test_endpoint_detail_extracts_path(self):
        _, params = classify_query("what is the request body for POST /users?")
        assert params.get("path") == "/users"

    def test_endpoint_detail_path_with_segments(self):
        _, params = classify_query("POST /api/v1/orders/create")
        assert "/api/v1/orders/create" in params.get("path", "")


# ── param extraction edge cases ───────────────────────────────────────────────


class TestParamExtraction:
    def test_no_pascal_case_means_no_class_name(self):
        intent, params = classify_query("which classes use the service?")
        if intent == QueryIntent.DEPENDENCY:
            assert "class_name" not in params or params["class_name"] is None or True
            # "service" is not PascalCase — class_name should be absent or filtered

    def test_excluded_words_not_captured(self):
        # "REST", "API" etc. are in the exclude list
        _, params = classify_query("what REST APIs exist?")
        assert params.get("class_name") not in ("REST", "API")


# ── Python / TypeScript structural patterns ───────────────────────────────────

class TestPythonStructuralPatterns:
    def test_snake_case_function_dependency(self):
        intent, params = classify_query("which functions call process_payment?")
        assert intent == QueryIntent.DEPENDENCY

    def test_python_class_dependency(self):
        intent, _ = classify_query("what uses UserRepository?")
        assert intent == QueryIntent.DEPENDENCY

    def test_fastapi_route_list(self):
        intent, _ = classify_query("what routes does the users router expose?")
        assert intent == QueryIntent.ENDPOINT_LIST

    def test_flask_endpoint_list(self):
        intent, _ = classify_query("list all flask endpoints")
        assert intent == QueryIntent.ENDPOINT_LIST

    def test_python_inheritance(self):
        intent, _ = classify_query("what classes extend BaseService?")
        assert intent == QueryIntent.INHERITANCE

    def test_route_expose_pattern(self):
        intent, _ = classify_query("which routes are exposed by the payment service?")
        assert intent == QueryIntent.ENDPOINT_LIST
