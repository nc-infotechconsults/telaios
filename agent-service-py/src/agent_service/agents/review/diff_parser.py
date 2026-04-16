from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Literal, Optional


@dataclass
class DiffHunk:
    old_start: int
    old_lines: int
    new_start: int
    new_lines: int
    content: str


@dataclass
class FileDiff:
    path: str
    old_path: Optional[str]
    status: Literal["added", "modified", "deleted", "renamed"]
    hunks: List[DiffHunk] = field(default_factory=list)
    raw_diff: str = ""


@dataclass
class ParsedDiff:
    files: List[FileDiff]
    total_added: int
    total_removed: int


_FILE_HEADER_RE = re.compile(r"^diff --git a/(.*?) b/(.*)$")
_HUNK_HEADER_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def parse_diff(raw_diff: str) -> ParsedDiff:
    """Parse the output of ``git diff`` into structured FileDiffs."""
    lines = raw_diff.split("\n")
    files: List[FileDiff] = []
    current: Optional[FileDiff] = None
    current_hunk: Optional[DiffHunk] = None
    total_added = 0
    total_removed = 0

    def push_hunk() -> None:
        if current and current_hunk:
            current.hunks.append(current_hunk)
            current.raw_diff += current_hunk.content + "\n"

    for line in lines:
        file_match = _FILE_HEADER_RE.match(line)
        if file_match:
            push_hunk()
            current_hunk = None
            if current:
                files.append(current)
            a_path = file_match.group(1)
            b_path = file_match.group(2)
            current = FileDiff(
                path=b_path,
                old_path=a_path if a_path != b_path else None,
                status="modified",
            )
            continue

        if current is None:
            continue

        if line.startswith("new file mode"):
            current.status = "added"
            continue
        if line.startswith("deleted file mode"):
            current.status = "deleted"
            continue
        if line.startswith("rename from"):
            current.status = "renamed"
            continue

        hunk_match = _HUNK_HEADER_RE.match(line)
        if hunk_match:
            push_hunk()
            current_hunk = DiffHunk(
                old_start=int(hunk_match.group(1)),
                old_lines=int(hunk_match.group(2) or "1"),
                new_start=int(hunk_match.group(3)),
                new_lines=int(hunk_match.group(4) or "1"),
                content=line + "\n",
            )
            continue

        if current_hunk:
            current_hunk.content += line + "\n"
            if line.startswith("+") and not line.startswith("+++"):
                total_added += 1
            if line.startswith("-") and not line.startswith("---"):
                total_removed += 1

    push_hunk()
    if current:
        files.append(current)

    return ParsedDiff(files=files, total_added=total_added, total_removed=total_removed)


def format_diff_for_llm(diff: ParsedDiff, max_chars_per_file: int = 4000) -> str:
    """Format a ParsedDiff into a compact LLM-friendly string."""
    parts = [
        f"Changed files: {len(diff.files)} | +{diff.total_added} -{diff.total_removed}\n"
    ]
    for file in diff.files:
        header = f"\n--- {file.status.upper()}: {file.path} ---\n"
        body = (
            file.raw_diff[:max_chars_per_file] + "\n... (truncated)"
            if len(file.raw_diff) > max_chars_per_file
            else file.raw_diff
        )
        parts.append(header + body)
    return "".join(parts)
