"""Unit tests for _build_structural_header in ingestion.py."""

from __future__ import annotations

import pytest

from telaios.core.knowledge.ingestion import _build_structural_header


class TestBuildStructuralHeader:
    def test_full_meta_produces_full_header(self):
        meta = {
            "language": "java",
            "source_path": "com/example/UserController.java",
            "enclosing_class": "UserController",
            "symbol_type": "function",
            "symbol_name": "getUser",
        }
        header = _build_structural_header(meta)
        assert header.startswith("[")
        assert header.endswith("]\n")
        assert "java" in header
        assert "UserController.java" in header
        assert "class:UserController" in header
        assert "function:getUser" in header

    def test_empty_meta_produces_empty_string(self):
        assert _build_structural_header({}) == ""

    def test_only_language(self):
        header = _build_structural_header({"language": "python"})
        assert "[python]" in header

    def test_no_enclosing_class(self):
        meta = {
            "language": "java",
            "source_path": "Foo.java",
            "symbol_type": "class",
            "symbol_name": "Foo",
        }
        header = _build_structural_header(meta)
        assert "class:Foo" in header
        assert "class:None" not in header

    def test_preamble_symbol_type_excluded(self):
        meta = {
            "language": "java",
            "source_path": "Foo.java",
            "symbol_type": "preamble",
            "symbol_name": None,
        }
        header = _build_structural_header(meta)
        # preamble type should not appear as sym_type:sym_name part
        assert "preamble:" not in header

    def test_file_index_symbol_type_excluded(self):
        meta = {
            "language": "java",
            "source_path": "Foo.java",
            "symbol_type": "file_index",
            "symbol_name": "index",
        }
        header = _build_structural_header(meta)
        assert "file_index:" not in header

    def test_long_path_keeps_last_two_segments(self):
        meta = {
            "source_path": "com/example/service/UserService.java",
        }
        header = _build_structural_header(meta)
        # Should include "service/UserService.java" (last 2 segments)
        assert "service/UserService.java" in header
        # Should not include full path
        assert "com/example/service/UserService.java" not in header

    def test_short_path_kept_as_is(self):
        meta = {"source_path": "Foo.java"}
        header = _build_structural_header(meta)
        assert "Foo.java" in header

    def test_no_symbol_name_no_sym_part(self):
        meta = {
            "language": "python",
            "symbol_type": "function",
            # symbol_name absent
        }
        header = _build_structural_header(meta)
        assert "function:" not in header

    def test_header_ends_with_newline(self):
        meta = {"language": "java"}
        header = _build_structural_header(meta)
        assert header.endswith("\n")

    def test_method_in_class(self):
        meta = {
            "language": "java",
            "source_path": "com/example/OrderService.java",
            "enclosing_class": "OrderService",
            "symbol_type": "function",
            "symbol_name": "createOrder",
        }
        header = _build_structural_header(meta)
        assert "class:OrderService" in header
        assert "function:createOrder" in header
