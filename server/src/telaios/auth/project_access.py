"""Project-level RBAC FastAPI dependencies.

Provides :func:`require_project_access` — a factory returning a dependency
that enforces a minimum project membership role.

Ported from:
  ``data-api/src/middleware/requireProjectAccess.middleware.ts``

Key differences from the TS implementation:
  - Phase 4 scope: only resolves ``project_id`` directly from a path parameter.
    Resolution via plan/task/workspace/environment IDs is added inline in the
    respective module routers (Phase 5/6) or via
    :func:`check_project_membership` called directly.
  - Admin users bypass all project checks (matches TS behaviour).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.db.models.projects import ProjectMember
from telaios.db.session import get_session
from telaios.utils.errors import ForbiddenError

# Role hierarchy: higher index = more permissive / senior role.
_ROLE_ORDER: list[str] = ["viewer", "editor", "owner"]


def _has_min_role(actual: str, minimum: str) -> bool:
    """Return True iff ``actual`` satisfies ``minimum`` in the role hierarchy."""
    try:
        return _ROLE_ORDER.index(actual) >= _ROLE_ORDER.index(minimum)
    except ValueError:
        return False


async def check_project_membership(
    project_id: uuid.UUID,
    principal: Principal,
    session: AsyncSession,
    min_role: str = "viewer",
) -> None:
    """Raise :class:`ForbiddenError` if ``principal`` lacks ``min_role``.

    Admin principals bypass this check.

    Args:
        project_id: UUID of the project to check.
        principal:  Authenticated caller.
        session:    Active DB session.
        min_role:   Minimum role required (``"viewer"``, ``"editor"``, or
                    ``"owner"``).
    """
    if principal.system_role == "admin":
        return

    result = await session.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == uuid.UUID(principal.id),
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise ForbiddenError("Not a member of this project")
    if not _has_min_role(membership.role, min_role):
        raise ForbiddenError("Insufficient project role")


def require_project_access(min_role: str = "viewer") -> Callable[..., object]:
    """Return a FastAPI dependency that enforces ``min_role`` on a project.

    The returned dependency reads ``project_id: uuid.UUID`` from the path
    parameters.  It is safe to use as a route-level ``dependencies=[...]``
    entry or as a ``Depends(...)`` parameter.

    Args:
        min_role: Minimum membership role required (``"viewer"`` / ``"editor"``
                  / ``"owner"``).

    Example::

        @router.get("/{project_id}/items",
                    dependencies=[Depends(require_project_access("viewer"))])
        async def list_items(project_id: uuid.UUID, ...) -> ...:
            ...
    """

    async def _dep(
        project_id: uuid.UUID,
        principal: CurrentPrincipal,
        session: AsyncSession = Depends(get_session),
    ) -> Principal:
        await check_project_membership(project_id, principal, session, min_role)
        return principal

    return _dep


RequireProjectViewer = Annotated[Principal, Depends(require_project_access("viewer"))]
RequireProjectEditor = Annotated[Principal, Depends(require_project_access("editor"))]
RequireProjectOwner = Annotated[Principal, Depends(require_project_access("owner"))]

__all__ = [
    "RequireProjectEditor",
    "RequireProjectOwner",
    "RequireProjectViewer",
    "check_project_membership",
    "require_project_access",
]
