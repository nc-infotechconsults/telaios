"""Helm CLI wrapper.

Wraps the ``helm`` binary (assumed to be installed in the container) via
:mod:`asyncio.subprocess` for install/upgrade/uninstall/status operations.
Also provides chart scanning across cloned project repositories.

Port of ``data-api/src/services/helm.service.ts``.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any

__all__ = ["HelmChart", "HelmClient"]

WORKSPACES_ROOT = os.environ.get("WORKSPACES_ROOT", "/workspaces")
_MAX_CHART_DEPTH = 4


class HelmChart:
    """Minimal data class for a discovered Helm chart."""

    def __init__(
        self,
        name: str,
        version: str,
        description: str,
        repo_url: str | None = None,
        local_path: str | None = None,
    ) -> None:
        self.name = name
        self.version = version
        self.description = description
        self.repo_url = repo_url
        self.local_path = local_path

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "repo_url": self.repo_url,
            "local_path": self.local_path,
        }


async def _run_helm(*args: str) -> str:
    """Execute ``helm`` with *args* and return stripped stdout.

    Raises :class:`RuntimeError` on non-zero exit.
    """
    proc = await asyncio.create_subprocess_exec(
        "helm",
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_b, stderr_b = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(stderr_b.decode(errors="replace").strip() or "helm command failed")
    return stdout_b.decode(errors="replace").strip()


async def _walk_for_charts(
    base_path: Path,
    current_path: Path,
    charts: list[HelmChart],
    depth: int = 0,
) -> None:
    """Recursively walk *current_path* looking for ``Chart.yaml`` files."""
    if depth > _MAX_CHART_DEPTH:
        return
    try:
        entries = await asyncio.to_thread(lambda: list(current_path.iterdir()))
    except OSError:
        return

    for entry in entries:
        if entry.name.startswith(".") or entry.name == "node_modules":
            continue
        if entry.is_file() and entry.name == "Chart.yaml":
            try:
                chart_yaml = entry.read_text(encoding="utf-8")
            except OSError:
                continue
            name_m = re.search(r"^name:\s*(.+)$", chart_yaml, re.MULTILINE)
            ver_m = re.search(r"^version:\s*(.+)$", chart_yaml, re.MULTILINE)
            desc_m = re.search(r"^description:\s*(.+)$", chart_yaml, re.MULTILINE)
            charts.append(
                HelmChart(
                    name=name_m.group(1).strip() if name_m else entry.parent.name,
                    version=ver_m.group(1).strip() if ver_m else "0.1.0",
                    description=desc_m.group(1).strip() if desc_m else "",
                    local_path=str(entry.parent.relative_to(base_path)),
                )
            )
        elif entry.is_dir():
            await _walk_for_charts(base_path, entry, charts, depth + 1)


class HelmClient:
    """Async wrapper around the ``helm`` CLI binary."""

    # ── Chart discovery ───────────────────────────────────────────────────────

    async def list_charts(self, repo_url: str) -> list[dict[str, Any]]:
        """List charts available in a remote Helm repository."""
        temp_name = f"tmp-repo-{uuid.uuid4().hex[:8]}"
        try:
            await _run_helm("repo", "add", temp_name, repo_url)
            await _run_helm("repo", "update")
            raw = await _run_helm("search", "repo", f"{temp_name}/", "--output", "json")
            with contextlib.suppress(RuntimeError):
                await _run_helm("repo", "remove", temp_name)
            items: list[dict[str, Any]] = json.loads(raw)
            return [
                HelmChart(
                    name=item.get("name", "").replace(f"{temp_name}/", ""),
                    version=item.get("chart_version", ""),
                    description=item.get("description", ""),
                    repo_url=repo_url,
                ).as_dict()
                for item in items
            ]
        except Exception:
            return []

    async def scan_project_charts(
        self, project_id: str, repo_names: list[str]
    ) -> list[dict[str, Any]]:
        """Scan cloned project repositories for ``Chart.yaml`` files."""
        charts: list[HelmChart] = []
        for repo_name in repo_names:
            base = Path(WORKSPACES_ROOT) / project_id / repo_name
            if not base.is_dir():
                continue
            await _walk_for_charts(base, base, charts)
        return [c.as_dict() for c in charts]

    # ── Release operations ────────────────────────────────────────────────────

    async def install(
        self,
        release_name: str,
        chart: str,
        namespace: str,
        values: dict[str, Any] | None = None,
        repo_url: str | None = None,
        chart_version: str | None = None,
    ) -> str:
        is_oci = repo_url is not None and repo_url.startswith("oci://")
        chart_arg = f"{repo_url}/{chart}" if is_oci else chart
        args = [
            "install",
            release_name,
            chart_arg,
            "--namespace",
            namespace,
            "--create-namespace",
            "--output",
            "json",
        ]
        if repo_url and not is_oci:
            args += ["--repo", repo_url]
        if chart_version:
            args += ["--version", chart_version]
        return await self._run_with_values(args, values)

    async def upgrade(
        self,
        release_name: str,
        chart: str,
        namespace: str,
        values: dict[str, Any] | None = None,
        repo_url: str | None = None,
        chart_version: str | None = None,
    ) -> str:
        is_oci = repo_url is not None and repo_url.startswith("oci://")
        chart_arg = f"{repo_url}/{chart}" if is_oci else chart
        args = [
            "upgrade",
            release_name,
            chart_arg,
            "--namespace",
            namespace,
            "--install",
            "--output",
            "json",
        ]
        if repo_url and not is_oci:
            args += ["--repo", repo_url]
        if chart_version:
            args += ["--version", chart_version]
        return await self._run_with_values(args, values)

    async def uninstall(self, release_name: str, namespace: str) -> str:
        return await _run_helm("uninstall", release_name, "--namespace", namespace)

    async def status(self, release_name: str, namespace: str) -> dict[str, Any]:
        raw = await _run_helm("status", release_name, "--namespace", namespace, "--output", "json")
        result: dict[str, Any] = json.loads(raw)
        return result

    async def list_releases(self, namespace: str = "all") -> list[dict[str, Any]]:
        args = ["list", "--output", "json"]
        if namespace != "all":
            args += ["--namespace", namespace]
        else:
            args.append("--all-namespaces")
        try:
            raw = await _run_helm(*args)
            items: list[dict[str, Any]] = json.loads(raw)
            return items
        except Exception:
            return []

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _run_with_values(self, args: list[str], values: dict[str, Any] | None) -> str:
        if not values:
            return await _run_helm(*args)

        # Write values as JSON to a temporary file (helm accepts JSON in --values)
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".json",
            prefix="helm-values-",
            delete=False,
        ) as tmp:
            tmp.write(json.dumps(values))
            tmp_name = tmp.name
        try:
            return await _run_helm(*args, "--values", tmp_name)
        finally:
            with contextlib.suppress(OSError):
                os.unlink(tmp_name)
