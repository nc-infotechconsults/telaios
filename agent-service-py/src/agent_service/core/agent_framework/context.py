from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel


class UserContext(BaseModel):
    id: str
    email: str


class RepositoryContext(BaseModel):
    id: str
    fullName: str
    defaultBranch: str
    localPath: str


class ProjectContext(BaseModel):
    id: str
    name: str
    repositories: List[RepositoryContext] = []


class TaskContext(BaseModel):
    id: str
    title: str
    description: str
    type: Literal["code", "test", "review", "knowledge", "infra", "general"]


class AgentContext(BaseModel):
    executionId: str
    project: ProjectContext
    task: Optional[TaskContext] = None
    workspaces: Optional[Dict[str, str]] = None
    triggeredBy: Optional[UserContext] = None
    metadata: Optional[Dict[str, Any]] = None
