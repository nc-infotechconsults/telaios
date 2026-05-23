"""Unit tests for TreeSitterChunker and get_code_chunker factory.

Covers:
  - Language detection from file extensions
  - Python: function, class, decorated_definition, symbol name/line metadata
  - Java: class, interface, enum
  - TypeScript: function, class, interface, type alias, export unwrapping, arrow const
  - JavaScript: function, class, export unwrapping, arrow const
  - max_lines splitting for oversized symbols
  - Line-count fallback for empty CST results
  - Empty / whitespace-only input
  - Metadata invariants: sequential index, start_line <= end_line, language set
  - get_code_chunker factory: correct type per extension
  - Parser cache: same Parser object reused across TreeSitterChunker instances
"""

from __future__ import annotations

import pytest

from telaios.core.chunkers import get_code_chunker
from telaios.core.chunkers.base import ChunkMetadata
from telaios.core.chunkers.treesitter import EXTENSION_TO_LANGUAGE, TreeSitterChunker


# ── Helpers ───────────────────────────────────────────────────────────────────


def _names(chunks):
    return [meta.symbol_name for _, meta in chunks]


def _types(chunks):
    return [meta.symbol_type for _, meta in chunks]


def _assert_metadata_invariants(chunks, language: str) -> None:
    """Shared invariants every TreeSitterChunker result must satisfy."""
    assert chunks, "must return at least one chunk"
    for i, (text, meta) in enumerate(chunks):
        assert meta.index == i, f"chunk {i}: index mismatch"
        assert meta.language == language, f"chunk {i}: wrong language"
        assert isinstance(text, str) and text, f"chunk {i}: empty text"
        if meta.start_line is not None and meta.end_line is not None:
            assert meta.start_line <= meta.end_line, f"chunk {i}: start > end line"


# ── Language detection ────────────────────────────────────────────────────────


class TestDetectLanguage:
    @pytest.mark.parametrize("ext,expected", [
        (".py", "python"),
        (".java", "java"),
        (".ts", "typescript"),
        (".tsx", "tsx"),
        (".js", "javascript"),
        (".jsx", "javascript"),
    ])
    def test_known_extensions(self, ext, expected):
        assert TreeSitterChunker.detect_language(f"file{ext}") == expected

    @pytest.mark.parametrize("path", ["notes.md", "data.json", "style.css", "README"])
    def test_unknown_returns_none(self, path):
        assert TreeSitterChunker.detect_language(path) is None

    def test_case_insensitive(self):
        # suffix is lowercased — .PY maps to python same as .py
        assert TreeSitterChunker.detect_language("App.PY") == "python"
        assert TreeSitterChunker.detect_language("app.py") == "python"
        assert TreeSitterChunker.detect_language("App.TS") == "typescript"


# ── Python ────────────────────────────────────────────────────────────────────


class TestPythonChunker:
    @pytest.fixture
    def chunker(self):
        return TreeSitterChunker(language="python", max_lines=50)

    def test_extracts_top_level_function(self, chunker):
        code = "def hello(name: str) -> str:\n    return f'Hi {name}'\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "hello" and m.symbol_type == "function" for _, m in chunks)

    def test_extracts_top_level_class(self, chunker):
        code = "class Greeter:\n    def greet(self) -> None:\n        pass\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "Greeter" and m.symbol_type == "class" for _, m in chunks)

    def test_decorated_function(self, chunker):
        code = "@staticmethod\ndef util() -> int:\n    return 1\n"
        chunks = chunker.chunk(code)
        assert len(chunks) == 1
        assert chunks[0][1].symbol_type == "function"

    def test_multiple_symbols(self, chunker):
        code = (
            "def alpha():\n    pass\n\n"
            "def beta():\n    pass\n\n"
            "class Gamma:\n    pass\n"
        )
        chunks = chunker.chunk(code)
        names = _names(chunks)
        assert "alpha" in names
        assert "beta" in names
        assert "Gamma" in names

    def test_line_numbers_correct(self, chunker):
        code = "def first():\n    pass\n\ndef second():\n    pass\n"
        chunks = chunker.chunk(code)
        first = next(t for _, t in chunks if t.symbol_name == "first")
        second = next(t for _, t in chunks if t.symbol_name == "second")
        assert first.start_line == 1
        assert second.start_line > first.end_line

    def test_metadata_invariants(self, chunker):
        code = "def f():\n    return 1\n\nclass C:\n    pass\n"
        _assert_metadata_invariants(chunker.chunk(code), "python")

    def test_empty_text_returns_fallback(self, chunker):
        chunks = chunker.chunk("")
        # line fallback returns one empty-ish chunk
        assert isinstance(chunks, list)

    def test_whitespace_only(self, chunker):
        chunks = chunker.chunk("   \n\n   ")
        assert isinstance(chunks, list)

    def test_no_nested_extraction(self, chunker):
        code = (
            "class Outer:\n"
            "    def method_a(self):\n"
            "        pass\n"
            "    def method_b(self):\n"
            "        pass\n"
        )
        chunks = chunker.chunk(code)
        # Only top-level class extracted; methods are NOT separate chunks
        assert len(chunks) == 1
        assert chunks[0][1].symbol_name == "Outer"


# ── Java ──────────────────────────────────────────────────────────────────────


class TestJavaChunker:
    @pytest.fixture
    def chunker(self):
        return TreeSitterChunker(language="java", max_lines=50)

    def test_extracts_class(self, chunker):
        code = "public class Foo {\n    public void run() {}\n}\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "Foo" and m.symbol_type == "class" for _, m in chunks)

    def test_extracts_interface(self, chunker):
        code = "public interface Printable {\n    void print();\n}\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "Printable" and m.symbol_type == "class" for _, m in chunks)

    def test_extracts_enum(self, chunker):
        code = "enum Color { RED, GREEN, BLUE }\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "Color" and m.symbol_type == "type" for _, m in chunks)

    def test_metadata_invariants(self, chunker):
        code = "public class A {}\nenum B { X }\n"
        _assert_metadata_invariants(chunker.chunk(code), "java")


# ── TypeScript ────────────────────────────────────────────────────────────────


class TestTypeScriptChunker:
    @pytest.fixture
    def chunker(self):
        return TreeSitterChunker(language="typescript", max_lines=50)

    def test_exported_function(self, chunker):
        code = "export function greet(name: string): string { return name; }\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "greet" and m.symbol_type == "function" for _, m in chunks)

    def test_exported_class(self, chunker):
        code = "export class UserService {\n    run(): void {}\n}\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "UserService" and m.symbol_type == "class" for _, m in chunks)

    def test_interface(self, chunker):
        code = "export interface Config {\n    apiKey: string;\n}\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "Config" and m.symbol_type == "class" for _, m in chunks)

    def test_type_alias(self, chunker):
        code = "export type UserId = string;\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "UserId" and m.symbol_type == "type" for _, m in chunks)

    def test_arrow_function_const(self, chunker):
        code = "const add = (a: number, b: number): number => a + b;\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "add" and m.symbol_type == "variable" for _, m in chunks)

    def test_multiple_exports(self, chunker):
        code = (
            "export function alpha(): void {}\n"
            "export class Beta {}\n"
            "export interface Gamma { x: number; }\n"
            "export type Delta = string;\n"
        )
        chunks = chunker.chunk(code)
        names = _names(chunks)
        assert "alpha" in names
        assert "Beta" in names
        assert "Gamma" in names
        assert "Delta" in names

    def test_metadata_invariants(self, chunker):
        code = "export function f(): void {}\nexport class C {}\n"
        _assert_metadata_invariants(chunker.chunk(code), "typescript")


# ── JavaScript ────────────────────────────────────────────────────────────────


class TestJavaScriptChunker:
    @pytest.fixture
    def chunker(self):
        return TreeSitterChunker(language="javascript", max_lines=50)

    def test_function_declaration(self, chunker):
        code = "function hello() { return 42; }\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "hello" and m.symbol_type == "function" for _, m in chunks)

    def test_exported_function(self, chunker):
        code = "export function greet() { return 'hi'; }\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "greet" and m.symbol_type == "function" for _, m in chunks)

    def test_class_declaration(self, chunker):
        code = "export class Greeter {\n    greet() { return 'hello'; }\n}\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "Greeter" and m.symbol_type == "class" for _, m in chunks)

    def test_arrow_function_const(self, chunker):
        code = "const mul = (a, b) => a * b;\n"
        chunks = chunker.chunk(code)
        assert any(m.symbol_name == "mul" and m.symbol_type == "variable" for _, m in chunks)

    def test_metadata_invariants(self, chunker):
        code = "function f() {}\nclass C {}\n"
        _assert_metadata_invariants(chunker.chunk(code), "javascript")


# ── max_lines splitting ───────────────────────────────────────────────────────


class TestMaxLinesSplitting:
    def test_oversized_symbol_is_split(self):
        body = "\n".join(f"    x_{i} = {i}" for i in range(30))
        code = f"def big_function():\n{body}\n"
        chunker = TreeSitterChunker(language="python", max_lines=10)
        chunks = chunker.chunk(code)
        assert len(chunks) > 1, "oversized symbol must produce multiple chunks"

    def test_split_chunks_cover_all_lines(self):
        body = "\n".join(f"    x_{i} = {i}" for i in range(30))
        code = f"def big_function():\n{body}\n"
        chunker = TreeSitterChunker(language="python", max_lines=10)
        chunks = chunker.chunk(code)
        combined = "".join(t for t, _ in chunks)
        # All lines of the body present in combined output
        assert "x_0" in combined
        assert "x_29" in combined

    def test_split_chunk_metadata_has_symbol_name(self):
        body = "\n".join(f"    x_{i} = {i}" for i in range(30))
        code = f"def chunky():\n{body}\n"
        chunker = TreeSitterChunker(language="python", max_lines=10)
        chunks = chunker.chunk(code)
        assert all(m.symbol_name == "chunky" for _, m in chunks)

    def test_split_indices_sequential(self):
        body = "\n".join(f"    x_{i} = {i}" for i in range(30))
        code = f"def big():\n{body}\n"
        chunker = TreeSitterChunker(language="python", max_lines=10)
        chunks = chunker.chunk(code)
        for i, (_, meta) in enumerate(chunks):
            assert meta.index == i


# ── Line-count fallback ───────────────────────────────────────────────────────


class TestLineCountFallback:
    def test_fallback_triggered_on_unsupported_language(self):
        # Ruby not supported → parser load fails → _line_chunk
        chunker = TreeSitterChunker(language="ruby", max_lines=5)
        code = "\n".join(f"line {i}" for i in range(20))
        chunks = chunker.chunk(code)
        assert len(chunks) > 1
        assert all(m.symbol_name is None for _, m in chunks)

    def test_fallback_splits_by_max_lines(self):
        chunker = TreeSitterChunker(language="ruby", max_lines=5)
        code = "\n".join(f"line {i}" for i in range(20))
        chunks = chunker.chunk(code)
        for text, meta in chunks:
            assert len(text.splitlines()) <= 5 + 1  # +1 for trailing newline tolerance

    def test_fallback_line_numbers_set(self):
        chunker = TreeSitterChunker(language="ruby", max_lines=5)
        code = "\n".join(f"line {i}" for i in range(10))
        chunks = chunker.chunk(code)
        assert chunks[0][1].start_line == 1
        assert all(m.start_line is not None for _, m in chunks)


# ── Parser cache ──────────────────────────────────────────────────────────────


class TestParserCache:
    def test_same_parser_reused(self):
        c1 = TreeSitterChunker(language="python")
        c2 = TreeSitterChunker(language="python")
        p1 = TreeSitterChunker._parser("python")
        p2 = TreeSitterChunker._parser("python")
        assert p1 is p2

    def test_different_language_different_parser(self):
        p_py = TreeSitterChunker._parser("python")
        p_js = TreeSitterChunker._parser("javascript")
        assert p_py is not p_js


# ── get_code_chunker factory ──────────────────────────────────────────────────


class TestGetCodeChunker:
    @pytest.mark.parametrize("path,expected_lang", [
        ("app.py", "python"),
        ("Service.java", "java"),
        ("index.ts", "typescript"),
        ("Component.tsx", "tsx"),
        ("utils.js", "javascript"),
        ("helper.jsx", "javascript"),
    ])
    def test_returns_treesitter_for_known_extensions(self, path, expected_lang):
        chunker = get_code_chunker(source_path=path)
        assert isinstance(chunker, TreeSitterChunker)
        assert chunker.language == expected_lang

    @pytest.mark.parametrize("path", ["README.md", "notes.txt", "config.yaml", "data.json"])
    def test_returns_semantic_for_unknown_extensions(self, path):
        from telaios.core.chunkers.semantic import SemanticChunker
        chunker = get_code_chunker(source_path=path)
        assert isinstance(chunker, SemanticChunker)

    def test_explicit_language_overrides_path(self):
        chunker = get_code_chunker(source_path="file.txt", language="python")
        assert isinstance(chunker, TreeSitterChunker)
        assert chunker.language == "python"

    def test_no_path_no_language_returns_semantic(self):
        from telaios.core.chunkers.semantic import SemanticChunker
        chunker = get_code_chunker()
        assert isinstance(chunker, SemanticChunker)

    def test_max_lines_propagated(self):
        chunker = get_code_chunker(source_path="app.py", max_lines=42)
        assert isinstance(chunker, TreeSitterChunker)
        assert chunker.max_lines == 42

    def test_chunk_size_propagated(self):
        chunker = get_code_chunker(source_path="app.py", chunk_size=256)
        assert isinstance(chunker, TreeSitterChunker)
        assert chunker.chunk_size == 256
