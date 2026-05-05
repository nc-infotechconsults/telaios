"""Document structure analysis helpers."""

from __future__ import annotations

import logging
import re
from collections import Counter
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class HeadingInfo(BaseModel):
    level: int = Field(..., description="Heading level (1-6)")
    text: str = Field(..., description="Heading text")
    position: int = Field(..., description="Character position in document")


class TableInfo(BaseModel):
    rows: list[list[str]] = Field(default_factory=list, description="Table rows")
    page: int | None = Field(default=None, description="Page number (PDF/DOCX)")
    position: int | None = Field(default=None, description="Position in document")


class SectionInfo(BaseModel):
    title: str = Field(..., description="Section title (from heading)")
    level: int = Field(..., description="Heading level")
    start: int = Field(..., description="Start position")
    end: int | None = Field(default=None, description="End position")
    content: str = Field(default="", description="Section content")


class DocumentAnalysis(BaseModel):
    title: str | None = Field(default=None, description="Document title")
    author: str | None = Field(default=None, description="Document author")
    language: str | None = Field(default=None, description="Detected language")
    word_count: int = Field(default=0, description="Total word count")
    page_count: int | None = Field(default=None, description="Number of pages")
    headings: list[HeadingInfo] = Field(default_factory=list)
    tables: list[TableInfo] = Field(default_factory=list)
    sections: list[SectionInfo] = Field(default_factory=list)
    key_terms: list[str] = Field(default_factory=list)


def analyze_text(text: str) -> DocumentAnalysis:
    analysis = DocumentAnalysis(word_count=len(text.split()))

    heading_pattern = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
    for match in heading_pattern.finditer(text):
        analysis.headings.append(
            HeadingInfo(
                level=len(match.group(1)),
                text=match.group(2).strip(),
                position=match.start(),
            )
        )

    for index, heading in enumerate(analysis.headings):
        end = (
            analysis.headings[index + 1].position
            if index + 1 < len(analysis.headings)
            else len(text)
        )
        analysis.sections.append(
            SectionInfo(
                title=heading.text,
                level=heading.level,
                start=heading.position,
                end=end,
                content=text[heading.position:end].strip(),
            )
        )

    words = re.findall(r"\b[A-Z][a-z]{3,}\b", text)
    analysis.key_terms = [word for word, _ in Counter(words).most_common(10)]
    return analysis


def analyze_pdf(text: str, metadata: dict[str, Any] | None = None) -> DocumentAnalysis:
    analysis = analyze_text(text)
    if metadata:
        analysis.title = metadata.get("title")
        analysis.author = metadata.get("author")
        if "page_count" in metadata:
            analysis.page_count = metadata["page_count"]
    pages = text.split("\f")
    if len(pages) > 1:
        analysis.page_count = len(pages)
    return analysis


def analyze_docx(text: str, metadata: dict[str, Any] | None = None) -> DocumentAnalysis:
    analysis = analyze_text(text)
    if metadata:
        analysis.title = metadata.get("title")
        analysis.author = metadata.get("author")
    return analysis


def analyze_markdown(text: str) -> DocumentAnalysis:
    analysis = analyze_text(text)
    try:
        import yaml

        frontmatter_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
        if frontmatter_match:
            frontmatter = yaml.safe_load(frontmatter_match.group(1))
            if isinstance(frontmatter, dict):
                analysis.title = frontmatter.get("title", analysis.title)
                analysis.author = frontmatter.get("author", analysis.author)
    except ImportError:
        pass
    except Exception as exc:
        logger.warning("Failed to parse frontmatter: %s", exc)
    return analysis


def get_document_summary(analysis: DocumentAnalysis, max_length: int = 500) -> str:
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
        for heading in analysis.headings[:10]:
            indent = "  " * (heading.level - 1)
            parts.append(f"{indent}- {heading.text}")
    if analysis.key_terms:
        parts.append(f"\n## Key Terms\n{', '.join(analysis.key_terms[:10])}")

    summary = "\n".join(parts)
    return summary[:max_length] if len(summary) > max_length else summary
