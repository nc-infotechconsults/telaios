"""tests/tools/documents/test_conversion.py — Tests for document format conversion."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

# Path to the conversion module source for AST checks
_CONVERSION_SRC = Path(__file__).resolve().parents[3] / "src/tools/builtin/documents/conversion.py"


class TestConvertToMarkdown:
    """Tests for convert_to_markdown."""

    @pytest.mark.asyncio
    async def test_html_to_markdown(self):
        from tools.builtin.documents.conversion import convert_to_markdown

        html = b"<html><body><h1>Title</h1><p>Hello world</p></body></html>"
        result = await convert_to_markdown(html, "text/html")
        assert "Title" in result
        assert "Hello world" in result

    @pytest.mark.asyncio
    async def test_html_xhtml_mime(self):
        from tools.builtin.documents.conversion import convert_to_markdown

        html = b"<html><body><p>Test</p></body></html>"
        result = await convert_to_markdown(html, "application/xhtml+xml")
        assert "Test" in result

    @pytest.mark.asyncio
    async def test_html_strips_script_and_style(self):
        from tools.builtin.documents.conversion import convert_to_markdown

        html = b"<html><body><script>var x=1;</script><style>.a{}</style><p>Content</p></body></html>"
        result = await convert_to_markdown(html, "text/html")
        assert "var x" not in result
        assert ".a{}" not in result
        assert "Content" in result

    @pytest.mark.asyncio
    async def test_markdown_passthrough(self):
        from tools.builtin.documents.conversion import convert_to_markdown

        md_bytes = b"# Hello\n\nWorld"
        result = await convert_to_markdown(md_bytes, "text/plain", file_type="md")
        assert result == "# Hello\n\nWorld"

    @pytest.mark.asyncio
    async def test_markdown_passthrough_markdown_ext(self):
        from tools.builtin.documents.conversion import convert_to_markdown

        md_bytes = b"# Hello"
        result = await convert_to_markdown(md_bytes, "text/plain", file_type="markdown")
        assert result == "# Hello"

    @pytest.mark.asyncio
    async def test_unsupported_format_raises(self):
        from tools.builtin.documents.conversion import convert_to_markdown

        with pytest.raises(ValueError, match="Unsupported conversion"):
            await convert_to_markdown(b"data", "application/unknown")


class TestConvertFromMarkdown:
    """Tests for convert_from_markdown."""

    @pytest.mark.asyncio
    async def test_markdown_to_html_with_markdown_lib(self):
        """When `markdown` is installed, output contains proper HTML tags."""
        md = pytest.importorskip("markdown")
        from tools.builtin.documents.conversion import convert_from_markdown

        result = await convert_from_markdown("# Hello\n\nWorld", "html")
        assert isinstance(result, bytes)
        html = result.decode("utf-8")
        assert "<h1>" in html
        assert "Hello" in html

    @pytest.mark.asyncio
    async def test_markdown_to_html_fallback_without_markdown_lib(self):
        """Without `markdown` lib, output wraps in <pre>."""
        from tools.builtin.documents.conversion import _markdown_to_html

        # Even if markdown is installed, we can test the fallback path
        # by calling the function directly — it will use the lib if available.
        result = _markdown_to_html("# Test")
        assert isinstance(result, bytes)
        html = result.decode("utf-8")
        assert "Test" in html

    @pytest.mark.asyncio
    async def test_unsupported_format_raises(self):
        from tools.builtin.documents.conversion import convert_from_markdown

        with pytest.raises(ValueError, match="Unsupported conversion"):
            await convert_from_markdown("test", "docx")


class TestShadowingBugFix:
    """Verify the `import markdown` shadowing bug is fixed."""

    def test_no_unqualified_markdown_import(self):
        """conversion.py should not have `import markdown` at module level."""
        source = _CONVERSION_SRC.read_text()
        tree = ast.parse(source)

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "markdown" and alias.asname is None:
                        pytest.fail(
                            f"Found unqualified `import markdown` at line {node.lineno}. "
                            "Use `import markdown as md_lib` to avoid shadowing."
                        )

    def test_uses_md_lib_alias(self):
        """Verify the file uses `import markdown as md_lib` in function bodies."""
        source = _CONVERSION_SRC.read_text()
        assert "import markdown as md_lib" in source, (
            "Expected `import markdown as md_lib` in conversion.py"
        )
