"""Domain entities — pure Pydantic models representing core business concepts.

These are the source of truth for the domain model. They are:
- **Framework-agnostic**: no SQLAlchemy, no FastAPI, no LangChain imports
- **Pydantic-native**: validation, serialization, JSON schema via Pydantic
- **Behaviour-rich**: domain logic (state transitions, invariants) lives here

Repositories return these entities; services orchestrate them; API schemas
decorate them with from_attributes / pagination wrappers.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from telaios.domain.enums import (
    AgentRole,
    ArtifactType,
    DocumentStatus,
    PlanStatus,
    ProjectRole,
    ProjectStatus,
    SystemRole,
    TaskStatus,
    TaskType,
    WorkspaceStatus,
)
from telaios.domain.values import (
    AgentProfileId,
    ArtifactId,
    DocumentId,
    PlanId,
    ProjectId,
    RepositoryId,
    TaskId,
    UserId,
    WorkspaceId,
)

# ── Project ───────────────────────────────────────────────────────────────────


class Project(BaseModel):
    """A project that groups plans, tasks, documents, and members."""

    model_config = ConfigDict(frozen=True)

    id: ProjectId
    name: str
    description: str | None = None
    status: ProjectStatus = ProjectStatus.PLANNING
    created_at: datetime | None = None


class ProjectMember(BaseModel):
    """Membership of a User in a Project with a specific role."""

    model_config = ConfigDict(frozen=True)

    user_id: UserId
    project_id: ProjectId
    role: ProjectRole
    joined_at: datetime | None = None


# ── Task ──────────────────────────────────────────────────────────────────────


class Task(BaseModel):
    """A unit of work within a Plan."""

    model_config = ConfigDict(frozen=True)

    id: TaskId
    plan_id: PlanId
    title: str
    description: str | None = None
    type: TaskType = TaskType.GENERAL
    status: TaskStatus = TaskStatus.PENDING
    execution_order: int = 0
    agent_profile_id: AgentProfileId | None = None
    assigned_instance_id: str | None = None
    result: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    task_metadata: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    repository_ids: list[RepositoryId] = []
    depends_on_task_ids: list[TaskId] = []

    def retry(self) -> Task:
        """Return a new Task with status reset to PENDING (retryable only)."""
        if not self.status.is_retryable:
            raise ValueError(
                f"Cannot retry task {self.id}: status is {self.status.value}"
            )
        return self.model_copy(update={"status": TaskStatus.PENDING})

    def cancel(self) -> Task:
        """Return a new Task with status CANCELLED."""
        if not self.status.is_cancellable:
            raise ValueError(
                f"Cannot cancel task {self.id}: status is {self.status.value}"
            )
        return self.model_copy(update={"status": TaskStatus.CANCELLED})

    def start(self) -> Task:
        """Transition to IN_PROGRESS."""
        if self.status != TaskStatus.READY:
            raise ValueError(
                f"Cannot start task {self.id}: status is {self.status.value}"
            )
        return self.model_copy(
            update={"status": TaskStatus.IN_PROGRESS, "started_at": datetime.now()}
        )

    def complete(self, result: str | None = None) -> Task:
        """Transition to DONE."""
        return self.model_copy(
            update={
                "status": TaskStatus.DONE,
                "result": result,
                "completed_at": datetime.now(),
            }
        )

    def mark_failed(self, result: str | None = None) -> Task:
        """Transition to FAILED."""
        return self.model_copy(
            update={
                "status": TaskStatus.FAILED,
                "result": result,
                "completed_at": datetime.now(),
            }
        )


class TaskArtifact(BaseModel):
    """An output artifact produced by a task execution."""

    model_config = ConfigDict(frozen=True)

    id: ArtifactId
    task_id: TaskId
    type: ArtifactType
    title: str
    content: str
    content_type: str = "text/plain"
    artifact_metadata: dict[str, Any] | None = None
    sort_order: int = 0
    created_at: datetime | None = None


# ── Plan ──────────────────────────────────────────────────────────────────────


class Plan(BaseModel):
    """An execution plan that groups tasks within a project."""

    model_config = ConfigDict(frozen=True)

    id: PlanId
    project_id: ProjectId
    title: str | None = None
    status: PlanStatus = PlanStatus.DRAFT
    confirmed_at: datetime | None = None
    failure_reason: str | None = None
    created_at: datetime | None = None

    def confirm(self) -> Plan:
        """Transition to CONFIRMED."""
        if self.status != PlanStatus.DRAFT:
            raise ValueError(
                f"Cannot confirm plan {self.id}: status is {self.status.value}"
            )
        return self.model_copy(
            update={
                "status": PlanStatus.CONFIRMED,
                "confirmed_at": datetime.now(),
            }
        )

    def start_execution(self) -> Plan:
        """Transition to EXECUTING."""
        if self.status != PlanStatus.CONFIRMED:
            raise ValueError(
                f"Cannot start plan {self.id}: status is {self.status.value}"
            )
        return self.model_copy(update={"status": PlanStatus.EXECUTING})

    def complete(self) -> Plan:
        """Transition to COMPLETED."""
        return self.model_copy(update={"status": PlanStatus.COMPLETED})

    def mark_failed(self, reason: str | None = None) -> Plan:
        """Transition to FAILED."""
        return self.model_copy(
            update={"status": PlanStatus.FAILED, "failure_reason": reason}
        )


# ── User ──────────────────────────────────────────────────────────────────────


class User(BaseModel):
    """A user of the system."""

    model_config = ConfigDict(frozen=True)

    id: UserId
    email: str
    display_name: str
    system_role: SystemRole = SystemRole.MEMBER
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ── Workspace ─────────────────────────────────────────────────────────────────


class Workspace(BaseModel):
    """A development workspace (containerized environment)."""

    model_config = ConfigDict(frozen=True)

    id: WorkspaceId
    project_id: ProjectId
    name: str
    status: WorkspaceStatus = WorkspaceStatus.IDLE
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ── Document ──────────────────────────────────────────────────────────────────


class Document(BaseModel):
    """A document stored in the system."""

    model_config = ConfigDict(frozen=True)

    id: DocumentId
    project_id: ProjectId
    filename: str
    status: DocumentStatus = DocumentStatus.UPLOADING
    file_type: str | None = None
    file_size: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def mark_ready(self) -> Document:
        """Transition to READY status."""
        return self.model_copy(update={"status": DocumentStatus.READY})

    def mark_error(self) -> Document:
        """Transition to ERROR status."""
        return self.model_copy(update={"status": DocumentStatus.ERROR})


# ── Agent Profile ─────────────────────────────────────────────────────────────


class AgentProfile(BaseModel):
    """Configuration profile for an AI agent."""

    model_config = ConfigDict(frozen=True)

    id: AgentProfileId
    name: str
    role: AgentRole = AgentRole.CUSTOM
    system_prompt: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
