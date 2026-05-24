"""Unit tests for BM25Store and camelCase-aware tokenizer."""

from __future__ import annotations

import pytest

from telaios.core.stores.bm25 import BM25Store, _tokenize


# ── _tokenize ─────────────────────────────────────────────────────────────────


class TestTokenize:
    def test_simple_lowercase_word(self):
        assert "hello" in _tokenize("hello")

    def test_drops_single_char_tokens(self):
        tokens = _tokenize("a b c def")
        assert "a" not in tokens
        assert "b" not in tokens
        assert "def" in tokens

    def test_camelcase_whole_token_preserved(self):
        # getUserById → getuserbyid (lowercased whole)
        assert "getuserbyid" in _tokenize("getUserById")

    def test_camelcase_subparts(self):
        tokens = _tokenize("getUserById")
        assert "get" in tokens
        assert "user" in tokens
        assert "by" in tokens
        assert "id" in tokens

    def test_pascalcase_whole_and_parts(self):
        tokens = _tokenize("UserService")
        assert "userservice" in tokens
        assert "user" in tokens
        assert "service" in tokens

    def test_acronym_followed_by_word(self):
        # XMLParser → xml, parser
        tokens = _tokenize("XMLParser")
        assert "xml" in tokens
        assert "parser" in tokens

    def test_mixed_acronym_camel(self):
        # parseHTTPRequest → parse, http, request
        tokens = _tokenize("parseHTTPRequest")
        parts = {"parse", "http", "request"}
        assert parts.issubset(set(tokens))

    def test_dot_separated_package(self):
        tokens = _tokenize("com.example.UserService")
        assert "com" in tokens
        assert "example" in tokens
        assert "userservice" in tokens
        assert "user" in tokens

    def test_slash_separated_path(self):
        tokens = _tokenize("/api/v1/users")
        assert "api" in tokens
        assert "users" in tokens

    def test_empty_string(self):
        assert _tokenize("") == []

    def test_special_chars_only(self):
        assert _tokenize("@!#$%") == []

    def test_underscore_separated(self):
        tokens = _tokenize("user_service_impl")
        assert "user" in tokens
        assert "service" in tokens
        assert "impl" in tokens

    def test_digits_preserved(self):
        tokens = _tokenize("v2endpoint")
        assert "v2endpoint" in tokens

    def test_no_duplicate_whole_plus_sub(self):
        # "hello" should not be duplicated — it's one part, no subparts
        tokens = _tokenize("hello")
        assert tokens.count("hello") == 1

    def test_annotation_at_stripped(self):
        # @RestController → RestController camelCase split
        tokens = _tokenize("@RestController")
        assert "restcontroller" in tokens
        assert "rest" in tokens
        assert "controller" in tokens


# ── BM25Store ─────────────────────────────────────────────────────────────────


class TestBM25Store:
    def test_search_empty_store_returns_empty(self):
        store = BM25Store()
        assert store.search("coll", "query", "pid") == []

    def test_has_index_false_before_rebuild(self):
        store = BM25Store()
        assert not store.has_index("coll", "pid")

    def test_has_index_true_after_rebuild(self):
        store = BM25Store()
        store.rebuild("coll", [{"id": "1", "content": "hello world"}], "pid")
        assert store.has_index("coll", "pid")

    def test_rebuild_and_search_basic(self):
        store = BM25Store()
        docs = [{"id": "1", "content": "Qdrant vector database"}]
        store.rebuild("coll", docs, "pid")
        results = store.search("coll", "Qdrant", "pid", top_k=1)
        assert len(results) == 1
        assert results[0]["id"] == "1"

    def test_camelcase_query_matches_camelcase_doc(self):
        store = BM25Store()
        docs = [
            {"id": "1", "content": "public User getUserById(Long id)"},
            {"id": "2", "content": "unrelated animal facts"},
        ]
        store.rebuild("coll", docs, "pid")
        results = store.search("coll", "getUserById", "pid", top_k=2)
        assert results[0]["id"] == "1"

    def test_partial_identifier_match(self):
        store = BM25Store()
        docs = [
            {"id": "1", "content": "class UserRepository extends JpaRepository"},
            {"id": "2", "content": "nothing relevant here"},
        ]
        store.rebuild("coll", docs, "pid")
        results = store.search("coll", "repository", "pid", top_k=2)
        assert results[0]["id"] == "1"

    def test_project_isolation_separate_indexes(self):
        store = BM25Store()
        store.rebuild("coll", [{"id": "1", "content": "alpha specific content"}], "pid_a")
        store.rebuild("coll", [{"id": "2", "content": "beta content here"}], "pid_b")
        hits_a = store.search("coll", "alpha", "pid_a")
        hits_b = store.search("coll", "alpha", "pid_b")
        assert any(r["id"] == "1" for r in hits_a)
        assert not any(r["id"] == "1" for r in hits_b)

    def test_top_k_respected(self):
        store = BM25Store()
        docs = [{"id": str(i), "content": f"term item doc {i}"} for i in range(10)]
        store.rebuild("coll", docs, "pid")
        results = store.search("coll", "term", "pid", top_k=3)
        assert len(results) <= 3

    def test_delete_project_removes_index(self):
        store = BM25Store()
        store.rebuild("coll", [{"id": "1", "content": "some content"}], "pid")
        store.delete_project("coll", "pid")
        assert not store.has_index("coll", "pid")
        assert store.search("coll", "some", "pid") == []

    def test_delete_nonexistent_is_noop(self):
        store = BM25Store()
        store.delete_project("coll", "nonexistent")  # must not raise

    def test_global_fallback_when_project_index_missing(self):
        store = BM25Store()
        docs = [{"id": "1", "content": "global content"}]
        # Index under no project_id (global)
        store.rebuild("coll", docs, project_id=None)
        # Query with a project_id that has no dedicated index → falls back to global
        results = store.search("coll", "global", project_id="some-pid")
        assert len(results) >= 1

    def test_bm25_score_field_in_result(self):
        store = BM25Store()
        store.rebuild("coll", [{"id": "1", "content": "test content"}], "pid")
        results = store.search("coll", "test", "pid")
        assert "_bm25_score" in results[0]

    def test_no_match_returns_empty(self):
        store = BM25Store()
        store.rebuild("coll", [{"id": "1", "content": "totally unrelated content"}], "pid")
        results = store.search("coll", "xyzzy123", "pid")
        assert results == []
