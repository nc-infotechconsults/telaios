"""
core/knowledge_source.py — Pluggable knowledge source abstraction.

Defines ``KnowledgeSource`` ABC and concrete implementations for loading
text from files, URLs, GitHub repos, raw input, and document formats
(PDF, DOCX, PPTX via Docling).

Sources:
  - Chroma ``collection.add()`` API:
    https://docs.trychroma.com/docs/collections/add-data
  - httpx (async HTTP client):
    https://www.python-httpx.org/async/
  - GitHub REST API (raw content):
    https://docs.github.com/en/rest/repos/contents#get-repository-content
  - Docling document converter:
    https://docling-project.github.io/docling/getting_started/quickstart/
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, ClassVar

# ── Document shape ───────────────────────────────────────────────────────────


class SourceDocument:
    """A single document extracted from a knowledge source."""

    def __init__(
        self,
        content: str,
        *,
        doc_id: str | None = None,
        title: str = "",
        source_type: str = "unknown",
        source_path: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.id = doc_id or str(uuid.uuid4())
        self.content = content
        self.title = title
        self.source_type = source_type
        self.source_path = source_path
        self.metadata = metadata or {}

    def to_chroma(self) -> tuple[str, str, dict[str, Any]]:
        """Return (id, document, metadata) for Chroma ``collection.add()``.

        Source: https://docs.trychroma.com/docs/collections/add-data
        """
        meta = {
            **self.metadata,
            "title": self.title,
            "source_type": self.source_type,
            "source_path": self.source_path,
        }
        return self.id, self.content, meta


# ── Knowledge source ABC ─────────────────────────────────────────────────────


class KnowledgeSource(ABC):
    """Abstract base for any knowledge source (file, URL, repo, text).

    Subclasses implement ``extract()`` which returns a list of
    ``SourceDocument`` objects ready for Chroma ingestion.
    """

    def __init__(self, label: str = "") -> None:
        self.label = label

    @abstractmethod
    async def extract(self) -> list[SourceDocument]:
        """Extract documents from the source."""
        ...

    @property
    def description(self) -> str:
        return self.label or self.__class__.__name__

    def corpus_stats(self, docs: list[SourceDocument]) -> dict[str, Any]:
        """Compute corpus-level statistics for strategy selection."""
        if not docs:
            return {"document_count": 0, "total_chars": 0, "types": []}

        total_chars = sum(len(d.content) for d in docs)
        avg_doc_len = total_chars / len(docs)
        types = list({d.source_type for d in docs})

        # Detect code-heavy content
        code_lines = sum(
            1 for d in docs for line in d.content.splitlines() if _looks_like_code(line)
        )
        total_lines = sum(len(d.content.splitlines()) for d in docs)
        code_ratio = code_lines / max(total_lines, 1)

        return {
            "document_count": len(docs),
            "total_chars": total_chars,
            "avg_doc_length": avg_doc_len,
            "source_types": types,
            "code_ratio": code_ratio,
        }


def _looks_like_code(line: str) -> bool:
    """Heuristic: does this line look like source code?"""
    stripped = line.strip()
    if not stripped:
        return False
    code_indicators = [
        "def ",
        "class ",
        "import ",
        "from ",
        "return ",
        "if ",
        "for ",
        "while ",
        "try:",
        "except",
        "async def",
        "const ",
        "let ",
        "var ",
        "function ",
        "=>",
        "export ",
        "require(",
    ]
    return any(stripped.startswith(ci) for ci in code_indicators)


# ── Text / raw input source ──────────────────────────────────────────────────


class TextSource(KnowledgeSource):
    """Knowledge from raw text or code pasted by the user."""

    def __init__(self, text: str, *, title: str = "user-input", label: str = "Pasted text") -> None:
        super().__init__(label)
        self.text = text
        self.title = title

    async def extract(self) -> list[SourceDocument]:
        source_type = "code" if _is_code_content(self.text) else "text"
        return [
            SourceDocument(
                content=self.text,
                title=self.title,
                source_type=source_type,
                source_path=f"text://{self.title}",
                metadata={"character_count": len(self.text)},
            )
        ]


# ── File source ──────────────────────────────────────────────────────────────


class FileSource(KnowledgeSource):
    """Knowledge from local files (.md, .py, .txt, .json, .yaml, …).

    Supports both single files and glob patterns (multiple files).
    """

    def __init__(self, *paths: str | Path, label: str = "") -> None:
        label = label or f"Files: {len(paths)} path(s)"
        super().__init__(label)
        self._paths = [Path(p) for p in paths]

    async def extract(self) -> list[SourceDocument]:
        docs: list[SourceDocument] = []
        for path in self._paths:
            if path.is_dir():
                for f in sorted(path.rglob("*")):
                    if f.is_file() and _is_text_file(f):
                        docs.append(_read_file_doc(f))
            elif path.is_file():
                docs.append(_read_file_doc(path))
        return docs


def _is_text_file(path: Path) -> bool:
    """Check whether a file is a readable text file."""
    text_extensions = {
        ".py",
        ".md",
        ".txt",
        ".json",
        ".yaml",
        ".yml",
        ".toml",
        ".cfg",
        ".ini",
        ".env",
        ".sh",
        ".bash",
        ".zsh",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".css",
        ".html",
        ".htm",
        ".xml",
        ".svg",
        ".csv",
        ".sql",
        ".rst",
        ".tex",
        ".conf",
        ".Makefile",
        ".dockerfile",
    }
    return path.suffix.lower() in text_extensions or path.name.lower() in {
        "makefile",
        "dockerfile",
        "jenkinsfile",
        "vagrantfile",
    }


def _is_code_content(text: str) -> bool:
    """Heuristic: is the text primarily source code?"""
    lines = text.splitlines()
    if not lines:
        return False
    code_line_count = sum(1 for line in lines if _looks_like_code(line))
    return code_line_count / max(len(lines), 1) > 0.3


def _read_file_doc(path: Path) -> SourceDocument:
    """Read a file and return a SourceDocument."""
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = f"[binary file: {path.name}]"

    source_type = (_is_code_content(content) and "code") or "text"
    return SourceDocument(
        content=content,
        title=path.name,
        source_type=source_type,
        source_path=str(path),
        metadata={
            "file_name": path.name,
            "file_suffix": path.suffix,
            "character_count": len(content),
        },
    )


# ── URL source ───────────────────────────────────────────────────────────────


class URLSource(KnowledgeSource):
    """Knowledge from a web URL — fetches and extracts text content.

    Uses ``httpx`` for async HTTP fetching.
    Source: https://www.python-httpx.org/async/
    """

    def __init__(self, url: str, *, label: str = "") -> None:
        label = label or f"URL: {url[:60]}"
        super().__init__(label)
        self._url = url

    async def extract(self) -> list[SourceDocument]:

        import httpx

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(self._url, headers={"User-Agent": "TelaiOS/1.0"})
            resp.raise_for_status()

        text = resp.text
        # Strip HTML tags if content looks like HTML
        if text.strip().startswith("<!") or "<html" in text[:200].lower():
            text = _strip_html(text)

        title = self._url.split("/")[-1] or "web-page"
        return [
            SourceDocument(
                content=text,
                title=title,
                source_type="web",
                source_path=self._url,
                metadata={
                    "url": self._url,
                    "content_type": resp.headers.get("content-type", ""),
                    "character_count": len(text),
                },
            )
        ]


def _strip_html(html: str) -> str:
    """Basic HTML tag stripping (no external deps)."""
    import re

    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ── GitHub source ────────────────────────────────────────────────────────────


class GitHubSource(KnowledgeSource):
    """Knowledge from a GitHub repository — fetches file content via API.

    Source: https://docs.github.com/en/rest/repos/contents#get-repository-content
    """

    def __init__(
        self,
        repo_url: str,
        *,
        branch: str = "main",
        subpath: str = "",
        token: str | None = None,
        label: str = "",
    ) -> None:
        label = label or f"GitHub: {repo_url}"
        super().__init__(label)
        self._repo_url = repo_url.rstrip("/")
        self._branch = branch
        self._subpath = subpath
        self._token = token

        # Parse owner/repo from URL
        parts = self._repo_url.split("github.com/")[-1].split("/")
        self._owner = parts[0]
        self._repo = parts[1].removesuffix(".git") if len(parts) > 1 else ""

    async def extract(self) -> list[SourceDocument]:
        import base64

        import httpx

        headers: dict[str, str] = {"Accept": "application/vnd.github.v3+json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"

        api_url = (
            f"https://api.github.com/repos/{self._owner}/{self._repo}/contents/"
            f"{self._subpath}?ref={self._branch}"
        )

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(api_url, headers=headers)
            resp.raise_for_status()
            items = resp.json()

        if not isinstance(items, list):
            items = [items]

        docs: list[SourceDocument] = []
        for item in items:
            if item.get("type") != "file":
                continue
            name = item.get("name", "")
            if not _is_text_file(Path(name)):
                continue

            try:
                content = base64.b64decode(item.get("content", "")).decode("utf-8")
            except Exception:
                continue

            source_type = (_is_code_content(content) and "code") or "text"
            docs.append(
                SourceDocument(
                    content=content,
                    title=name,
                    source_type=source_type,
                    source_path=item.get("path", name),
                    metadata={
                        "repo": f"{self._owner}/{self._repo}",
                        "branch": self._branch,
                        "github_path": item.get("path", ""),
                        "file_size": item.get("size", 0),
                    },
                )
            )

        return docs


# ── Document format source (PDF, DOCX, PPTX via Docling) ────────────────────


class DoclingSource(KnowledgeSource):
    """Knowledge from document formats (PDF, DOCX, PPTX, XLSX) via Docling.

    Uses Docling's ``DocumentConverter`` to parse and export to Markdown
    text.  Supports local files and URLs (ArXiv, etc.).

    Source:
      https://docling-project.github.io/docling/getting_started/quickstart/
    """

    _SUPPORTED_EXTS: ClassVar[set[str]] = {
        ".pdf",
        ".docx",
        ".pptx",
        ".xlsx",
        ".html",
        ".htm",
        ".xml",
    }

    def __init__(
        self,
        *paths: str,
        export_format: str = "markdown",
        label: str = "",
    ) -> None:
        label = label or f"Docling: {', '.join(str(p)[:40] for p in paths)}"
        super().__init__(label)
        self._paths = [Path(p) for p in paths]
        self._export_format = export_format

    async def extract(self) -> list[SourceDocument]:
        import logging

        import docling.document_converter

        logger = logging.getLogger(__name__)
        docs: list[SourceDocument] = []

        for path in self._paths:
            if not path.exists():
                logger.warning("DoclingSource: file not found: %s", path)
                continue

            ext = path.suffix.lower()
            if ext not in self._SUPPORTED_EXTS:
                logger.warning(
                    "DoclingSource: unsupported extension %s for %s — skipping",
                    ext,
                    path.name,
                )
                continue

            try:
                converter = docling.document_converter.DocumentConverter()
                result = converter.convert(str(path))
                doc = result.document

                if self._export_format == "markdown":
                    content = doc.export_to_markdown() or ""
                elif self._export_format == "html":
                    content = doc.export_to_html() or ""
                else:
                    content = doc.export_to_markdown() or ""

                source_type = "document"
                docs.append(
                    SourceDocument(
                        content=content,
                        title=path.name,
                        source_type=source_type,
                        source_path=str(path),
                        metadata={
                            "file_name": path.name,
                            "file_suffix": ext,
                            "export_format": self._export_format,
                            "character_count": len(content),
                        },
                    )
                )
            except Exception as exc:
                logger.error("DoclingSource: failed to convert %s: %s", path.name, exc)

        return docs
