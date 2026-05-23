"""TreeSitterChunker — multi-language code chunker using tree-sitter CST."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import ClassVar

from telaios.core.chunkers.base import Chunker, ChunkMetadata

logger = logging.getLogger(__name__)

# File extension → tree-sitter language name
EXTENSION_TO_LANGUAGE: dict[str, str] = {
    ".py": "python",
    ".java": "java",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "javascript",
}

# CST node types that represent top-level extractable symbols per language
_SYMBOL_NODES: dict[str, frozenset[str]] = {
    "python": frozenset({
        "function_definition",
        "class_definition",
        "decorated_definition",
    }),
    "java": frozenset({
        "class_declaration",
        "interface_declaration",
        "enum_declaration",
        "method_declaration",
        "constructor_declaration",
    }),
    "typescript": frozenset({
        "function_declaration",
        "class_declaration",
        "interface_declaration",
        "type_alias_declaration",
        "enum_declaration",
        "abstract_class_declaration",
        "export_statement",
        "lexical_declaration",
    }),
    "tsx": frozenset({
        "function_declaration",
        "class_declaration",
        "interface_declaration",
        "type_alias_declaration",
        "enum_declaration",
        "abstract_class_declaration",
        "export_statement",
        "lexical_declaration",
    }),
    "javascript": frozenset({
        "function_declaration",
        "class_declaration",
        "export_statement",
        "lexical_declaration",
    }),
}

# Node types that wrap another declaration and should be unwrapped
_WRAPPER_NODES = frozenset({"export_statement"})

# Node types that may contain arrow functions assigned to const
_DECL_NODES = frozenset({"lexical_declaration", "variable_declaration"})


def _load_parser(language: str):
    """Lazy-load tree-sitter parser for *language*. Raises ImportError if not installed."""
    try:
        from tree_sitter import Language, Parser
    except ImportError as exc:
        raise ImportError(
            "tree-sitter not installed — run: uv add 'telaios-server[treesitter]'"
        ) from exc

    match language:
        case "python":
            import tree_sitter_python as _m
            lang = Language(_m.language())
        case "java":
            import tree_sitter_java as _m
            lang = Language(_m.language())
        case "typescript":
            try:
                import tree_sitter_typescript as _m
                lang = Language(_m.language_typescript())
            except ImportError as exc:
                raise ImportError("tree-sitter-typescript not installed") from exc
        case "tsx":
            try:
                import tree_sitter_typescript as _m
                lang = Language(_m.language_tsx())
            except ImportError as exc:
                raise ImportError("tree-sitter-typescript not installed") from exc
        case "javascript":
            import tree_sitter_javascript as _m
            lang = Language(_m.language())
        case _:
            raise ValueError(f"Unsupported language: {language!r}")

    return Parser(lang)


class TreeSitterChunker(Chunker):
    """
    Splits source code at function/class/interface boundaries via tree-sitter CST.

    Supports: Python, Java, TypeScript, TSX, JavaScript (JSX treated as JS).
    Falls back to line-count splitting when tree-sitter extraction yields nothing
    or when the grammar package is unavailable.
    """

    LANGUAGE_MAP: ClassVar[dict[str, str]] = EXTENSION_TO_LANGUAGE

    _parser_cache: ClassVar[dict[str, object]] = {}

    def __init__(
        self,
        language: str = "python",
        max_lines: int = 100,
        chunk_size: int = 512,
        overlap: int = 64,
    ) -> None:
        super().__init__(chunk_size=chunk_size, overlap=overlap)
        self.language = language.lower()
        self.max_lines = max_lines

    @classmethod
    def detect_language(cls, source_path: str | Path) -> str | None:
        return cls.LANGUAGE_MAP.get(Path(source_path).suffix.lower())

    @classmethod
    def _parser(cls, language: str):
        if language not in cls._parser_cache:
            cls._parser_cache[language] = _load_parser(language)
        return cls._parser_cache[language]

    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        try:
            return self._cst_chunk(text)
        except Exception as exc:
            logger.warning("TreeSitterChunker[%s] failed: %s — line fallback", self.language, exc)
            return self._line_chunk(text)

    # ── CST extraction ────────────────────────────────────────────────────────

    def _cst_chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        parser = self._parser(self.language)
        src = text.encode("utf-8", errors="replace")
        root = parser.parse(src).root_node

        symbol_types = _SYMBOL_NODES.get(self.language, frozenset())
        chunks: list[tuple[str, ChunkMetadata]] = []

        def _bytes(node) -> str:
            return src[node.start_byte:node.end_byte].decode("utf-8", errors="replace")

        def _name(node) -> str | None:
            for child in node.children:
                if child.type in ("identifier", "type_identifier"):
                    return _bytes(child)
                # const/let/var declarations: name lives in variable_declarator
                if child.type == "variable_declarator":
                    for grandchild in child.children:
                        if grandchild.type in ("identifier", "type_identifier"):
                            return _bytes(grandchild)
            return None

        def _sym_type(ntype: str) -> str:
            if "function" in ntype or ntype in ("method_declaration", "constructor_declaration"):
                return "function"
            if "class" in ntype or "interface" in ntype:
                return "class"
            if ntype in ("type_alias_declaration", "enum_declaration", "enum"):
                return "type"
            if ntype in ("lexical_declaration", "variable_declaration"):
                return "variable"
            return "symbol"

        def _is_arrow_fn(node) -> bool:
            """True when lexical_declaration wraps a const arrow-function assignment."""
            for child in node.children:
                if child.type in ("variable_declarator",):
                    for grandchild in child.children:
                        if grandchild.type in ("arrow_function", "function"):
                            return True
            return False

        def _walk(node) -> None:
            if node.type in symbol_types:
                if node.type in _WRAPPER_NODES:
                    # Unwrap export_statement: extract the inner declaration
                    for child in node.children:
                        if child.type in symbol_types or child.type in (
                            "function_declaration",
                            "class_declaration",
                            "interface_declaration",
                            "type_alias_declaration",
                            "enum_declaration",
                            "abstract_class_declaration",
                            "lexical_declaration",
                        ):
                            _emit(child, wrapper=node)
                            return
                    _emit(node)  # nothing extractable inside — emit wrapper as-is
                elif node.type in _DECL_NODES and not _is_arrow_fn(node):
                    # Skip bare const/let/var that aren't arrow functions
                    for child in node.children:
                        _walk(child)
                else:
                    _emit(node)
                return  # don't recurse into extracted symbols
            for child in node.children:
                _walk(child)

        def _emit(node, wrapper=None) -> None:
            outer = wrapper or node
            content = _bytes(outer)
            start_line = outer.start_point[0]   # 0-indexed
            end_line = outer.end_point[0]       # 0-indexed, inclusive
            # Unwrap decorated_definition to get the inner declaration node
            if node.type == "decorated_definition":
                for child in node.children:
                    if child.type not in ("decorator", "comment"):
                        node = child
                        break
            name = _name(node)
            stype = _sym_type(node.type)
            idx = len(chunks)

            if (end_line - start_line + 1) > self.max_lines:
                chunks.extend(_split_long(content, start_line, name, stype, idx))
            else:
                chunks.append((
                    content,
                    ChunkMetadata(
                        index=idx,
                        start_char=outer.start_byte,
                        end_char=outer.end_byte,
                        symbol_name=name,
                        symbol_type=stype,
                        start_line=start_line + 1,
                        end_line=end_line + 1,
                        language=self.language,
                    ),
                ))

        def _split_long(
            content: str, base_line: int, sym_name: str | None, stype: str, base_idx: int
        ) -> list[tuple[str, ChunkMetadata]]:
            result: list[tuple[str, ChunkMetadata]] = []
            sub_lines = content.splitlines(keepends=True)
            for part_i, offset in enumerate(range(0, len(sub_lines), self.max_lines)):
                part_lines = sub_lines[offset: offset + self.max_lines]
                part = "".join(part_lines)
                result.append((
                    part,
                    ChunkMetadata(
                        index=base_idx + part_i,
                        start_char=0,
                        end_char=len(part),
                        symbol_name=sym_name,
                        symbol_type=stype,
                        start_line=base_line + offset + 1,
                        end_line=base_line + offset + len(part_lines),
                        language=self.language,
                    ),
                ))
            return result

        _walk(root)

        if not chunks:
            return self._line_chunk(text)

        for i, (_, meta) in enumerate(chunks):
            meta.index = i

        return chunks

    # ── Fallback ──────────────────────────────────────────────────────────────

    def _line_chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        lines = text.splitlines(keepends=True)
        if not lines:
            return [(text, ChunkMetadata(index=0, start_char=0, end_char=len(text), language=self.language))]
        result: list[tuple[str, ChunkMetadata]] = []
        for i, offset in enumerate(range(0, len(lines), self.max_lines)):
            part_lines = lines[offset: offset + self.max_lines]
            part = "".join(part_lines)
            result.append((
                part,
                ChunkMetadata(
                    index=i,
                    start_char=0,
                    end_char=len(part),
                    symbol_name=None,
                    symbol_type=None,
                    start_line=offset + 1,
                    end_line=offset + len(part_lines),
                    language=self.language,
                ),
            ))
        return result


__all__ = ["TreeSitterChunker", "EXTENSION_TO_LANGUAGE"]
