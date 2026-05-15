"""Repository for design chat persistence."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.design_chat import DesignArtifact, DesignMessage, DesignSession


class DesignSessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_project(self, project_id: uuid.UUID) -> list[DesignSession]:
        result = await self._s.execute(
            select(DesignSession)
            .where(DesignSession.project_id == project_id, DesignSession.deleted_at.is_(None))
            .order_by(DesignSession.updated_at.desc())
        )
        return list(result.scalars().all())

    async def find(self, session_id: uuid.UUID) -> DesignSession | None:
        result = await self._s.execute(
            select(DesignSession).where(
                DesignSession.id == session_id, DesignSession.deleted_at.is_(None)
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        project_id: uuid.UUID,
        title: str | None,
        designer_agent_id: uuid.UUID | None = None,
        status: str = "active",
    ) -> DesignSession:
        obj = DesignSession(
            project_id=project_id,
            title=title,
            designer_agent_id=designer_agent_id,
            status=status,
        )
        self._s.add(obj)
        await self._s.flush()
        await self._s.refresh(obj)
        return obj

    async def save(self, obj: DesignSession) -> DesignSession:
        await self._s.flush()
        await self._s.refresh(obj)
        return obj


class DesignMessageRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_session(self, session_id: uuid.UUID) -> list[DesignMessage]:
        result = await self._s.execute(
            select(DesignMessage)
            .where(DesignMessage.session_id == session_id, DesignMessage.deleted_at.is_(None))
            .order_by(DesignMessage.created_at)
        )
        return list(result.scalars().all())

    async def create(self, *, session_id: uuid.UUID, role: str, content: str) -> DesignMessage:
        obj = DesignMessage(session_id=session_id, role=role, content=content)
        self._s.add(obj)
        await self._s.flush()
        await self._s.refresh(obj)
        return obj


class DesignArtifactRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_session(self, session_id: uuid.UUID) -> list[DesignArtifact]:
        result = await self._s.execute(
            select(DesignArtifact)
            .where(DesignArtifact.session_id == session_id, DesignArtifact.deleted_at.is_(None))
            .order_by(DesignArtifact.revision)
        )
        return list(result.scalars().all())

    async def next_revision(self, session_id: uuid.UUID) -> int:
        result = await self._s.execute(
            select(func.max(DesignArtifact.revision)).where(
                DesignArtifact.session_id == session_id, DesignArtifact.deleted_at.is_(None)
            )
        )
        current = result.scalar_one_or_none()
        return int(current or 0) + 1

    async def create(
        self,
        *,
        session_id: uuid.UUID,
        revision: int,
        title: str,
        description: str | None,
        html_content: str,
        css_content: str | None,
        js_content: str | None,
        prompt: str | None,
        rationale: str | None,
        artifact_metadata: dict[str, object] | None,
    ) -> DesignArtifact:
        obj = DesignArtifact(
            session_id=session_id,
            revision=revision,
            title=title,
            description=description,
            html_content=html_content,
            css_content=css_content,
            js_content=js_content,
            prompt=prompt,
            rationale=rationale,
            artifact_metadata=artifact_metadata,
        )
        self._s.add(obj)
        await self._s.flush()
        await self._s.refresh(obj)
        return obj


__all__ = [
    "DesignArtifactRepository",
    "DesignMessageRepository",
    "DesignSessionRepository",
]
