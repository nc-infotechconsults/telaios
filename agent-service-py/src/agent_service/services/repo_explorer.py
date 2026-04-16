from __future__ import annotations

import asyncio
import logging
import os
import subprocess
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from agent_service.config import config
from agent_service.crypto import decrypt
from agent_service.services import data_client

logger = logging.getLogger(__name__)

PLANNING_ROOT = os.path.join(config.WORKSPACES_ROOT, "planning")

IGNORE_DIRS = frozenset(
    {
        ".git",
        "node_modules",
        "__pycache__",
        ".next",
        "dist",
        "build",
        ".venv",
        "venv",
        "vendor",
        ".turbo",
        "coverage",
        ".mypy_cache",
        ".pytest_cache",
        ".cache",
    }
)


async def ensure_local_path(repo: dict, project_id: str) -> str:
    """
    Return a local filesystem path where the repo is available.
    Reuses the execution workspace path if already cloned; otherwise
    does a shallow clone into the planning workspace.
    """
    local_path: Optional[str] = repo.get("local_path")
    if local_path and os.path.exists(local_path):
        return local_path

    planning_path = os.path.join(PLANNING_ROOT, project_id, repo["name"])

    if os.path.exists(planning_path):
        # Already cloned — try to pull latest
        try:
            proc = await asyncio.create_subprocess_exec(
                "git", "-C", planning_path, "pull",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
        except Exception:
            pass
        return planning_path

    remote_url = repo.get("remote_url")
    if not remote_url:
        raise ValueError(
            f'Repository "{repo["name"]}" has no remote URL and is not yet cloned'
        )

    os.makedirs(os.path.dirname(planning_path), exist_ok=True)

    clone_url = remote_url
    if repo.get("auth_type") == "token" and repo.get("credentials"):
        token = decrypt(repo["credentials"])
        parsed = urlparse(clone_url)
        clone_url = parsed._replace(
            netloc=f"{token}@{parsed.hostname or ''}{f':{parsed.port}' if parsed.port else ''}"
        ).geturl()

    branch = repo.get("branch") or "main"

    proc = await asyncio.create_subprocess_exec(
        "git", "clone", clone_url, planning_path,
        "--depth=1",
        f"--branch={branch}",
        "--single-branch",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"git clone failed for {repo['name']}: {stderr.decode(errors='replace')}"
        )

    # Update repo record with local path
    await data_client.update_repository_status(repo["id"], {"status": "ready", "local_path": planning_path})
    return planning_path


def list_directory(local_path: str, rel_path: str = "") -> str:
    """List files and directories at ``rel_path`` inside the repo."""
    target = os.path.join(local_path, rel_path) if rel_path else local_path

    if not _is_inside_root(local_path, target):
        return "Error: path traversal not allowed"

    try:
        if not os.path.exists(target):
            return f"Path not found: {rel_path or '/'}"
        if not os.path.isdir(target):
            return f'"{rel_path}" is a file, not a directory'

        entries = os.scandir(target)
        filtered = sorted(
            [e for e in entries if e.name not in IGNORE_DIRS and not e.name.startswith(".")],
            key=lambda e: (not e.is_dir(), e.name.lower()),
        )

        if not filtered:
            return "(empty directory)"

        lines: list[str] = []
        for entry in filtered:
            suffix = "/" if entry.is_dir() else ""
            icon = "📁" if entry.is_dir() else "📄"
            lines.append(f"{icon} {entry.name}{suffix}")
        return "\n".join(lines)
    except Exception as exc:
        return f"Error listing directory: {exc}"


def read_file(local_path: str, rel_path: str, max_chars: int = 10_000) -> str:
    """Read file content at ``rel_path`` inside the repo. Truncates large files."""
    target = os.path.join(local_path, rel_path)

    if not _is_inside_root(local_path, target):
        return "Error: path traversal not allowed"

    try:
        if not os.path.exists(target):
            return f"File not found: {rel_path}"
        if os.path.isdir(target):
            return f'"{rel_path}" is a directory — use list_directory instead'

        with open(target, "r", encoding="utf-8", errors="replace") as fh:
            raw = fh.read()

        if len(raw) <= max_chars:
            return raw
        return raw[:max_chars] + f"\n\n[... truncated — {len(raw) - max_chars} more characters]"
    except Exception as exc:
        return f"Error reading file: {exc}"


def search_code(local_path: str, pattern: str, file_glob: str = "*") -> str:
    """Search for a text pattern across the repo (like grep -r)."""
    try:
        result = subprocess.run(
            ["grep", "-r", f"--include={file_glob}", "-n", pattern, "."],
            cwd=local_path,
            capture_output=True,
            text=True,
            timeout=8,
        )
        lines = result.stdout.strip().split("\n")[:30]
        filtered = [l for l in lines if l]
        return "\n".join(filtered) if filtered else "No matches found"
    except Exception:
        return "No matches found"


def _is_inside_root(root: str, target: str) -> bool:
    resolved_root = os.path.realpath(root)
    resolved_target = os.path.realpath(target)
    return resolved_target == resolved_root or resolved_target.startswith(resolved_root + os.sep)
