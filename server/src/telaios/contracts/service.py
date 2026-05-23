"""Service abstract base classes — contracts for business-logic services.

Each ABC defines the public interface that concrete service implementations
must satisfy. This enables:
- Contract-first development (write the interface, then implement)
- Testability (mock or fake the ABC in tests)
- Service swapping (e.g., TaskService ↔ CachedTaskService)
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod

from telaios.modules.documents.schemas import DocumentPatch, DocumentRead
from telaios.modules.plans.schemas import PlanCreate, PlanPatch, PlanRead
from telaios.modules.projects.schemas import (
    ProjectCreate,
    ProjectListResponse,
    ProjectPatch,
    ProjectQuery,
    ProjectRead,
)
from telaios.modules.tasks.schemas import TaskCreate, TaskPatch, TaskRead
from telaios.modules.users.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserRead,
    UserUpdate,
)
from telaios.modules.workspaces.schemas import WorkspaceCreate, WorkspaceRead, WorkspaceUpdate


class AbstractTaskService(ABC):
    """Contract for task business-logic operations."""

    @abstractmethod
    async def list_by_plan(self, plan_id: uuid.UUID) -> list[TaskRead]: ...

    @abstractmethod
    async def get(self, task_id: uuid.UUID) -> TaskRead: ...

    @abstractmethod
    async def create(self, plan_id: uuid.UUID, dto: TaskCreate) -> TaskRead: ...

    @abstractmethod
    async def patch(self, task_id: uuid.UUID, dto: TaskPatch) -> TaskRead: ...

    @abstractmethod
    async def retry(self, task_id: uuid.UUID) -> TaskRead: ...

    @abstractmethod
    async def cancel(self, task_id: uuid.UUID) -> TaskRead: ...

    @abstractmethod
    async def delete_by_plan(self, plan_id: uuid.UUID) -> int: ...

    @abstractmethod
    async def skip_dependent_tasks(self, task_id: uuid.UUID) -> int: ...

    @abstractmethod
    async def cancel_by_plan(self, plan_id: uuid.UUID) -> int: ...


class AbstractPlanService(ABC):
    """Contract for plan business-logic operations."""

    @abstractmethod
    async def list_by_project(self, project_id: uuid.UUID) -> list[PlanRead]: ...

    @abstractmethod
    async def get(self, plan_id: uuid.UUID) -> PlanRead: ...

    @abstractmethod
    async def create(self, project_id: uuid.UUID, dto: PlanCreate) -> PlanRead: ...

    @abstractmethod
    async def patch(self, plan_id: uuid.UUID, dto: PlanPatch) -> PlanRead: ...

    @abstractmethod
    async def delete(self, plan_id: uuid.UUID) -> None: ...


class AbstractProjectService(ABC):
    """Contract for project business-logic operations."""

    @abstractmethod
    async def list_projects(self, query: ProjectQuery) -> ProjectListResponse: ...

    @abstractmethod
    async def create_project(
        self, dto: ProjectCreate, creator_id: uuid.UUID | None = None
    ) -> ProjectRead: ...

    @abstractmethod
    async def get_project(self, project_id: uuid.UUID) -> ProjectRead: ...

    @abstractmethod
    async def patch_project(
        self, project_id: uuid.UUID, dto: ProjectPatch
    ) -> ProjectRead: ...

    @abstractmethod
    async def delete_project(self, project_id: uuid.UUID) -> None: ...


class AbstractUserService(ABC):
    """Contract for user business-logic operations."""

    @abstractmethod
    async def register(self, req: RegisterRequest) -> TokenResponse: ...

    @abstractmethod
    async def login(self, req: LoginRequest) -> TokenResponse: ...

    @abstractmethod
    async def list_users(self) -> list[UserRead]: ...

    @abstractmethod
    async def get_user(self, user_id: uuid.UUID) -> UserRead: ...

    @abstractmethod
    async def patch_user(self, user_id: uuid.UUID, dto: UserUpdate) -> UserRead: ...

    @abstractmethod
    async def delete_user(self, user_id: uuid.UUID) -> None: ...


class AbstractDocumentService(ABC):
    """Contract for document business-logic operations."""

    @abstractmethod
    async def list_by_project(
        self,
        project_id: uuid.UUID,
        *,
        folder_id: uuid.UUID | None = None,
        status: str | None = None,
    ) -> list[DocumentRead]: ...

    @abstractmethod
    async def get(self, document_id: uuid.UUID) -> DocumentRead: ...

    @abstractmethod
    async def patch(
        self, document_id: uuid.UUID, dto: DocumentPatch
    ) -> DocumentRead: ...

    @abstractmethod
    async def delete(self, document_id: uuid.UUID) -> None: ...

    @abstractmethod
    async def trash(self, document_id: uuid.UUID) -> DocumentRead: ...

    @abstractmethod
    async def restore(self, document_id: uuid.UUID) -> DocumentRead: ...


class AbstractWorkspaceService(ABC):
    """Contract for workspace business-logic operations."""

    @abstractmethod
    async def list_by_project(
        self, project_id: uuid.UUID
    ) -> list[WorkspaceRead]: ...

    @abstractmethod
    async def create(
        self,
        project_id: uuid.UUID,
        dto: WorkspaceCreate,
        created_by: uuid.UUID | None,
    ) -> WorkspaceRead: ...

    @abstractmethod
    async def get(self, workspace_id: uuid.UUID) -> WorkspaceRead: ...

    @abstractmethod
    async def patch(
        self, workspace_id: uuid.UUID, dto: WorkspaceUpdate
    ) -> WorkspaceRead: ...

    @abstractmethod
    async def delete(self, workspace_id: uuid.UUID) -> None: ...
