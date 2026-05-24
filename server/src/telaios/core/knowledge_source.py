"""
core/knowledge_source.py — Pluggable knowledge source abstraction.

Defines ``KnowledgeSource`` ABC and concrete implementations for loading
text from files, URLs, git repositories, raw input, and document formats
(PDF, DOCX, PPTX via Docling).

Sources:
  - httpx (async HTTP client):        https://www.python-httpx.org/async/
  - GitHub Trees API (recursive):     https://docs.github.com/en/rest/git/trees
  - raw.githubusercontent.com CDN:   for file content fetch
  - Docling document converter:       https://docling-project.github.io/docling/
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import stat
import tempfile
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, ClassVar

logger = logging.getLogger(__name__)

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

    def to_dict(self) -> tuple[str, str, dict[str, Any]]:
        """Return (id, content, metadata) for vector store ingestion."""
        meta = {
            **self.metadata,
            "title": self.title,
            "source_type": self.source_type,
            "source_path": self.source_path,
        }
        return self.id, self.content, meta

    def to_chroma(self) -> tuple[str, str, dict[str, Any]]:
        """Backwards-compatible alias for to_dict."""
        return self.to_dict()


# ── Knowledge source ABC ─────────────────────────────────────────────────────


class KnowledgeSource(ABC):
    """Abstract base for any knowledge source (file, URL, repo, text).

    Subclasses implement ``extract()`` which returns a list of
    ``SourceDocument`` objects ready for vector store ingestion.
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


_BINARY_EXTENSIONS: frozenset[str] = frozenset({
    # Compiled / packaged
    ".class", ".jar", ".war", ".ear", ".aar",
    ".zip", ".tar", ".gz", ".bz2", ".xz", ".rar", ".7z", ".tgz",
    ".exe", ".dll", ".so", ".dylib", ".o", ".a", ".lib", ".wasm",
    # Images
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".tiff", ".tif", ".webp",
    ".psd", ".ai", ".sketch",
    # Media
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv", ".flac", ".ogg", ".webm",
    # Documents (handled separately by DoclingSource)
    ".pdf", ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt", ".odt",
    # Compiled Python
    ".pyc", ".pyo", ".pyd",
    # Source maps / minified markers
    ".map",
    # Large binary data
    ".parquet", ".avro", ".arrow", ".bin", ".dat", ".db", ".sqlite",
    # Font
    ".ttf", ".otf", ".woff", ".woff2", ".eot",
})

_EXCLUDED_DIRS: frozenset[str] = frozenset({
    "node_modules", ".git", "dist", "build", "target", ".venv", "venv",
    "__pycache__", ".mypy_cache", ".ruff_cache", ".pytest_cache",
    ".idea", ".vscode", "vendor", "bower_components", ".gradle",
    "out", "generated", ".next", ".nuxt",
})

_EXCLUDED_FILENAMES: frozenset[str] = frozenset({
    "package-lock.json", "yarn.lock", "Pipfile.lock", "poetry.lock",
    "uv.lock", "Cargo.lock", "composer.lock", "Gemfile.lock",
    "pnpm-lock.yaml", ".DS_Store", "Thumbs.db",
})


def _is_text_file(path: Path) -> bool:
    """Accept file unless it is binary, excluded by directory, or a known lockfile.

    Uses a denylist instead of an allowlist so new languages are automatically
    included rather than silently skipped.
    """
    # Excluded directories anywhere in the path
    for part in path.parts:
        if part in _EXCLUDED_DIRS:
            return False

    # Lockfiles and other large, low-signal files
    if path.name in _EXCLUDED_FILENAMES:
        return False

    # Minified files (*.min.js, *.min.css, etc.)
    if ".min." in path.name:
        return False

    # Binary extensions
    if path.suffix.lower() in _BINARY_EXTENSIONS:
        return False

    # Binary content check: null bytes in first 512 bytes indicate binary
    try:
        with open(path, "rb") as f:
            sample = f.read(512)
        if b"\x00" in sample:
            return False
    except OSError:
        return False

    return True


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
    """Knowledge from a GitHub repository — full recursive traversal via Trees API.

    Uses ``GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`` to get the
    complete file tree in one request, then fetches content via the raw CDN in
    parallel batches.  Much faster than the single-level /contents/ approach and
    handles deeply nested repos correctly.

    Sources:
      - Trees API: https://docs.github.com/en/rest/git/trees
      - Raw CDN:   https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
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
        self._subpath = subpath.strip("/")
        self._token = token

        # Parse owner/repo from URL (supports https://github.com/owner/repo[.git])
        parts = self._repo_url.split("github.com/")[-1].split("/")
        self._owner = parts[0]
        self._repo = parts[1].removesuffix(".git") if len(parts) > 1 else ""

    async def extract(self) -> list[SourceDocument]:
        import httpx

        headers: dict[str, str] = {"Accept": "application/vnd.github.v3+json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"

        # One request for the full recursive tree
        tree_url = (
            f"https://api.github.com/repos/{self._owner}/{self._repo}"
            f"/git/trees/{self._branch}?recursive=1"
        )
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(tree_url, headers=headers)
            resp.raise_for_status()
            tree_data = resp.json()

        if tree_data.get("truncated"):
            logger.warning(
                "GitHubSource: tree truncated (repo too large) — "
                "use GitSource (git clone) for complete ingestion"
            )

        blobs = [
            item for item in tree_data.get("tree", [])
            if item["type"] == "blob"
            and (
                not self._subpath
                or item["path"].startswith(self._subpath + "/")
                or item["path"] == self._subpath
            )
            and _is_text_file(Path(item["path"].rsplit("/", 1)[-1]))
        ]

        logger.info("GitHubSource: fetching %d files from %s/%s@%s", len(blobs), self._owner, self._repo, self._branch)

        raw_base = f"https://raw.githubusercontent.com/{self._owner}/{self._repo}/{self._branch}"
        docs: list[SourceDocument] = []

        # Batch-fetch raw content (20 concurrent) to be API-friendly
        async with httpx.AsyncClient(timeout=30, headers=headers) as client:
            for i in range(0, len(blobs), 20):
                batch = blobs[i : i + 20]
                results = await asyncio.gather(
                    *[self._fetch_raw(client, blob, raw_base) for blob in batch],
                    return_exceptions=True,
                )
                for r in results:
                    if isinstance(r, SourceDocument):
                        docs.append(r)
                    elif isinstance(r, Exception):
                        logger.debug("GitHubSource: fetch error: %s", r)

        return docs

    async def _fetch_raw(
        self, client: Any, blob: dict[str, Any], raw_base: str
    ) -> SourceDocument | None:
        path = blob["path"]
        try:
            resp = await client.get(f"{raw_base}/{path}")
            if resp.status_code != 200:
                return None
            content = resp.text
        except Exception:
            return None

        source_type = "code" if _is_code_content(content) else "text"
        return SourceDocument(
            content=content,
            title=path.rsplit("/", 1)[-1],
            source_type=source_type,
            source_path=path,
            metadata={
                "repo": f"{self._owner}/{self._repo}",
                "branch": self._branch,
                "github_path": path,
                "provider": "github",
                "file_size": blob.get("size", 0),
            },
        )


# ── Generic git source (any host: GitHub, GitLab, Bitbucket, SSH, local) ─────


class GitSource(KnowledgeSource):
    """Extract files from any git repository — remote or local.

    Remote repos are shallow-cloned (``--depth 1``) into a temporary directory,
    then walked via ``git ls-files`` (respects ``.gitignore``).
    Local paths that contain a ``.git`` directory are walked with ``git ls-files``
    directly.  Plain directories without ``.git`` fall back to recursive glob.

    Auth:
      HTTPS + ``token``:  injected via ``GIT_ASKPASS`` (works with GitHub,
                          GitLab oauth2 tokens, Bitbucket app passwords, etc.)
      SSH URL + ``ssh_key``:  private key content written to a temp file;
                              ``GIT_SSH_COMMAND`` set accordingly.

    Provider detection (for metadata):
      URL hostname → "github" | "gitlab" | "bitbucket" | "other"
    """

    def __init__(
        self,
        source: str,
        *,
        branch: str | None = None,
        subpath: str = "",
        token: str | None = None,
        ssh_key: str | None = None,
        label: str = "",
    ) -> None:
        label = label or f"Git: {source}"
        super().__init__(label)
        self._source = source
        self._branch = branch
        self._subpath = subpath.strip("/")
        self._token = token
        self._ssh_key = ssh_key

    def _is_remote(self) -> bool:
        return self._source.startswith(("http://", "https://", "git@", "ssh://"))

    def _provider(self) -> str:
        src = self._source.lower()
        if "github.com" in src:
            return "github"
        if "gitlab.com" in src or "gitlab." in src:
            return "gitlab"
        if "bitbucket.org" in src:
            return "bitbucket"
        return "git"

    async def extract(self) -> list[SourceDocument]:
        if self._is_remote():
            return await self._clone_and_extract()
        # Local path
        local = Path(self._source)
        if not local.exists():
            raise FileNotFoundError(f"GitSource: local path not found: {self._source}")
        return await self._extract_local(local, provider="local")

    async def _clone_and_extract(self) -> list[SourceDocument]:
        tmp_dir = Path(tempfile.mkdtemp(prefix="telaios-git-"))
        git_env = {
            **os.environ,
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
        }
        sensitive: list[str] = []

        try:
            if self._token and self._source.startswith(("http://", "https://")):
                sensitive.append(self._token)
                askpass = tmp_dir / "askpass.sh"
                escaped = self._token.replace("\\", "\\\\").replace('"', '\\"')
                askpass.write_text(f'#!/bin/sh\necho "{escaped}"\n')
                askpass.chmod(askpass.stat().st_mode | stat.S_IEXEC)
                git_env["GIT_ASKPASS"] = str(askpass)
            elif self._ssh_key:
                sensitive.append(self._ssh_key)
                key_path = tmp_dir / "id_key"
                key_content = self._ssh_key
                if not key_content.endswith("\n"):
                    key_content += "\n"
                key_path.write_text(key_content)
                key_path.chmod(0o600)
                git_env["GIT_SSH_COMMAND"] = (
                    f"ssh -i {key_path} -o BatchMode=yes -o IdentitiesOnly=yes"
                    " -o StrictHostKeyChecking=accept-new"
                )

            clone_dir = tmp_dir / "repo"
            clone_args = ["clone", "--depth", "1", "--single-branch"]
            if self._branch:
                clone_args += ["--branch", self._branch]
            clone_args += [self._source, str(clone_dir)]

            logger.info("GitSource: cloning %s", self._source)
            proc = await asyncio.create_subprocess_exec(
                "git",
                *clone_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=git_env,
            )
            try:
                _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120.0)
            except TimeoutError:
                proc.kill()
                await proc.wait()
                raise RuntimeError("git clone timed out after 120s")

            if proc.returncode != 0:
                err = stderr.decode() if stderr else "git clone failed"
                # Sanitize credentials from error output
                for s in sensitive:
                    err = err.replace(s, "***")
                raise RuntimeError(f"git clone failed: {err}")

            return await self._extract_local(clone_dir, provider=self._provider())
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    async def _extract_local(self, repo_dir: Path, provider: str = "local") -> list[SourceDocument]:
        work_dir = repo_dir / self._subpath if self._subpath else repo_dir
        if not work_dir.exists():
            raise FileNotFoundError(f"GitSource: subpath not found: {work_dir}")

        # Detect git context via `git rev-parse` — works even in subdirectories
        # where `.git` lives in a parent directory.
        detect = await asyncio.create_subprocess_exec(
            "git", "rev-parse", "--is-inside-work-tree",
            cwd=str(work_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        detect_out, _ = await detect.communicate()
        has_git = detect.returncode == 0 and detect_out.decode().strip() == "true"

        if has_git:
            # Use git ls-files: tracks only committed files, respects .gitignore
            proc = await asyncio.create_subprocess_exec(
                "git",
                "ls-files",
                "--cached",
                cwd=str(work_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30.0)
            except TimeoutError:
                proc.kill()
                await proc.wait()
                raise RuntimeError("git ls-files timed out")
            rel_paths = [p for p in stdout.decode().splitlines() if p]
        else:
            # Not a git repo — fall back to rglob
            rel_paths = [
                str(f.relative_to(work_dir))
                for f in sorted(work_dir.rglob("*"))
                if f.is_file()
            ]

        docs: list[SourceDocument] = []
        for rel_path in rel_paths:
            abs_path = work_dir / rel_path
            if not abs_path.is_file() or not _is_text_file(abs_path):
                continue
            doc = _read_file_doc(abs_path)
            # Use clean relative path as source_path, not the temp dir absolute
            display_path = f"{self._subpath}/{rel_path}" if self._subpath else rel_path
            doc.source_path = display_path
            doc.metadata["provider"] = provider
            doc.metadata["git_path"] = display_path
            if self._branch:
                doc.metadata["branch"] = self._branch
            docs.append(doc)

        logger.info("GitSource: extracted %d files from %s", len(docs), self._source)
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
                raise RuntimeError(f"Docling failed to convert {path.name}: {exc}") from exc

        return docs
