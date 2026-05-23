"""Contracts package — service ABCs and FastAPI DI factories.

This package sits between ``domain`` (pure types) and ``modules`` (implementations).
It can import from both, providing the glue between domain contracts and
concrete service implementations.
"""

from telaios.contracts.dependencies import (
    DocumentServiceDep,
    PlanServiceDep,
    ProjectServiceDep,
    TaskServiceDep,
    UserServiceDep,
    WorkspaceServiceDep,
    get_document_service,
    get_plan_service,
    get_project_service,
    get_task_service,
    get_user_service,
    get_workspace_service,
)
from telaios.contracts.service import (
    AbstractDocumentService,
    AbstractPlanService,
    AbstractProjectService,
    AbstractTaskService,
    AbstractUserService,
    AbstractWorkspaceService,
)

__all__ = [
    "AbstractDocumentService",
    "AbstractPlanService",
    "AbstractProjectService",
    "AbstractTaskService",
    "AbstractUserService",
    "AbstractWorkspaceService",
    "DocumentServiceDep",
    "PlanServiceDep",
    "ProjectServiceDep",
    "TaskServiceDep",
    "UserServiceDep",
    "WorkspaceServiceDep",
    "get_document_service",
    "get_plan_service",
    "get_project_service",
    "get_task_service",
    "get_user_service",
    "get_workspace_service",
]
