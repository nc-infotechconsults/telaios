"""Project skills service."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.library import LibrarySkill
from telaios.db.models.project_resources import ProjectSkill
from telaios.modules.projects.skills.schemas import (
    ProjectSkillCreate,
    ProjectSkillPatch,
    ProjectSkillRead,
)
from telaios.utils.errors import NotFoundError


class ProjectSkillService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_skills(self, project_id: uuid.UUID) -> list[ProjectSkillRead]:
        stmt = (
            select(ProjectSkill)
            .where(ProjectSkill.project_id == project_id, ProjectSkill.deleted_at.is_(None))
            .order_by(ProjectSkill.name)
        )
        result = await self._session.execute(stmt)
        return [ProjectSkillRead.model_validate(s) for s in result.scalars().all()]

    async def get_skill(self, project_id: uuid.UUID, skill_id: uuid.UUID) -> ProjectSkillRead:
        skill = await self._get_orm(project_id, skill_id)
        return ProjectSkillRead.model_validate(skill)

    async def create_skill(
        self, project_id: uuid.UUID, body: ProjectSkillCreate
    ) -> ProjectSkillRead:
        skill = ProjectSkill(
            project_id=project_id,
            name=body.name,
            slug=body.slug,
            description=body.description,
            content=body.content,
        )
        self._session.add(skill)
        await self._session.commit()
        await self._session.refresh(skill)
        return ProjectSkillRead.model_validate(skill)

    async def patch_skill(
        self, project_id: uuid.UUID, skill_id: uuid.UUID, body: ProjectSkillPatch
    ) -> ProjectSkillRead:
        skill = await self._get_orm(project_id, skill_id)
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(skill, field, value)
        await self._session.commit()
        await self._session.refresh(skill)
        return ProjectSkillRead.model_validate(skill)

    async def delete_skill(self, project_id: uuid.UUID, skill_id: uuid.UUID) -> None:
        skill = await self._get_orm(project_id, skill_id)
        skill.deleted_at = datetime.now(UTC)
        await self._session.commit()

    async def clone_from_library(
        self, project_id: uuid.UUID, library_skill_id: uuid.UUID
    ) -> ProjectSkillRead:
        result = await self._session.execute(
            select(LibrarySkill).where(
                LibrarySkill.id == library_skill_id,
                LibrarySkill.deleted_at.is_(None),
            )
        )
        lib_skill = result.scalar_one_or_none()
        if lib_skill is None:
            raise NotFoundError("Library skill not found")
        skill = ProjectSkill(
            project_id=project_id,
            name=lib_skill.name,
            slug=lib_skill.slug,
            description=lib_skill.description,
            content=lib_skill.content,
            cloned_from_library_skill_id=library_skill_id,
        )
        self._session.add(skill)
        await self._session.commit()
        await self._session.refresh(skill)
        return ProjectSkillRead.model_validate(skill)

    async def _get_orm(self, project_id: uuid.UUID, skill_id: uuid.UUID) -> ProjectSkill:
        stmt = select(ProjectSkill).where(
            ProjectSkill.id == skill_id,
            ProjectSkill.project_id == project_id,
            ProjectSkill.deleted_at.is_(None),
        )
        result = await self._session.execute(stmt)
        skill = result.scalar_one_or_none()
        if skill is None:
            raise NotFoundError("Project skill not found")
        return skill
