"""Skills router.

  GET  /skills
  GET  /skills/search
  GET  /skills/{name}
  GET  /skills/{name}/scripts
  POST /skills/reload
  POST /skills/install

Note: /skills/search and /skills/reload MUST be declared before /skills/{name}
so FastAPI does not treat "search" or "reload" as a name path param.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from telaios.modules.skills.schemas import (
    InstallRequest,
    InstallResponse,
    ReloadResponse,
    SearchResponse,
    SkillDetail,
    SkillSummary,
)
from telaios.modules.skills.service import (
    get_skill,
    get_skill_scripts,
    install_skill,
    list_skills,
    reload_skills,
    search_skills,
)
from telaios.utils.errors import NotFoundError

skills_router = APIRouter(prefix="/skills", tags=["skills"])


@skills_router.get("", response_model=list[SkillSummary])
async def list_skills_endpoint() -> list[dict[str, Any]]:
    """List all loaded skills."""
    return list_skills()


@skills_router.get("/search", response_model=SearchResponse)
async def search_skills_endpoint(
    q: Annotated[str, Query(min_length=1)],
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
) -> dict[str, Any]:
    """Search skills by query string."""
    return search_skills(q, limit)


@skills_router.post("/reload", response_model=ReloadResponse)
async def reload_skills_endpoint() -> dict[str, Any]:
    """Reload all skills from the configured skills directory."""
    return reload_skills()


@skills_router.post("/install", response_model=InstallResponse)
async def install_skill_endpoint(body: InstallRequest) -> dict[str, Any]:
    """Install a skill from a zip file path."""
    return install_skill(body.zip_path, body.conflict_policy)


@skills_router.get("/{name}", response_model=SkillDetail)
async def get_skill_endpoint(name: str) -> dict[str, Any]:
    """Get detailed information about a specific skill."""
    skill = get_skill(name)
    if skill is None:
        raise NotFoundError(f"Skill '{name}' not found")
    return skill


@skills_router.get("/{name}/scripts")
async def get_skill_scripts_endpoint(name: str) -> list[dict[str, Any]]:
    """List all scripts for a skill."""
    scripts = get_skill_scripts(name)
    if scripts is None:
        raise NotFoundError(f"Skill '{name}' not found")
    return scripts
