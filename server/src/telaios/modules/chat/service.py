"""Chat service — orchestrates a planning turn end-to-end.

This is the single place that orchestrates: plan loading, context building,
LLM planning invocation, task creation, message persistence, and SSE
broadcasting.  Routers are thin; this service owns the business logic.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.config.settings import get_settings
from telaios.core.factory import create_llm
from telaios.core.types import LLMConfig, Message, MessageRole
from telaios.infra import sse as sse_manager
from telaios.modules.documents.chunks.service import ChunkService
from telaios.modules.documents.service import DocumentService
from telaios.modules.messages.schemas import MessageCreate, MessageRead
from telaios.modules.messages.service import MessageService
from telaios.modules.plans.prompts import compose_planning_prompt
from telaios.modules.plans.schemas import PlanPatch
from telaios.modules.plans.service import PlanService
from telaios.modules.repositories.service import RepositoryService
from telaios.modules.tasks.schemas import TaskCreate
from telaios.modules.tasks.service import TaskService

logger = logging.getLogger(__name__)

HEARTBEAT_INTERVAL = 20


def _normalize_llm_content(raw: Any) -> str:
    if isinstance(raw, str):
        return raw
    if raw is None:
        return ""
    if isinstance(raw, list):
        parts: list[str] = []
        for item in raw:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") if "text" in item else item.get("content")
                if isinstance(text, str):
                    parts.append(text)
        if parts:
            return "\n".join(parts)
    return str(raw)


def _is_confirm_message(content: str) -> bool:
    normalized = content.strip().lower()
    return normalized in {"confirm", "/confirm", "confirm plan", "approve", "approved"}


def _fallback_plan_text(
    plan_title: str | None,
    user_request: str,
    repo_names: list[str],
    doc_names: list[str],
) -> str:
    repo_segment = ", ".join(repo_names) if repo_names else "project repositories"
    doc_segment = ", ".join(doc_names) if doc_names else "uploaded documents"
    return (
        f"Draft plan for '{plan_title or 'this project'}'. "
        f"I will implement auth requirements from {doc_segment} and align code changes with {repo_segment}. "
        f"Request captured: {user_request}"
    )


def _build_tasks_from_context(
    *,
    user_request: str,
    repo_ids: list[uuid.UUID],
    repo_names: list[str],
    doc_names: list[str],
) -> list[TaskCreate]:
    repo_phrase = ", ".join(repo_names) if repo_names else "project repositories"
    doc_phrase = ", ".join(doc_names) if doc_names else "uploaded documents"

    return [
        TaskCreate(
            title="Analyze repository and document context",
            description=(
                f"Review repositories ({repo_phrase}) and document knowledge ({doc_phrase}) "
                f"to capture constraints for: {user_request}"
            ),
            type="knowledge",
            execution_order=0,
            repository_ids=repo_ids,
            depends_on_task_ids=[],
        ),
        TaskCreate(
            title="Implement authentication flow",
            description=(
                f"Implement core auth functionality aligned to {doc_phrase}. "
                "Include backend API and integration points in repository codebase."
            ),
            type="code",
            execution_order=1,
            repository_ids=repo_ids,
            depends_on_task_ids=[],
        ),
        TaskCreate(
            title="Add tests and verification",
            description=(
                "Add integration and regression tests for the new auth flow and "
                "verify acceptance criteria from project documents."
            ),
            type="test",
            execution_order=2,
            repository_ids=repo_ids,
            depends_on_task_ids=[],
        ),
    ]


class ChatService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._msg_svc = MessageService(session)
        self._plan_svc = PlanService(session)
        self._task_svc = TaskService(session)
        self._doc_svc = DocumentService(session)
        self._repo_svc = RepositoryService(session)

    async def _build_planning_context(
        self,
        *,
        project_id: uuid.UUID,
        plan_id: uuid.UUID,
    ) -> dict[str, Any]:
        plan_obj = await self._plan_svc.get_orm(plan_id)
        if plan_obj is None:
            raise RuntimeError("Plan not found")

        repos = await self._repo_svc.list_repositories(project_id)
        docs = await self._doc_svc.list_by_project(project_id)
        ready_docs = [d for d in docs if d.status == "ready"]
        plan_reads = await self._plan_svc.list_by_project(project_id)

        repo_structures: list[dict[str, str]] = []
        for r in repos:
            source = r.remote_url or r.bucket_name or "(local)"
            repo_structures.append(
                {"name": r.name, "structure": f"source={source}; branch={r.branch}"}
            )

        docs_context: list[dict[str, Any]] = []
        chunk_service = ChunkService(self._session)
        for d in ready_docs:
            chunk_count = len(await chunk_service.get_by_document(d.id))
            docs_context.append(
                {
                    "id": str(d.id),
                    "name": d.name,
                    "file_type": d.file_type,
                    "size_bytes": d.size_bytes,
                    "chunk_count": chunk_count,
                }
            )

        return {
            "plan_title": plan_obj.title,
            "project_context": {
                "name": f"project-{project_id}",
                "existingPlans": [
                    {"id": str(p.id), "title": p.title, "status": p.status}
                    for p in plan_reads
                    if p.id != plan_id
                ],
                "repoStructures": repo_structures,
                "documents": docs_context,
            },
            "repos": [
                {"id": str(r.id), "name": r.name, "remote_url": r.remote_url, "branch": r.branch}
                for r in repos
            ],
            "documents": docs_context,
            "has_tools": False,
        }

    async def _invoke_llm(
        self,
        user_request: str,
        context: dict[str, Any],
    ) -> str:
        settings = get_settings()
        cloud_provider_without_endpoint = (
            settings.LLM_PROVIDER in {"openai", "anthropic", "azure_openai"}
            and not settings.LLM_API_KEY
            and not settings.LLM_BASE_URL
        )
        if cloud_provider_without_endpoint:
            raise RuntimeError("LLM is not configured")

        llm = create_llm(
            LLMConfig(
                provider=settings.LLM_PROVIDER,
                model=settings.LLM_MODEL,
                api_key=settings.LLM_API_KEY,
                base_url=settings.LLM_BASE_URL,
            )
        )

        prompt = compose_planning_prompt(
            user_request=user_request,
            context=context,
            phase="interview",
        )
        response = await llm.invoke(
            [
                Message(role=MessageRole.SYSTEM, content=prompt),
                Message(role=MessageRole.HUMAN, content=user_request),
            ]
        )
        return _normalize_llm_content(getattr(response, "content", response))

    async def _apply_confirm(self, plan_id: uuid.UUID) -> None:
        await self._plan_svc.patch(plan_id, PlanPatch(status="confirmed"))
        sse_manager.broadcast(str(plan_id), {"type": "plan_confirmed", "plan_id": str(plan_id)})

    async def process_turn(
        self,
        *,
        plan_id: uuid.UUID,
        project_id: uuid.UUID,
        user_content: str,
    ) -> None:
        """Handle one planning turn: confirm flow or LLM invocation + task creation."""
        sse_manager.broadcast(str(plan_id), {"type": "chat_thinking"})

        if _is_confirm_message(user_content):
            await self._apply_confirm(plan_id)
            assistant_text = "Plan confirmed. Execution can begin."
            assistant = await self._msg_svc.create(
                project_id=project_id,
                dto=MessageCreate(role="assistant", content=assistant_text, plan_id=plan_id),
            )
            sse_manager.broadcast(
                str(plan_id), {"type": "message", "data": assistant.model_dump(mode="json")}
            )
            sse_manager.broadcast(str(plan_id), {"type": "chat_end"})
            return

        context = await self._build_planning_context(project_id=project_id, plan_id=plan_id)
        repo_ids = [uuid.UUID(r["id"]) for r in context.get("repos", []) if r.get("id")]
        repo_names = [str(r.get("name", "repo")) for r in context.get("repos", [])]
        doc_names = [str(d.get("name", "document")) for d in context.get("documents", [])]

        try:
            assistant_text = await self._invoke_llm(user_content, context)
        except Exception as exc:
            logger.warning("planner invocation failed, using fallback: %s", exc)
            plan_obj = await self._plan_svc.get_orm(plan_id)
            plan_title = plan_obj.title if plan_obj is not None else None
            assistant_text = _fallback_plan_text(plan_title, user_content, repo_names, doc_names)

        for token in assistant_text.split():
            sse_manager.broadcast(str(plan_id), {"type": "chat_token", "content": f"{token} "})

        assistant = await self._msg_svc.create(
            project_id=project_id,
            dto=MessageCreate(role="assistant", content=assistant_text, plan_id=plan_id),
        )
        sse_manager.broadcast(
            str(plan_id), {"type": "message", "data": assistant.model_dump(mode="json")}
        )

        existing_tasks = await self._task_svc.list_by_plan(plan_id)
        if not existing_tasks:
            created_tasks = []
            task_dtos = _build_tasks_from_context(
                user_request=user_content,
                repo_ids=repo_ids,
                repo_names=repo_names,
                doc_names=doc_names,
            )
            prior_ids: list[uuid.UUID] = []
            for dto in task_dtos:
                dto.depends_on_task_ids = prior_ids.copy()
                created = await self._task_svc.create(plan_id, dto)
                created_tasks.append(created)
                prior_ids.append(created.id)

            plan_obj = await self._plan_svc.get_orm(plan_id)
            plan_payload = {
                "id": str(plan_id),
                "project_id": str(project_id),
                "title": plan_obj.title if plan_obj is not None else None,
                "status": "draft",
                "created_at": (plan_obj.created_at.isoformat() if plan_obj is not None else ""),
                "tasks": [
                    {
                        "id": str(t.id),
                        "plan_id": str(t.plan_id),
                        "title": t.title,
                        "description": t.description,
                        "type": t.type,
                        "status": t.status,
                        "execution_order": t.execution_order,
                        "agent_profile_id": t.agent_profile_id,
                        "assigned_instance_id": t.assigned_instance_id,
                        "result": t.result,
                        "started_at": t.started_at.isoformat() if t.started_at else None,
                        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                        "metadata": t.task_metadata,
                        "depends_on_task_ids": [str(dep) for dep in t.depends_on_task_ids],
                        "repository_ids": [str(rid) for rid in t.repository_ids],
                        "created_at": t.created_at.isoformat(),
                        "updated_at": t.updated_at.isoformat(),
                    }
                    for t in created_tasks
                ],
            }
            sse_manager.broadcast(str(plan_id), {"type": "plan_draft", "plan": plan_payload})

        sse_manager.broadcast(str(plan_id), {"type": "chat_end"})

    async def send_message(
        self,
        plan_id: uuid.UUID,
        project_id: uuid.UUID,
        content: str,
    ) -> MessageRead:
        """Persist a user message and trigger a planning turn."""
        msg = await self._msg_svc.create(
            project_id=project_id,
            dto=MessageCreate(role="user", content=content, plan_id=plan_id),
        )
        sse_manager.broadcast(
            str(plan_id), {"type": "message", "data": msg.model_dump(mode="json")}
        )

        try:
            await self.process_turn(
                plan_id=plan_id,
                project_id=project_id,
                user_content=content,
            )
        except Exception as exc:
            logger.exception("planning turn failed for plan %s", plan_id)
            sse_manager.broadcast(str(plan_id), {"type": "error", "message": str(exc)})
            sse_manager.broadcast(str(plan_id), {"type": "chat_end"})
        return msg


__all__ = ["ChatService"]
