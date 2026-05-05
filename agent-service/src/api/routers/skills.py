"""
api/routers/skills.py
---------------------
Skills management API endpoints.

Skill API transport.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from infra.settings import config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/skills", tags=["skills"])


# ── Request/Response Models ───────────────────────────────────────────────────


class SkillSummary(BaseModel):
    """Summary of a skill for list responses."""

    name: str
    description: str
    version: str
    tags: list[str]
    author: str | None = None
    script_count: int = 0


class SkillDetail(SkillSummary):
    """Full skill details including instructions."""

    instructions: str
    scripts: list[dict[str, Any]]
    root_path: str


class SearchResponse(BaseModel):
    """Response for skill search."""

    query: str
    results: list[SkillSummary]
    total: int


class ReloadResponse(BaseModel):
    """Response for skill reload."""

    loaded: int
    errors: list[str]


class InstallRequest(BaseModel):
    """Request to install a skill from a zip file path."""

    zip_path: str
    conflict_policy: str = "overwrite"  # overwrite | skip | error


class InstallResponse(BaseModel):
    """Response for skill installation."""

    success: bool
    skill_name: str | None = None
    target_path: str | None = None
    errors: list[str] | None = None


# ── Helpers ────────────────────────────────────────────────────────────────────


def _get_skill_registry() -> Any:
    """Get the global SkillRegistry instance."""
    from tools.skill.registry import SkillRegistry

    # Use a module-level singleton (created on first access)
    if not hasattr(_get_skill_registry, "_instance"):
        _get_skill_registry._instance = SkillRegistry()
    return _get_skill_registry._instance


def _manifest_to_summary(manifest: Any) -> SkillSummary:
    """Convert a SkillManifest to a SkillSummary."""
    return SkillSummary(
        name=manifest.name,
        description=manifest.description,
        version=manifest.version,
        tags=manifest.frontmatter.tags,
        author=manifest.frontmatter.author,
        script_count=len(manifest.scripts),
    )


def _manifest_to_detail(manifest: Any) -> SkillDetail:
    """Convert a SkillManifest to a SkillDetail."""
    return SkillDetail(
        name=manifest.name,
        description=manifest.description,
        version=manifest.version,
        tags=manifest.frontmatter.tags,
        author=manifest.frontmatter.author,
        script_count=len(manifest.scripts),
        instructions=manifest.instructions,
        scripts=[
            {
                "name": s.name,
                "path": s.path,
                "description": s.description,
                "arguments": s.arguments,
            }
            for s in manifest.scripts
        ],
        root_path=manifest.root_path,
    )


# ── Endpoints ───────────────────────────────────────────────────────────────────


@router.get("")
async def list_skills() -> list[SkillSummary]:
    """List all loaded skills."""
    registry = _get_skill_registry()
    manifests = registry.list()
    return [_manifest_to_summary(m) for m in manifests]


@router.get("/{name}")
async def get_skill(name: str) -> SkillDetail:
    """Get detailed information about a specific skill."""
    registry = _get_skill_registry()
    manifest = registry.get(name)

    if manifest is None:
        raise HTTPException(status_code=404, detail=f"Skill '{name}' not found")

    return _manifest_to_detail(manifest)


@router.get("/{name}/scripts")
async def get_skill_scripts(name: str) -> list[dict[str, Any]]:
    """List all scripts for a skill."""
    registry = _get_skill_registry()
    manifest = registry.get(name)

    if manifest is None:
        raise HTTPException(status_code=404, detail=f"Skill '{name}' not found")

    return [
        {
            "name": s.name,
            "path": s.path,
            "description": s.description,
            "arguments": s.arguments,
        }
        for s in manifest.scripts
    ]


@router.get("/search")
async def search_skills(q: str, limit: int = 10) -> SearchResponse:
    """Search skills by query string."""
    registry = _get_skill_registry()
    results = registry.search(q)

    # registry.search returns SkillManifest objects
    summaries = [_manifest_to_summary(m) for m, _ in results[:limit]]

    return SearchResponse(
        query=q,
        results=summaries,
        total=len(results),
    )


@router.post("/reload")
async def reload_skills() -> ReloadResponse:
    """Reload all skills from the configured skills directory."""
    from tools.skill.loader import SkillDirectoryScanner
    from tools.skill.validator import validate_skill_manifest

    registry = _get_skill_registry()
    registry.clear()

    loaded = 0
    errors: list[str] = []

    directories = [config.SKILLS_DIRECTORY]
    if config.SKILLS_EXTRA_PATHS:
        directories.extend(
            p.strip() for p in config.SKILLS_EXTRA_PATHS.split(",") if p.strip()
        )

    for directory in directories:
        try:
            manifests = SkillDirectoryScanner.scan(directory)
            for manifest in manifests:
                validation = validate_skill_manifest(manifest)
                if validation.is_valid:
                    registry.add(manifest)
                    loaded += 1
                else:
                    errors.extend(validation.errors)
        except Exception as exc:
            errors.append(f"Failed to load from {directory}: {exc}")

    logger.info("Reloaded %d skills from %d directories", loaded, len(directories))

    return ReloadResponse(loaded=loaded, errors=errors)


@router.post("/install")
async def install_skill(request: InstallRequest) -> InstallResponse:
    """Install a skill from a zip file."""
    from tools.skill.packager import SkillInstaller

    installer = SkillInstaller(conflict_policy=request.conflict_policy)  # type: ignore[arg-type]

    result = installer.install_from_zip(
        request.zip_path,
        config.SKILLS_DIRECTORY,
    )

    if result.success:
        # Reload to include the new skill
        registry = _get_skill_registry()
        from tools.skill.loader import SkillDirectoryScanner

        manifests = SkillDirectoryScanner.scan(config.SKILLS_DIRECTORY)
        for manifest in manifests:
            if manifest.name == result.skill_name:
                registry.add(manifest)
                break

    return InstallResponse(
        success=result.success,
        skill_name=result.skill_name,
        target_path=result.target_path,
        errors=result.errors,
    )
