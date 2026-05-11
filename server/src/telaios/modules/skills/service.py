"""Skills service — thin wrapper over tools.skill.* that resolves the singleton
registry and delegates scanning/install to the underlying tool layer.

No DB access — skills live on the filesystem.
"""

from __future__ import annotations

import logging
from typing import Any

from telaios.config.settings import get_settings

logger = logging.getLogger(__name__)

# ── Registry singleton ─────────────────────────────────────────────────────────

_registry: Any = None


def get_registry() -> Any:
    global _registry
    if _registry is None:
        from telaios.tools.skill.registry import SkillRegistry

        _registry = SkillRegistry()
    return _registry


# ── Helpers ────────────────────────────────────────────────────────────────────


def _manifest_to_summary(m: Any) -> dict[str, Any]:
    return {
        "name": m.name,
        "description": m.description,
        "version": m.version,
        "tags": m.frontmatter.tags,
        "author": m.frontmatter.author,
        "script_count": len(m.scripts),
    }


def _manifest_to_detail(m: Any) -> dict[str, Any]:
    d = _manifest_to_summary(m)
    d.update(
        {
            "instructions": m.instructions,
            "scripts": [
                {
                    "name": s.name,
                    "path": s.path,
                    "description": s.description,
                    "arguments": s.arguments,
                }
                for s in m.scripts
            ],
            "root_path": m.root_path,
        }
    )
    return d


# ── Use cases ──────────────────────────────────────────────────────────────────


def list_skills() -> list[dict[str, Any]]:
    return [_manifest_to_summary(m) for m in get_registry().list()]


def get_skill(name: str) -> dict[str, Any] | None:
    m = get_registry().get(name)
    return _manifest_to_detail(m) if m is not None else None


def get_skill_scripts(name: str) -> list[dict[str, Any]] | None:
    m = get_registry().get(name)
    if m is None:
        return None
    return [
        {
            "name": s.name,
            "path": s.path,
            "description": s.description,
            "arguments": s.arguments,
        }
        for s in m.scripts
    ]


def search_skills(q: str, limit: int = 10) -> dict[str, Any]:
    results = get_registry().search(q)
    summaries = [_manifest_to_summary(m) for m, _ in results[:limit]]
    return {"query": q, "results": summaries, "total": len(results)}


def reload_skills() -> dict[str, Any]:
    from telaios.tools.skill.loader import SkillDirectoryScanner
    from telaios.tools.skill.validator import validate_skill_manifest

    settings = get_settings()
    registry = get_registry()
    registry.clear()

    directories: list[str] = [settings.SKILLS_DIRECTORY]
    if settings.SKILLS_EXTRA_PATHS:
        directories.extend(p.strip() for p in settings.SKILLS_EXTRA_PATHS.split(",") if p.strip())

    loaded = 0
    errors: list[str] = []

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
    return {"loaded": loaded, "errors": errors}


def install_skill(zip_path: str, conflict_policy: str = "overwrite") -> dict[str, Any]:
    from telaios.tools.skill.loader import SkillDirectoryScanner
    from telaios.tools.skill.packager import SkillInstaller

    settings = get_settings()
    installer = SkillInstaller(conflict_policy=conflict_policy)  # type: ignore[arg-type]
    result = installer.install_from_zip(zip_path, settings.SKILLS_DIRECTORY)

    if result.success:
        registry = get_registry()
        manifests = SkillDirectoryScanner.scan(settings.SKILLS_DIRECTORY)
        for manifest in manifests:
            if manifest.name == result.skill_name:
                registry.add(manifest)
                break

    return {
        "success": result.success,
        "skill_name": result.skill_name,
        "target_path": result.target_path,
        "errors": result.errors,
    }


__all__ = [
    "get_registry",
    "get_skill",
    "get_skill_scripts",
    "install_skill",
    "list_skills",
    "reload_skills",
    "search_skills",
]
