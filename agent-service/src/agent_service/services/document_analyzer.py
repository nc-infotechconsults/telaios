"""
src/agent_service/services/document_analyzer.py
-----------------------------------------------
Analyze document structure to extract metadata, headings, tables, and sections.

Supports PDF, DOCX, HTML, and Markdown documents.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class HeadingInfo(BaseModel):
    """A single heading in the document."""

    level: int = Field(..., description="Heading level (1-6)")
    text: str = Field(..., description="Heading text")
    position: int = Field(..., description="Character position in document")


class TableInfo(BaseModel):
    """A table extracted from the document."""

    rows: list[list[str]] = Field(default_factory=list, description="Table rows")
    page: int | None = Field(default=None, description="Page number (PDF/DOCX)")
    position: int | None = Field(default=None, description="Position in document")


class SectionInfo(BaseModel):
    """A document section bounded by headings."""

    title: str = Field(..., description="Section title (from heading)")
    level: int = Field(..., description="Heading level")
    start: int = Field(..., description="Start position")
    end: int | None = Field(default=None, description="End position (next heading or EOF)")
    content: str = Field(default="", description="Section content")


class DocumentAnalysis(BaseModel):
    """Complete analysis of a document's structure."""

    title: str | None = Field(default=None, description="Document title")
    author: str | None = Field(default=None, description="Document author")
    language: str | None = Field(default=None, description="Detected language")
    word_count: int = Field(default=0, description="Total word count")
    page_count: int | None = Field(default=None, description="Number of pages")
    headings: list[HeadingInfo] = Field(default_factory=list)
    tables: list[TableInfo] = Field(default_factory=list)
    sections: list[SectionInfo] = Field(default_factory=list)
    key_terms: list[str] = Field(default_factory=list, description="Frequent significant terms")


def analyze_text(text: str) -> DocumentAnalysis:
    """
    Analyze plain text document structure.

    Extracts headings (Markdown-style), sections, word count, and key terms.
    """
    analysis = DocumentAnalysis()
    analysis.word_count = len(text.split())

    # Detect headings (Markdown-style #, ##, etc.)
    heading_pattern = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
    for match in heading_pattern.finditer(text):
        level = len(match.group(1))
        heading_text = match.group(2).strip()
        analysis.headings.append(
            HeadingInfo(level=level, text=heading_text, position=match.start())
        )

    # Build sections from headings
    if analysis.headings:
        for i, heading in enumerate(analysis.headings):
            start = heading.position
            end = (
                analysis.headings[i + 1].position
                if i + 1 < len(analysis.headings)
                else len(text)
            )
            content = text[start:end].strip()
            analysis.sections.append(
                SectionInfo(
                    title=heading.text,
                    level=heading.level,
                    start=start,
                    end=end,
                    content=content,
                )
            )

    # Extract key terms (simple frequency-based)
    words = re.findall(r"\b[A-Z][a-z]{3,}\b", text)
    from collections import Counter

    word_counts = Counter(words)
    analysis.key_terms = [word for word, _ in word_counts.most_common(10)]

    return analysis


def analyze_pdf(text: str, metadata: dict[str, Any] | None = None) -> DocumentAnalysis:
    """
    Analyze PDF document structure.

    Uses text extracted from PyMuPDF with page markers.
    """
    analysis = analyze_text(text)

    # Extract page count from metadata if available
    if metadata:
        analysis.title = metadata.get("title")
        analysis.author = metadata.get("author")
        if "page_count" in metadata:
            analysis.page_count = metadata["page_count"]

    # Detect page markers (e.g., "\f" form feed or custom markers)
    pages = text.split("\f")
    if len(pages) > 1:
        analysis.page_count = len(pages)

    return analysis


def analyze_docx(text: str, metadata: dict[str, Any] | None = None) -> DocumentAnalysis:
    """Analyze DOCX document structure."""
    analysis = analyze_text(text)

    if metadata:
        analysis.title = metadata.get("title")
        analysis.author = metadata.get("author")

    return analysis


def analyze_markdown(text: str) -> DocumentAnalysis:
    """
    Analyze Markdown document with frontmatter support.

    Extracts YAML frontmatter metadata, heading hierarchy, and sections.
    """
    analysis = analyze_text(text)

    # Try to parse YAML frontmatter
    try:
        import yaml

        frontmatter_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
        if frontmatter_match:
            frontmatter_text = frontmatter_match.group(1)
            frontmatter = yaml.safe_load(frontmatter_text)

            if isinstance(frontmatter, dict):
                analysis.title = frontmatter.get("title", analysis.title)
                analysis.author = frontmatter.get("author", analysis.author)
    except ImportError:
        pass
    except Exception as exc:
        logger.warning("Failed to parse frontmatter: %s", exc)

    return analysis


def get_document_summary(analysis: DocumentAnalysis, max_length: int = 500) -> str:
    """
    Generate a human-readable summary from document analysis.

    Args:
        analysis: DocumentAnalysis result.
        max_length: Maximum length of the summary.

    Returns:
        Summary string.
    """
    parts: list[str] = []

    if analysis.title:
        parts.append(f"# {analysis.title}")
    if analysis.author:
        parts.append(f"Author: {analysis.author}")

    stats = []
    if analysis.word_count:
        stats.append(f"{analysis.word_count} words")
    if analysis.page_count:
        stats.append(f"{analysis.page_count} pages")
    if analysis.headings:
        stats.append(f"{len(analysis.headings)} headings")
    if analysis.tables:
        stats.append(f"{len(analysis.tables)} tables")

    if stats:
        parts.append(f"Stats: {', '.join(stats)}")

    if analysis.headings:
        parts.append("\n## Structure")
        for heading in analysis.headings[:10]:  # Limit to first 10
            indent = "  " * (heading.level - 1)
            parts.append(f"{indent}- {heading.text}")

    if analysis.key_terms:
        parts.append(f"\n## Key Terms\n{', '.join(analysis.key_terms[:10])}")

    summary = "\n".join(parts)
    return summary[:max_length] if len(summary) > max_length else summary