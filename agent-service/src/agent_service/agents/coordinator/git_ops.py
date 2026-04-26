from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Dict, Optional
from urllib.parse import urlparse

from agent_service.crypto import decrypt

logger = logging.getLogger(__name__)

_SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9_.\-]+$")


def is_safe_repo_name(name: str) -> bool:
    """Return True if the repository name is safe to use as a directory name."""
    return bool(_SAFE_NAME_RE.match(name))


def build_clone_url(repo: dict) -> str:
    """Return the plain remote URL — without embedded credentials."""
    return repo["remote_url"]


def git_env(repo: dict) -> Optional[Dict[str, str]]:
    """
    Build a git environment that injects credentials via GIT_CONFIG_COUNT
    instead of embedding tokens in the clone URL (which would expose them
    in process listings and kernel audit logs).
    """
    if repo.get("auth_type") == "token" and repo.get("credentials"):
        token = decrypt(repo["credentials"])
        if not token:
            return None
        parsed = urlparse(repo["remote_url"])
        host = parsed.hostname or ""
        # GIT_CONFIG_COUNT / GIT_CONFIG_KEY_N / GIT_CONFIG_VALUE_N available since git 2.31
        return {
            **os.environ,
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": f"http.{parsed.scheme}://{host}/.extraheader",
            "GIT_CONFIG_VALUE_0": f"Authorization: Bearer {token}",
        }
    return None


async def clone_or_pull(
    clone_url: str,
    local_path: str,
    branch: str,
    env: Optional[Dict[str, str]],
) -> None:
    """Clone the repository; if already present, pull instead."""
    proc = await asyncio.create_subprocess_exec(
        "git", "clone", clone_url, local_path,
        "--branch", branch,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    _, _stderr = await proc.communicate()
    if proc.returncode != 0:
        pull = await asyncio.create_subprocess_exec(
            "git", "-C", local_path, "pull",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        _, pull_err_bytes = await pull.communicate()
        if pull.returncode != 0:
            stderr_text = pull_err_bytes.decode(errors="replace").strip() if pull_err_bytes else ""
            raise RuntimeError(
                f"git clone and pull both failed for {local_path!r}: {stderr_text}"
            )


async def commit_and_push(
    local_path: str,
    branch: str,
    push_url: str,
    env: Optional[Dict[str, str]],
    commit_msg: str,
) -> None:
    """Stage any uncommitted changes, commit, and push to the remote."""
    status_proc = await asyncio.create_subprocess_exec(
        "git", "-C", local_path, "status", "--porcelain",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await status_proc.communicate()
    if stdout.strip():
        for cmd in [
            ["git", "-C", local_path, "config", "user.email", "agent@swe-ai.local"],
            ["git", "-C", local_path, "config", "user.name", "SWE AI Agent"],
            ["git", "-C", local_path, "add", "."],
            ["git", "-C", local_path, "commit", "-m", commit_msg],
        ]:
            p = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await p.wait()

    push_proc = await asyncio.create_subprocess_exec(
        "git", "-C", local_path, "push", push_url, branch,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    _, push_err_bytes = await push_proc.communicate()
    if push_proc.returncode != 0:
        stderr_text = push_err_bytes.decode(errors="replace").strip() if push_err_bytes else ""
        raise RuntimeError(f"git push failed: {stderr_text}")
