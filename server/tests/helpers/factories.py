"""Entity factories for integration tests.

All factory functions are *async* and accept an ``AsyncSession``.  Use the
``db`` fixture from ``tests/integration/modules/conftest.py`` to call them
from synchronous pytest test functions::

    def test_something(client, db):
        user = db(lambda s: create_user(s, email="alice@test.com"))
        project = db(lambda s: create_project(s, owner_id=user.id))
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.jwt import issue_token
from telaios.auth.password import hash_password
from telaios.db.models.environments import Environment
from telaios.db.models.library import LibraryAgent, LibraryMCP, LibrarySkill
from telaios.db.models.plans import Message, Plan
from telaios.db.models.projects import Project, ProjectMember
from telaios.db.models.repositories import Repository
from telaios.db.models.tasks import Task
from telaios.db.models.users import User
from telaios.db.models.workspaces import Workspace


async def create_user(
    session: AsyncSession,
    *,
    email: str = "user@test.com",
    password: str = "password123",
    display_name: str = "Test User",
    system_role: str = "member",
    is_active: bool = True,
) -> User:
    """Insert a user row and return the refreshed ORM instance."""
    user = User(
        email=email.lower(),
        password_hash=hash_password(password),
        display_name=display_name,
        system_role=system_role,
        is_active=is_active,
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return user


async def create_project(
    session: AsyncSession,
    name: str = "Test Project",
    owner_id: uuid.UUID | None = None,
) -> Project:
    """Insert a project and optionally add ``owner_id`` as ``owner`` member."""
    project = Project(name=name)
    session.add(project)
    await session.flush()

    if owner_id is not None:
        member = ProjectMember(user_id=owner_id, project_id=project.id, role="owner")
        session.add(member)
        await session.flush()

    await session.refresh(project)
    return project


async def create_project_member(
    session: AsyncSession,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    role: str = "viewer",
) -> ProjectMember:
    """Insert a ``ProjectMember`` row."""
    member = ProjectMember(user_id=user_id, project_id=project_id, role=role)
    session.add(member)
    await session.flush()
    return member


async def create_workspace(
    session: AsyncSession,
    project_id: uuid.UUID,
    *,
    name: str = "Test Workspace",
    created_by: uuid.UUID | None = None,
) -> Workspace:
    """Insert a workspace row and return the refreshed ORM instance."""
    workspace = Workspace(
        project_id=project_id,
        name=name,
        created_by=created_by,
        config={},
    )
    session.add(workspace)
    await session.flush()
    await session.refresh(workspace)
    return workspace


async def create_environment(
    session: AsyncSession,
    project_id: uuid.UUID,
    *,
    name: str = "Test Environment",
    env_type: str = "kubernetes",
    created_by: uuid.UUID | None = None,
) -> Environment:
    """Insert an ``Environment`` row."""
    env = Environment(
        project_id=project_id,
        name=name,
        type=env_type,  # type: ignore[arg-type]
        status="disconnected",
        created_by=created_by,
    )
    session.add(env)
    await session.flush()
    await session.refresh(env)
    return env


async def create_library_agent(
    session: AsyncSession,
    *,
    slug: str = "test-agent",
    name: str = "Test Agent",
) -> LibraryAgent:
    """Insert a ``LibraryAgent`` row."""
    agent = LibraryAgent(
        slug=slug,
        name=name,
        agent_type="custom",
        sub_agents=[],
        mcp_servers=[],
        skills=[],
        tags=[],
    )
    session.add(agent)
    await session.flush()
    await session.refresh(agent)
    return agent


async def create_library_mcp(
    session: AsyncSession,
    *,
    slug: str = "test-mcp",
    name: str = "Test MCP",
) -> LibraryMCP:
    """Insert a ``LibraryMCP`` row."""
    mcp = LibraryMCP(
        slug=slug,
        name=name,
        transport="stdio",
        args=[],
        env={},
        headers={},
        tags=[],
    )
    session.add(mcp)
    await session.flush()
    await session.refresh(mcp)
    return mcp


async def create_library_skill(
    session: AsyncSession,
    *,
    slug: str = "test-skill",
    name: str = "Test Skill",
    content: str = "# Test skill content",
) -> LibrarySkill:
    """Insert a ``LibrarySkill`` row."""
    skill = LibrarySkill(
        slug=slug,
        name=name,
        content=content,
        tags=[],
    )
    session.add(skill)
    await session.flush()
    await session.refresh(skill)
    return skill


def make_token(user: User) -> str:
    """Sign a JWT for ``user`` using the application's configured JWT_SECRET."""
    return issue_token(
        user_id=str(user.id),
        email=user.email,
        system_role=user.system_role,
    )


async def create_plan(
    session: AsyncSession,
    project_id: uuid.UUID,
    *,
    title: str | None = "Test Plan",
    status: str = "draft",
) -> Plan:
    """Insert a ``Plan`` row and return the refreshed ORM instance."""
    plan = Plan(project_id=project_id, title=title, status=status)  # type: ignore[arg-type]
    session.add(plan)
    await session.flush()
    await session.refresh(plan)
    return plan


async def create_task(
    session: AsyncSession,
    plan_id: uuid.UUID,
    *,
    title: str = "Test Task",
    task_type: str = "general",
    status: str = "pending",
    execution_order: int = 0,
) -> Task:
    """Insert a ``Task`` row and return the refreshed ORM instance."""
    task = Task(
        plan_id=plan_id,
        title=title,
        type=task_type,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        execution_order=execution_order,
    )
    session.add(task)
    await session.flush()
    await session.refresh(task)
    return task


async def create_message(
    session: AsyncSession,
    project_id: uuid.UUID,
    *,
    role: str = "user",
    content: str = "Hello",
    plan_id: uuid.UUID | None = None,
) -> Message:
    """Insert a ``Message`` row and return the refreshed ORM instance."""
    msg = Message(
        project_id=project_id,
        plan_id=plan_id,
        role=role,  # type: ignore[arg-type]
        content=content,
    )
    session.add(msg)
    await session.flush()
    await session.refresh(msg)
    return msg


async def create_repository(
    session: AsyncSession,
    project_id: uuid.UUID,
    *,
    name: str = "test-repo",
    remote_url: str | None = "https://github.com/org/repo",
    branch: str = "main",
    provider_type: str = "git",
    auth_type: str = "none",
    status: str = "ready",
) -> Repository:
    """Insert a ``Repository`` row and return the refreshed ORM instance."""
    repo = Repository(
        project_id=project_id,
        name=name,
        remote_url=remote_url,
        branch=branch,
        provider_type=provider_type,  # type: ignore[arg-type]
        auth_type=auth_type,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
    )
    session.add(repo)
    await session.flush()
    await session.refresh(repo)
    return repo


__all__ = [
    "create_environment",
    "create_library_agent",
    "create_library_mcp",
    "create_library_skill",
    "create_message",
    "create_plan",
    "create_project",
    "create_project_member",
    "create_repository",
    "create_task",
    "create_user",
    "create_workspace",
    "make_token",
]
