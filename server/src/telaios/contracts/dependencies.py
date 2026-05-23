"""FastAPI dependency factories — inject services via ``Depends()``.

Replaces the manual ``TaskService(session).method()`` pattern with proper
DI composition::

    @router.get("/tasks/{task_id}")
    async def get_task(
        task_id: uuid.UUID,
        tasks: TaskService = Depends(get_task_service),
    ) -> TaskRead:
        return await tasks.get(task_id)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.session import get_session
from telaios.modules.documents.service import DocumentService
from telaios.modules.plans.service import PlanService
from telaios.modules.projects.service import ProjectService
from telaios.modules.tasks.service import TaskService
from telaios.modules.users.service import UserService
from telaios.modules.workspaces.service import WorkspaceService


def get_task_service(
    session: AsyncSession = Depends(get_session),
) -> TaskService:
    return TaskService(session)


def get_plan_service(
    session: AsyncSession = Depends(get_session),
) -> PlanService:
    return PlanService(session)


def get_project_service(
    session: AsyncSession = Depends(get_session),
) -> ProjectService:
    return ProjectService(session)


def get_user_service(
    session: AsyncSession = Depends(get_session),
) -> UserService:
    return UserService(session)


def get_document_service(
    session: AsyncSession = Depends(get_session),
) -> DocumentService:
    return DocumentService(session)


def get_workspace_service(
    session: AsyncSession = Depends(get_session),
) -> WorkspaceService:
    return WorkspaceService(session)


# Annotated aliases for cleaner route signatures
TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]
PlanServiceDep = Annotated[PlanService, Depends(get_plan_service)]
ProjectServiceDep = Annotated[ProjectService, Depends(get_project_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
DocumentServiceDep = Annotated[DocumentService, Depends(get_document_service)]
WorkspaceServiceDep = Annotated[WorkspaceService, Depends(get_workspace_service)]
