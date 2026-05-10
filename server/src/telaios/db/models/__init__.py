"""SQLAlchemy ORM models registry.

All models are imported here so :data:`telaios.db.base.Base.metadata`
contains every table when Alembic runs autogenerate.
"""

from telaios.db.models.app_settings import AppSettings
from telaios.db.models.documents import (
    Document,
    DocumentActivity,
    DocumentChunk,
    DocumentComment,
    DocumentFavorite,
    DocumentFolder,
    DocumentTag,
    DocumentTemplate,
    DocumentVersion,
)
from telaios.db.models.environments import Environment, HelmRelease
from telaios.db.models.library import (
    LibraryAgent,
    LibraryMCP,
    LibrarySkill,
    LibrarySkillFile,
)
from telaios.db.models.plans import Message, Plan
from telaios.db.models.projects import Project, ProjectAgent, ProjectMember
from telaios.db.models.repositories import Repository
from telaios.db.models.tasks import (
    Task,
    TaskArtifact,
    TaskDependency,
    TaskRepository,
)
from telaios.db.models.users import User
from telaios.db.models.workspaces import Workspace

__all__ = [
    "AppSettings",
    "Document",
    "DocumentActivity",
    "DocumentChunk",
    "DocumentComment",
    "DocumentFavorite",
    "DocumentFolder",
    "DocumentTag",
    "DocumentTemplate",
    "DocumentVersion",
    "Environment",
    "HelmRelease",
    "LibraryAgent",
    "LibraryMCP",
    "LibrarySkill",
    "LibrarySkillFile",
    "Message",
    "Plan",
    "Project",
    "ProjectAgent",
    "ProjectMember",
    "Repository",
    "Task",
    "TaskArtifact",
    "TaskDependency",
    "TaskRepository",
    "User",
    "Workspace",
]
