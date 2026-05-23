"""Domain value objects — strongly-typed Pydantic wrappers for primitive types.

Value objects are immutable, equality-comparable by value, and carry domain
validation. They eliminate primitive obsession and prevent ID confusion
(passing a ``TaskId`` where a ``PlanId`` is expected becomes a type error).

All value objects are hashable and can serve as dict keys.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from pydantic import BaseModel, PlainSerializer, PlainValidator, WithJsonSchema

# ── UUID-based IDs ────────────────────────────────────────────────────────────


class EntityId(BaseModel):
    """Base class for all UUID-backed domain identifiers."""

    value: uuid.UUID

    def __str__(self) -> str:
        return str(self.value)

    def __hash__(self) -> int:
        return hash(self.value)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, EntityId):
            return self.value == other.value
        if isinstance(other, uuid.UUID):
            return self.value == other
        return NotImplemented

    @classmethod
    def generate(cls) -> EntityId:
        return cls(value=uuid.uuid4())

    def __repr__(self) -> str:
        return f"{type(self).__name__}({self.value!s})"


class TaskId(EntityId):
    """Domain identifier for a Task."""


class PlanId(EntityId):
    """Domain identifier for a Plan."""


class ProjectId(EntityId):
    """Domain identifier for a Project."""


class UserId(EntityId):
    """Domain identifier for a User."""


class RepositoryId(EntityId):
    """Domain identifier for a Repository."""


class WorkspaceId(EntityId):
    """Domain identifier for a Workspace."""


class EnvironmentId(EntityId):
    """Domain identifier for an Environment."""


class MessageId(EntityId):
    """Domain identifier for a Message."""


class DocumentId(EntityId):
    """Domain identifier for a Document."""


class ArtifactId(EntityId):
    """Domain identifier for a TaskArtifact."""


class CommentId(EntityId):
    """Domain identifier for a DocumentComment."""


# ── Non-UUID IDs ──────────────────────────────────────────────────────────────


class AgentProfileId(BaseModel):
    """Domain identifier for an AgentProfile (string-based)."""

    value: str

    def __str__(self) -> str:
        return self.value

    def __hash__(self) -> int:
        return hash(self.value)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, AgentProfileId):
            return self.value == other.value
        if isinstance(other, str):
            return self.value == other
        return NotImplemented

    def __repr__(self) -> str:
        return f"AgentProfileId({self.value!r})"


# ── Non-ID value objects ──────────────────────────────────────────────────────


class Email(BaseModel):
    """A validated email address."""

    value: str

    def __str__(self) -> str:
        return self.value

    def __hash__(self) -> int:
        return hash(self.value.lower())

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Email):
            return self.value.lower() == other.value.lower()
        return NotImplemented

    def __repr__(self) -> str:
        return f"Email({self.value!r})"


class DisplayName(BaseModel):
    """A non-empty display name (1-100 chars)."""

    value: str

    def __str__(self) -> str:
        return self.value

    def __eq__(self, other: object) -> bool:
        if isinstance(other, DisplayName):
            return self.value == other.value
        return NotImplemented

    def __hash__(self) -> int:
        return hash(self.value)


# ── Annotated types for FastAPI / Pydantic integration ────────────────────────
# These allow FastAPI path parameters to auto-parse UUIDs into value objects.


def _to_uuid(v: Any) -> uuid.UUID:
    if isinstance(v, uuid.UUID):
        return v
    if isinstance(v, str):
        return uuid.UUID(v)
    raise ValueError(f"Cannot convert {type(v).__name__} to UUID")


def _entity_id_factory(cls: type[EntityId]) -> Any:
    """Create an Annotated type that accepts UUIDs and produces EntityId instances."""

    def _from_uuid(v: Any) -> EntityId:
        if isinstance(v, cls):
            return v
        return cls(value=_to_uuid(v))

    def _serialize(v: EntityId) -> str:
        return str(v.value)

    return Annotated[
        cls,
        PlainValidator(_from_uuid),
        PlainSerializer(_serialize, return_type=str),
        WithJsonSchema({"type": "string", "format": "uuid"}),
    ]


# Usage: ``task_id: AnnotatedTaskId`` in FastAPI route params
AnnotatedTaskId = _entity_id_factory(TaskId)
AnnotatedPlanId = _entity_id_factory(PlanId)
AnnotatedProjectId = _entity_id_factory(ProjectId)
AnnotatedUserId = _entity_id_factory(UserId)
AnnotatedRepositoryId = _entity_id_factory(RepositoryId)
AnnotatedWorkspaceId = _entity_id_factory(WorkspaceId)
AnnotatedEnvironmentId = _entity_id_factory(EnvironmentId)
AnnotatedMessageId = _entity_id_factory(MessageId)
AnnotatedDocumentId = _entity_id_factory(DocumentId)
AnnotatedArtifactId = _entity_id_factory(ArtifactId)
AnnotatedCommentId = _entity_id_factory(CommentId)
