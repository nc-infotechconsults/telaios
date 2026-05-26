"""MarkdownDocIngester — parses Markdown into Doc_Section graph nodes."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
_ANNOTATION_RE = re.compile(r"@([A-Za-z][A-Za-z0-9_\-]*)")
_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")


def _slugify(text: str, max_len: int = 100) -> str:
    return _SLUG_STRIP_RE.sub("-", text.lower()).strip("-")[:max_len]


@dataclass
class DocSectionResult:
    section_id: str
    heading: str
    kind: str
    start_line: int
    annotation_targets: list[str] = field(default_factory=list)


class MarkdownDocIngester:
    """Parses a Markdown file into Doc_Section graph nodes.

    Each ATX heading (`#`, `##`, …) becomes one Doc_Section node.
    Inline `@EntityName` annotations create REFERENCES edges to matching
    CodeClass or CodeFunction nodes (silently no-ops if the entity is absent).
    """

    def ingest(
        self,
        content: str,
        source_doc: str,
        project_id: str,
        kind: str,
        graph_store: Any,  # FalkorDBGraphStore
    ) -> list[DocSectionResult]:
        if not content.strip():
            return []

        sections = self._parse_sections(content)
        results: list[DocSectionResult] = []
        seen_ids: dict[str, int] = {}

        for heading, body, start_line in sections:
            base_id = _slugify(heading)
            count = seen_ids.get(base_id, 0)
            section_id = base_id if count == 0 else f"{base_id}-{count}"
            seen_ids[base_id] = count + 1

            # Allow explicit @id override in body
            id_match = re.search(r"@id\s+([A-Za-z][A-Za-z0-9_\-]*)", body)
            if id_match:
                section_id = id_match.group(1)

            try:
                graph_store.upsert_doc_section(
                    section_id=section_id,
                    heading=heading,
                    content_summary=body.strip()[:500],
                    kind=kind,
                    source_doc=source_doc,
                    start_line=start_line,
                    project_id=project_id,
                )
            except Exception:
                logger.warning("upsert_doc_section failed for %r in %r", section_id, source_doc, exc_info=True)
                continue

            annotation_targets: list[str] = []
            for m in _ANNOTATION_RE.finditer(body):
                name = m.group(1)
                if name == "id":
                    continue
                for label in ("CodeClass", "CodeFunction"):
                    graph_store.add_references_edge(
                        section_id=section_id,
                        target_label=label,
                        target_name=name,
                        via="annotation",
                        project_id=project_id,
                    )
                annotation_targets.append(name)

            results.append(DocSectionResult(
                section_id=section_id,
                heading=heading,
                kind=kind,
                start_line=start_line,
                annotation_targets=annotation_targets,
            ))

        return results

    def _parse_sections(self, content: str) -> list[tuple[str, str, int]]:
        """Return (heading, body, start_line_1indexed) tuples."""
        lines = content.splitlines(keepends=True)
        sections: list[tuple[str, str, int]] = []
        current_heading: str | None = None
        current_body: list[str] = []
        current_start = 1

        for i, line in enumerate(lines, start=1):
            m = _HEADING_RE.match(line.rstrip("\n\r"))
            if m:
                if current_heading is not None:
                    sections.append((current_heading, "".join(current_body), current_start))
                current_heading = m.group(2).strip()
                current_body = []
                current_start = i
            elif current_heading is not None:
                current_body.append(line)

        if current_heading is not None:
            sections.append((current_heading, "".join(current_body), current_start))

        return sections


__all__ = ["MarkdownDocIngester", "DocSectionResult", "_slugify"]
