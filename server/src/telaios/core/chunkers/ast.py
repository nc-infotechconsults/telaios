"""ASTChunker — splits code at function/class boundaries using Python's ast module.

Falls back to SemanticChunker for unsupported languages.
"""

from __future__ import annotations

import ast
import textwrap

from telaios.core.chunkers.base import Chunker, ChunkMetadata
from telaios.core.chunkers.semantic import SemanticChunker

_SUPPORTED_LANGUAGES = {"python"}


class ASTChunker(Chunker):
    """
    Splits source code at top-level symbol boundaries (functions, classes).

    Each function or class definition becomes one chunk, preserving its full
    source text and enriching ChunkMetadata with symbol_name, symbol_type,
    start_line, and end_line.

    For unsupported languages the SemanticChunker is used as a fallback.
    """

    def __init__(
        self,
        chunk_size: int = 512,
        overlap: int = 0,
        language: str = "python",
        max_lines: int = 150,
    ) -> None:
        super().__init__(chunk_size=chunk_size, overlap=overlap)
        self.language = language.lower()
        self.max_lines = max_lines
        self._fallback = SemanticChunker(chunk_size=chunk_size, overlap=overlap)

    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        if self.language not in _SUPPORTED_LANGUAGES:
            return self._fallback.chunk(text)

        try:
            return self._chunk_python(text)
        except SyntaxError:
            return self._fallback.chunk(text)

    def _chunk_python(self, source: str) -> list[tuple[str, ChunkMetadata]]:
        tree = ast.parse(source)
        lines = source.splitlines(keepends=True)
        chunks: list[tuple[str, ChunkMetadata]] = []
        covered_lines: set[int] = set()

        top_level = [
            node for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
            and node.col_offset == 0  # top-level only
        ]

        for idx, node in enumerate(top_level):
            start = node.lineno - 1  # 0-based
            end = node.end_lineno  # exclusive

            if end - start > self.max_lines:
                # Symbol too large: chunk its body with semantic chunker
                body_src = "".join(lines[start:end])
                sub_chunks = self._fallback.chunk(body_src)
                for sub_text, sub_meta in sub_chunks:
                    sub_meta.symbol_name = node.name
                    sub_meta.symbol_type = self._node_type(node)
                    sub_meta.start_line = start + 1 + (sub_meta.start_char // max(len(body_src) // max(len(sub_chunks), 1), 1))
                    sub_meta.end_line = end
                    sub_meta.language = self.language
                    sub_meta.index = idx
                    chunks.append((sub_text, sub_meta))
            else:
                segment = "".join(lines[start:end])
                segment = textwrap.dedent(segment).strip()
                char_start = sum(len(l) for l in lines[:start])
                char_end = char_start + len(segment)
                meta = ChunkMetadata(
                    index=idx,
                    start_char=char_start,
                    end_char=char_end,
                    symbol_name=node.name,
                    symbol_type=self._node_type(node),
                    start_line=start + 1,
                    end_line=end,
                    language=self.language,
                )
                chunks.append((segment, meta))

            covered_lines.update(range(start, end))

        # Emit module-level code not covered by any top-level symbol
        module_lines = [
            (i, line) for i, line in enumerate(lines) if i not in covered_lines and line.strip()
        ]
        if module_lines:
            module_src = "".join(l for _, l in module_lines).strip()
            if module_src:
                char_start = sum(len(l) for l in lines[: module_lines[0][0]])
                meta = ChunkMetadata(
                    index=len(chunks),
                    start_char=char_start,
                    end_char=char_start + len(module_src),
                    symbol_name=None,
                    symbol_type="module",
                    start_line=module_lines[0][0] + 1,
                    end_line=module_lines[-1][0] + 1,
                    language=self.language,
                )
                chunks.append((module_src, meta))

        return chunks

    @staticmethod
    def _node_type(node: ast.AST) -> str:
        if isinstance(node, ast.ClassDef):
            return "class"
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return "function"
        return "module"


__all__ = ["ASTChunker"]
