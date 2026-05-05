"""
tools/builtin/documents/conversion.py
--------------------------------------
Document format conversion service.

Supports:
- PDF → Markdown
- DOCX → Markdown
- HTML → Markdown
- Markdown → HTML
- Markdown → PDF

Includes the markdown-import shadowing fix (the library import is aliased as
``md_lib``).
"""

from __future__ import annotations

import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def convert_to_markdown(
    buffer: bytes,
    mime_type: str,
    file_type: Optional[str] = None,
) -> str:
    """
    Convert a document buffer to Markdown format.

    Args:
        buffer: Raw file bytes.
        mime_type: MIME type of the source document.
        file_type: File extension (fallback for generic MIME types).

    Returns:
        Markdown string.
    """
    mime = mime_type.lower()
    ext = (file_type or "").lower()

    if mime == "application/pdf" or ext == "pdf":
        return _pdf_to_markdown(buffer)
    elif mime in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ) or ext in ("docx", "doc"):
        return _docx_to_markdown(buffer)
    elif mime in ("text/html", "application/xhtml+xml") or ext in ("html", "htm"):
        return _html_to_markdown(buffer)
    elif ext in ("md", "markdown"):
        return buffer.decode("utf-8", errors="replace")
    else:
        raise ValueError(f"Unsupported conversion from {mime_type}")


def _pdf_to_markdown(buffer: bytes) -> str:
    """Convert PDF to Markdown with tables and structure."""
    try:
        import fitz

        doc = fitz.open(stream=buffer, filetype="pdf")
        parts: list[str] = []

        for page_num, page in enumerate(doc, start=1):
            parts.append(f"<!-- Page {page_num} -->\n")

            # Extract text
            text = page.get_text("text")
            if text.strip():
                parts.append(text.strip())

            # Extract tables
            try:
                tables = page.find_tables()
                for table in tables:
                    md_table = _table_to_markdown(table)
                    if md_table:
                        parts.append(md_table)
            except Exception:
                pass

        doc.close()
        return "\n\n".join(parts)
    except Exception as exc:
        logger.warning("PDF to Markdown conversion failed: %s", exc)
        return ""


def _docx_to_markdown(buffer: bytes) -> str:
    """Convert DOCX to Markdown preserving structure."""
    try:
        from docx import Document

        doc = Document(io.BytesIO(buffer))
        parts: list[str] = []

        for para in doc.paragraphs:
            style = para.style.name.lower() if para.style else ""
            text = para.text.strip()

            if not text:
                continue

            if "heading 1" in style:
                parts.append(f"# {text}")
            elif "heading 2" in style:
                parts.append(f"## {text}")
            elif "heading 3" in style:
                parts.append(f"### {text}")
            elif "heading 4" in style:
                parts.append(f"#### {text}")
            elif "heading 5" in style:
                parts.append(f"##### {text}")
            elif "heading 6" in style:
                parts.append(f"###### {text}")
            elif "list" in style:
                parts.append(f"- {text}")
            else:
                # Check for bold/italic
                formatted = _format_docx_paragraph(para)
                parts.append(formatted)

        return "\n\n".join(parts)
    except Exception as exc:
        logger.warning("DOCX to Markdown conversion failed: %s", exc)
        return ""


def _format_docx_paragraph(para) -> str:
    """Format a DOCX paragraph preserving inline formatting."""
    parts: list[str] = []
    for run in para.runs:
        text = run.text
        if not text:
            continue
        if run.bold and run.italic:
            parts.append(f"***{text}***")
        elif run.bold:
            parts.append(f"**{text}**")
        elif run.italic:
            parts.append(f"*{text}*")
        else:
            parts.append(text)
    return "".join(parts)


def _html_to_markdown(buffer: bytes) -> str:
    """Convert HTML to Markdown."""
    try:
        from bs4 import BeautifulSoup
        import markdownify

        soup = BeautifulSoup(buffer, "html.parser")
        # Remove scripts and styles
        for tag in soup(["script", "style", "nav", "header", "footer"]):
            tag.decompose()
        return markdownify.markdownify(str(soup), heading_style="ATX")
    except ImportError:
        # Fallback: simple text extraction using stdlib html.parser
        from html.parser import HTMLParser

        class _TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self._parts: list[str] = []
                self._skip = False

            def handle_starttag(self, tag, attrs):
                if tag in ("script", "style"):
                    self._skip = True

            def handle_endtag(self, tag):
                if tag in ("script", "style"):
                    self._skip = False
                if tag in ("p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6"):
                    self._parts.append("\n")

            def handle_data(self, data):
                if not self._skip:
                    self._parts.append(data)

        extractor = _TextExtractor()
        extractor.feed(buffer.decode("utf-8", errors="replace"))
        return "".join(extractor._parts).strip()
    except Exception as exc:
        logger.warning("HTML to Markdown conversion failed: %s", exc)
        return buffer.decode("utf-8", errors="replace")


def _table_to_markdown(table) -> str:
    """Convert a PyMuPDF table to Markdown table."""
    try:
        header = table.header
        rows = table.rows

        if not header or not rows:
            return ""

        # Header row
        md_parts = []
        md_parts.append("| " + " | ".join(str(c) for c in header) + " |")
        md_parts.append("| " + " | ".join("---" for _ in header) + " |")

        # Data rows
        for row in rows:
            md_parts.append("| " + " | ".join(str(c) for c in row) + " |")

        return "\n".join(md_parts)
    except Exception:
        return ""


async def convert_from_markdown(
    markdown: str,
    target_format: str,
) -> bytes:
    """
    Convert Markdown to another format.

    Args:
        markdown: Markdown content.
        target_format: Target format ('html', 'pdf').

    Returns:
        Converted file bytes.
    """
    fmt = target_format.lower()

    if fmt == "html":
        return _markdown_to_html(markdown)
    elif fmt == "pdf":
        return _markdown_to_pdf(markdown)
    else:
        raise ValueError(f"Unsupported conversion to {target_format}")


def _markdown_to_html(markdown: str) -> bytes:
    """Convert Markdown to HTML."""
    try:
        import markdown as md_lib

        html = md_lib.markdown(
            markdown,
            extensions=["tables", "fenced_code", "toc"],
        )
        return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>{html}</body>
</html>""".encode("utf-8")
    except ImportError:
        return _markdown_to_html_fallback(markdown)


def _markdown_to_html_fallback(markdown: str) -> bytes:
    """Minimal Markdown-to-HTML fallback for headings and paragraphs."""
    import html

    parts: list[str] = ["<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body>"]
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            level = min(len(line) - len(line.lstrip("#")), 6)
            text = line[level:].strip()
            parts.append(f"<h{level}>{html.escape(text)}</h{level}>")
        elif line.startswith("- "):
            parts.append(f"<p>{html.escape(line)}</p>")
        else:
            parts.append(f"<p>{html.escape(line)}</p>")
    parts.append("</body></html>")
    return "".join(parts).encode("utf-8")


def _markdown_to_pdf(markdown: str) -> bytes:
    """Convert Markdown to PDF."""
    try:
        from weasyprint import HTML

        # First convert to HTML
        import markdown as md_lib

        html_body = md_lib.markdown(
            markdown,
            extensions=["tables", "fenced_code"],
        )
        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>{html_body}</body>
</html>"""
        pdf = HTML(string=html).write_pdf()
        return pdf
    except ImportError:
        logger.warning("weasyprint not installed, cannot convert to PDF")
        raise ValueError("PDF conversion requires weasyprint: pip install weasyprint")
    except Exception as exc:
        logger.warning("Markdown to PDF conversion failed: %s", exc)
        raise
