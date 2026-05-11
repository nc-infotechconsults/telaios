"""tests/tools/documents/test_extraction.py — Tests for document extraction."""

from __future__ import annotations

import pytest

from telaios.tools.builtin.documents.extraction import extract_text


class TestExtractText:
    """Tests for extract_text."""

    @pytest.mark.asyncio
    async def test_plain_text(self):
        content = b"Hello world, this is plain text."
        result = await extract_text(content, "text/plain")
        assert result == "Hello world, this is plain text."

    @pytest.mark.asyncio
    async def test_markdown_ext(self):
        content = b"# Title\n\nParagraph content."
        result = await extract_text(content, "application/octet-stream", file_type="md")
        assert "Title" in result
        assert "Paragraph content" in result

    @pytest.mark.asyncio
    async def test_json_mime(self):
        content = b'{"key": "value"}'
        result = await extract_text(content, "application/json")
        assert '"key"' in result

    @pytest.mark.asyncio
    async def test_csv_ext(self):
        content = b"a,b,c\n1,2,3"
        result = await extract_text(content, "application/octet-stream", file_type="csv")
        assert "a,b,c" in result

    @pytest.mark.asyncio
    async def test_html_extraction(self):
        """HTML extraction should strip scripts and styles."""
        pytest.importorskip("bs4")
        content = b"<html><body><script>var x=1;</script><p>Hello</p></body></html>"
        result = await extract_text(content, "text/html")
        assert "var x" not in result
        assert "Hello" in result

    @pytest.mark.asyncio
    async def test_html_ext_fallback(self):
        pytest.importorskip("bs4")
        content = b"<html><body><p>Test</p></body></html>"
        result = await extract_text(content, "application/octet-stream", file_type="html")
        assert "Test" in result

    @pytest.mark.asyncio
    async def test_docx_extraction(self):
        """DOCX extraction requires python-docx."""
        pytest.importorskip("docx")
        # Create a minimal DOCX in memory
        import io

        from docx import Document

        doc = Document()
        doc.add_paragraph("Hello from DOCX")
        buf = io.BytesIO()
        doc.save(buf)
        content = buf.getvalue()

        result = await extract_text(
            content, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        assert "Hello from DOCX" in result

    @pytest.mark.asyncio
    async def test_unsupported_returns_empty(self):
        result = await extract_text(b"data", "application/unknown-format")
        assert result == ""

    @pytest.mark.asyncio
    async def test_octet_stream_with_text_ext(self):
        content = b"console.log('hello');"
        result = await extract_text(content, "application/octet-stream", file_type="js")
        assert "console.log" in result

    @pytest.mark.asyncio
    async def test_octet_stream_unknown_ext_returns_empty(self):
        result = await extract_text(b"data", "application/octet-stream", file_type="xyz")
        assert result == ""
