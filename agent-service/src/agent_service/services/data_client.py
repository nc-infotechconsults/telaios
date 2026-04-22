from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import httpx

from agent_service.config import config

logger = logging.getLogger(__name__)


def _make_client() -> httpx.AsyncClient:
    headers: Dict[str, str] = {}
    if config.DATA_API_KEY:
        headers["Authorization"] = f"Bearer {config.DATA_API_KEY}"
    return httpx.AsyncClient(
        base_url=config.DATA_API_URL, headers=headers, timeout=30.0
    )


# Module-level client — recreated lazily if closed
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = _make_client()
    return _client


async def _get(path: str) -> Any:
    r = await _get_client().get(path)
    r.raise_for_status()
    return r.json()


async def _post(path: str, body: Any = None) -> Any:
    r = await _get_client().post(path, json=body)
    r.raise_for_status()
    return r.json()


async def _patch(path: str, body: Any) -> Any:
    r = await _get_client().patch(path, json=body)
    r.raise_for_status()
    return r.json()


async def _delete(path: str) -> Any:
    r = await _get_client().delete(path)
    r.raise_for_status()
    return r.json()


# ── Projects ──────────────────────────────────────────────────────────────────


async def get_project(project_id: str) -> Dict[str, Any]:
    return await _get(f"/projects/{project_id}")


async def get_project_plans(project_id: str) -> List[Dict[str, Any]]:
    return await _get(f"/plans?project_id={project_id}")


async def get_project_repositories(project_id: str) -> List[Dict[str, Any]]:
    return await _get(f"/projects/{project_id}/repositories")


async def get_project_agents(project_id: str) -> List[Dict[str, Any]]:
    return await _get(f"/projects/{project_id}/agents")


async def get_project_agents_raw(project_id: str) -> List[Dict[str, Any]]:
    """Returns project agents with raw encrypted llm_api_key for agent-service decryption."""
    return await _get(f"/internal/project-agents/{project_id}")


# ── Settings ──────────────────────────────────────────────────────────────────


async def get_settings() -> Dict[str, Any]:
    return await _get("/settings/raw")


# ── Plans ─────────────────────────────────────────────────────────────────────


async def get_plan(plan_id: str) -> Dict[str, Any]:
    return await _get(f"/plans/{plan_id}")


async def create_plan(data: Dict[str, Any]) -> Dict[str, Any]:
    return await _post("/plans", data)


async def update_plan(plan_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    return await _patch(f"/plans/{plan_id}", data)


async def get_plan_messages(plan_id: str) -> List[Dict[str, Any]]:
    return await _get(f"/plans/{plan_id}/messages")


# ── Tasks ─────────────────────────────────────────────────────────────────────


async def get_plan_tasks(plan_id: str) -> List[Dict[str, Any]]:
    return await _get(f"/tasks?plan_id={plan_id}")


async def create_task(data: Dict[str, Any]) -> Dict[str, Any]:
    return await _post("/tasks", data)


async def update_task(task_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    return await _patch(f"/tasks/{task_id}", data)


async def delete_tasks_by_plan(plan_id: str) -> Dict[str, Any]:
    return await _delete(f"/plans/{plan_id}/tasks")


# ── Messages ──────────────────────────────────────────────────────────────────


async def save_message(data: Dict[str, Any]) -> Dict[str, Any]:
    return await _post("/messages", data)


# ── Repositories ──────────────────────────────────────────────────────────────


async def update_repository_status(
    repo_id: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    return await _patch(f"/repositories/{repo_id}", data)


# ── Documents ─────────────────────────────────────────────────────────────────


async def get_document(project_id: str, document_id: str) -> Dict[str, Any]:
    return await _get(f"/projects/{project_id}/documents/{document_id}")


async def list_project_documents(project_id: str) -> List[Dict[str, Any]]:
    """Return all documents for a project (ordered by created_at DESC)."""
    return await _get(f"/projects/{project_id}/documents")


async def update_document_status(
    document_id: str,
    status: str,
    error_message: Optional[str] = None,
) -> None:
    await _patch(
        f"/internal/documents/{document_id}/status",
        {"status": status, "error_message": error_message},
    )


async def store_document_chunks(
    document_id: str,
    chunks: List[Dict[str, Any]],
) -> None:
    await _post(f"/internal/documents/{document_id}/chunks", {"chunks": chunks})


async def search_document_chunks(
    project_id: str,
    embedding: List[float],
    limit: int = 5,
) -> List[Dict[str, Any]]:
    return await _post(
        "/internal/documents/search",
        {"project_id": project_id, "embedding": embedding, "limit": limit},
    )


# ── Plan lifecycle (internal) ─────────────────────────────────────────────────


async def start_plan_execution(plan_id: str) -> None:
    await _patch(f"/internal/plans/{plan_id}/status", {"status": "executing"})


async def complete_plan_execution(plan_id: str) -> None:
    await _patch(f"/internal/plans/{plan_id}/status", {"status": "completed"})


async def fail_plan_execution(plan_id: str, reason: Optional[str] = None) -> None:
    await _patch(
        f"/internal/plans/{plan_id}/status",
        {"status": "failed", "failure_reason": reason},
    )


# ── Task propagation (internal) ───────────────────────────────────────────────


async def skip_dependent_tasks(task_id: str) -> None:
    await _post(f"/internal/tasks/{task_id}/skip-dependents")


async def cancel_plan_tasks(plan_id: str) -> Dict[str, Any]:
    return await _post(f"/internal/plans/{plan_id}/cancel-tasks")


# ── Task artifacts (internal) ─────────────────────────────────────────────────


async def create_task_artifacts(task_id: str, artifacts: List[Dict[str, Any]]) -> None:
    await _post(f"/internal/tasks/{task_id}/artifacts", {"artifacts": artifacts})
