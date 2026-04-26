from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

from agent_service.services import data_client

logger = logging.getLogger(__name__)


def _scan_repo_structure(root_path: str, max_depth: int = 3) -> str:
    IGNORE = frozenset([
        ".git", "node_modules", "__pycache__", ".next", "dist", "build",
        ".venv", "venv", ".mypy_cache", ".pytest_cache", "coverage",
        ".turbo", ".cache", "vendor",
    ])

    lines: list[str] = []

    def walk(directory: str, depth: int, prefix: str) -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(os.scandir(directory), key=lambda e: (not e.is_dir(), e.name.lower()))
        except Exception:
            return
        filtered = [e for e in entries if e.name not in IGNORE and not e.name.startswith(".")]
        cap = filtered[:60]
        for i, entry in enumerate(cap):
            is_last = i == len(cap) - 1
            connector = "└── " if is_last else "├── "
            child_prefix = prefix + ("    " if is_last else "│   ")
            suffix = "/" if entry.is_dir() else ""
            lines.append(f"{prefix}{connector}{entry.name}{suffix}")
            if entry.is_dir():
                walk(entry.path, depth + 1, child_prefix)
        if len(filtered) > 60:
            lines.append(f"{prefix}... ({len(filtered) - 60} more)")

    lines.append(os.path.basename(root_path) + "/")
    walk(root_path, 1, "")
    return "\n".join(lines)


async def _gather_project_context(project_id: str, current_plan_id: str) -> Dict[str, Any]:
    project, all_plans, repos, documents = await asyncio.gather(
        data_client.get_project(project_id),
        data_client.get_project_plans(project_id),
        data_client.get_project_repositories(project_id),
        data_client.list_project_documents(project_id),
    )

    existing_plans = [
        {"title": p.get("title"), "status": p["status"]}
        for p in all_plans
        if p["id"] != current_plan_id
    ]

    repo_structures = []
    for r in repos:
        structure = "(not yet cloned)"
        if r.get("local_path") and os.path.exists(r["local_path"]):
            try:
                structure = _scan_repo_structure(r["local_path"])
            except Exception:
                structure = "(unable to scan)"
        repo_structures.append({"name": r["name"], "structure": structure})

    ready_docs = [
        {
            "name": d.get("name", ""),
            "file_type": d.get("file_type", ""),
            "size_bytes": d.get("size_bytes", 0),
        }
        for d in documents
        if d.get("status") == "ready"
    ]

    return {
        "name": project["name"],
        "description": project.get("description"),
        "existingPlans": existing_plans,
        "repoStructures": repo_structures,
        "documents": ready_docs,
    }


def _build_project_context_text(ctx: Dict[str, Any], plan_title: Optional[str]) -> str:
    lines: list[str] = []
    lines.append(f"Project: {ctx['name']}")
    if ctx.get("description"):
        lines.append(f"Description: {ctx['description']}")

    if ctx.get("existingPlans"):
        lines.append("\nExisting plans for this project (do NOT duplicate their scope):")
        for p in ctx["existingPlans"]:
            lines.append(f'  - "{p["title"] or "(untitled)"}" [{p["status"]}]')

    if plan_title:
        lines.append(f'\nThis plan is titled: "{plan_title}"')

    if ctx.get("repoStructures"):
        lines.append("\nRepository file structure(s):")
        for r in ctx["repoStructures"]:
            lines.append(f"\n### {r['name']}\n```\n{r['structure']}\n```")

    docs = ctx.get("documents", [])
    if docs:
        lines.append(
            "\nProject documents (already uploaded and indexed — "
            "reference them in task descriptions when relevant):"
        )
        for d in docs:
            size_kb = round(d.get("size_bytes", 0) / 1024, 1)
            lines.append(f"  - {d['name']} ({d.get('file_type', 'unknown')}, {size_kb} KB)")

    return "\n".join(lines)
