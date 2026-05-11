"""Repository service — CRUD + connection test.

The ``test_repository`` method ports ``repository.service.ts:testRepository``:
 * For S3: creates an aioboto3 session and sends ``head_bucket``.
 * For git: shells out to ``git ls-remote`` via ``asyncio.subprocess``.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import stat
import tempfile
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.repositories.repository import RepositoryRepository
from telaios.modules.repositories.schemas import (
    RepositoryCreate,
    RepositoryPatch,
    RepositoryRead,
    RepoTestResult,
    TestRepositoryDto,
)
from telaios.utils.crypto import encrypt
from telaios.utils.errors import NotFoundError


def _slugify_creds(text: str, sensitive: list[str]) -> str:
    result = text
    for val in sensitive:
        if val:
            result = result.replace(val, "***")
    # Strip embedded URL credentials
    result = re.sub(r"https?://[^:]+:[^@]+@", "https://***@", result)
    return result.strip()


async def _run_git(
    args: list[str],
    env: dict[str, str],
    timeout_s: float = 20.0,
) -> tuple[int, str, str]:
    """Run git and return (returncode, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        "git",
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    try:
        raw_out, raw_err = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        raise
    return (proc.returncode or 0, raw_out.decode(), raw_err.decode())


async def _test_s3(dto: TestRepositoryDto) -> RepoTestResult:
    if not dto.bucket_name:
        return RepoTestResult(ok=False, code="INVALID_PATH", message="Bucket name is required")
    if not dto.credentials:
        return RepoTestResult(ok=False, code="AUTH_FAILED", message="S3 credentials are required")
    try:
        creds: dict[str, str] = json.loads(dto.credentials)
    except json.JSONDecodeError:
        return RepoTestResult(ok=False, code="AUTH_FAILED", message="Invalid credentials format")

    try:
        import aioboto3

        session = aioboto3.Session()
        kwargs: dict[str, Any] = {
            "region_name": dto.region or "us-east-1",
            "aws_access_key_id": creds.get("access_key_id"),
            "aws_secret_access_key": creds.get("secret_access_key"),
        }
        if dto.endpoint:
            kwargs["endpoint_url"] = dto.endpoint
        async with session.client("s3", **kwargs) as s3:
            await s3.head_bucket(Bucket=dto.bucket_name)
        return RepoTestResult(
            ok=True, code="OK", message=f'Bucket "{dto.bucket_name}" is accessible'
        )
    except Exception as exc:
        name = type(exc).__name__
        if name in {"NoSuchBucket", "NotFound"}:
            return RepoTestResult(
                ok=False,
                code="NETWORK_ERROR",
                message=f'Bucket "{dto.bucket_name}" does not exist',
            )
        if name in {"InvalidAccessKeyId", "SignatureDoesNotMatch", "InvalidClientTokenId"}:
            return RepoTestResult(ok=False, code="AUTH_FAILED", message="Invalid AWS credentials")
        if name in {"AccessDenied", "Forbidden"}:
            return RepoTestResult(
                ok=False, code="AUTH_FAILED", message="Access denied. Check bucket permissions."
            )
        return RepoTestResult(ok=False, code="UNKNOWN_ERROR", message=str(exc))


async def _test_git(dto: TestRepositoryDto) -> RepoTestResult:
    remote_url = dto.remote_url or ""
    if not remote_url:
        return RepoTestResult(ok=False, code="INVALID_URL", message="Remote URL is required")

    is_https = remote_url.startswith("http://") or remote_url.startswith("https://")
    is_ssh = remote_url.startswith("git@") or remote_url.startswith("ssh://")

    if is_https:
        if dto.auth_type == "ssh":
            return RepoTestResult(
                ok=False,
                code="INVALID_URL",
                message="SSH auth requires an SSH URL (git@host:path)",
            )
    elif is_ssh:
        if dto.auth_type == "token":
            return RepoTestResult(
                ok=False, code="INVALID_URL", message="Token auth requires an HTTPS URL"
            )
    else:
        return RepoTestResult(
            ok=False,
            code="INVALID_URL",
            message="URL must start with https://, http://, git@, or ssh://",
        )

    sensitive: list[str] = []
    tmp_dir: Path | None = None

    git_env: dict[str, str] = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_CONFIG_NOSYSTEM": "1",
    }

    try:
        if dto.auth_type == "token" and dto.credentials:
            sensitive.append(dto.credentials)
            tmp_dir = Path(tempfile.mkdtemp(prefix="git-test-"))
            askpass_path = tmp_dir / "askpass.sh"
            escaped = dto.credentials.replace("\\", "\\\\").replace('"', '\\"')
            askpass_path.write_text(f'#!/bin/sh\necho "{escaped}"\n')
            askpass_path.chmod(askpass_path.stat().st_mode | stat.S_IEXEC)
            git_env["GIT_ASKPASS"] = str(askpass_path)
        elif dto.auth_type == "ssh" and dto.credentials:
            sensitive.append(dto.credentials)
            tmp_dir = Path(tempfile.mkdtemp(prefix="git-ssh-"))
            key_path = tmp_dir / "id_key"
            key_content = dto.credentials
            if not key_content.endswith("\n"):
                key_content += "\n"
            key_path.write_text(key_content)
            key_path.chmod(0o600)
            git_env["GIT_SSH_COMMAND"] = (
                f"ssh -i {key_path} -o BatchMode=yes -o IdentitiesOnly=yes"
                " -o StrictHostKeyChecking=accept-new"
            )

        args = ["ls-remote", "--symref", remote_url, "HEAD"]
        if dto.branch:
            args.append(f"refs/heads/{dto.branch}")

        code, stdout, stderr = await _run_git(args, git_env)

        if code == 0:
            symref_match = re.search(r"^ref: refs/heads/([^\t\n]+)\tHEAD", stdout, re.MULTILINE)
            default_branch = symref_match.group(1) if symref_match else None

            if dto.branch and f"refs/heads/{dto.branch}" not in stdout:
                return RepoTestResult(
                    ok=False,
                    code="BRANCH_NOT_FOUND",
                    message=f'Repository is reachable but branch "{dto.branch}" was not found',
                    default_branch=default_branch,
                )
            return RepoTestResult(
                ok=True, code="OK", message="Repository is reachable", default_branch=default_branch
            )

        combined = _slugify_creds(f"{stderr}\n{stdout}", sensitive).lower()

        if any(
            kw in combined
            for kw in (
                "authentication failed",
                "invalid credentials",
                "403",
                "permission denied",
                "could not read username",
            )
        ):
            return RepoTestResult(
                ok=False,
                code="AUTH_FAILED",
                message="Authentication failed. Check your credentials.",
            )
        if any(
            kw in combined
            for kw in (
                "could not resolve",
                "name or service not known",
                "connection refused",
                "unable to connect",
                "network is unreachable",
            )
        ):
            return RepoTestResult(
                ok=False,
                code="NETWORK_ERROR",
                message="Could not reach the remote host. Check the URL.",
            )
        if any(kw in combined for kw in ("repository not found", "does not exist", "not found")):
            return RepoTestResult(
                ok=False,
                code="NETWORK_ERROR",
                message="Repository not found. Check the URL and access permissions.",
            )

        raw_msg = _slugify_creds(f"{stderr}\n{stdout}", sensitive).strip()
        return RepoTestResult(
            ok=False, code="UNKNOWN_ERROR", message=raw_msg or "Git command failed"
        )

    except TimeoutError:
        return RepoTestResult(
            ok=False,
            code="TIMEOUT",
            message="Connection timed out after 20s. Check the URL and network.",
        )
    except Exception as exc:
        msg = _slugify_creds(str(exc), sensitive)
        return RepoTestResult(ok=False, code="UNKNOWN_ERROR", message=msg)
    finally:
        if tmp_dir and tmp_dir.exists():
            import shutil

            shutil.rmtree(tmp_dir, ignore_errors=True)


async def test_repository(dto: TestRepositoryDto) -> RepoTestResult:
    """Connection-only test; no DB access needed."""
    if dto.provider_type == "s3":
        return await _test_s3(dto)
    return await _test_git(dto)


class RepositoryService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = RepositoryRepository(session)

    async def list_repositories(self, project_id: uuid.UUID) -> list[RepositoryRead]:
        items = await self._repo.list_by_project(project_id)
        return [RepositoryRead.from_orm_sanitized(r) for r in items]

    async def create_repository(
        self, project_id: uuid.UUID, dto: RepositoryCreate
    ) -> RepositoryRead:
        data: dict[str, Any] = dto.model_dump(exclude_none=True)
        if "credentials" in data:
            data["credentials"] = encrypt(data["credentials"])
        obj = await self._repo.create(project_id=project_id, **data)
        return RepositoryRead.from_orm_sanitized(obj)

    async def get_repository(self, repo_id: uuid.UUID, project_id: uuid.UUID) -> RepositoryRead:
        obj = await self._repo.find(repo_id, project_id)
        if obj is None:
            raise NotFoundError("Repository not found")
        return RepositoryRead.from_orm_sanitized(obj)

    async def patch_repository(
        self, repo_id: uuid.UUID, project_id: uuid.UUID, dto: RepositoryPatch
    ) -> RepositoryRead:
        obj = await self._repo.find(repo_id, project_id)
        if obj is None:
            raise NotFoundError("Repository not found")
        data = dto.model_dump(exclude_unset=True)
        if data.get("credentials"):
            data["credentials"] = encrypt(data["credentials"])
        for k, v in data.items():
            setattr(obj, k, v)
        obj = await self._repo.save(obj)
        return RepositoryRead.from_orm_sanitized(obj)

    async def delete_repository(self, repo_id: uuid.UUID, project_id: uuid.UUID) -> None:
        obj = await self._repo.find(repo_id, project_id)
        if obj is None:
            raise NotFoundError("Repository not found")
        await self._repo.soft_delete(obj)

    async def test_repository(self, dto: TestRepositoryDto) -> RepoTestResult:
        return await test_repository(dto)
