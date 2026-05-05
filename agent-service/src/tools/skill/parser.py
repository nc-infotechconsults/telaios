"""
src/tools/skill/parser.py
-------------------------
Parse SKILL.md files extracting YAML frontmatter and markdown content.

Uses python-frontmatter to handle both the YAML frontmatter parsing
and the markdown body extraction.

Sources
~~~~~~~
- python-frontmatter: https://pypi.org/project/python-frontmatter/
- YAML spec: https://yaml.org/spec/1.2.2/
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from tools.skill.types import (
    SkillFrontmatter,
    SkillManifest,
    SkillScript,
    SkillValidationResult,
)

logger = logging.getLogger(__name__)


class SkillParseError(Exception):
    """Raised when SKILL.md parsing fails."""

    pass


def parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    """
    Parse YAML frontmatter from markdown content.

    Args:
        content: Raw SKILL.md content.

    Returns:
        Tuple of (frontmatter_dict, markdown_body).

    Raises:
        SkillParseError: If frontmatter cannot be parsed.
    """
    try:
        import frontmatter
    except ImportError:
        return _parse_frontmatter_fallback(content)

    try:
        post = frontmatter.loads(content)
        return dict(post), str(post.content)
    except Exception as exc:
        raise SkillParseError(f"Failed to parse frontmatter: {exc}") from exc


def _parse_frontmatter_fallback(content: str) -> tuple[dict[str, Any], str]:
    """Parse simple YAML frontmatter without optional python-frontmatter."""
    if not content.startswith("---"):
        return {}, content

    parts = content.split("---", 2)
    if len(parts) < 3:
        raise SkillParseError("Unclosed YAML frontmatter")

    metadata: dict[str, Any] = {}
    for raw_line in parts[1].splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = _parse_yaml_scalar(value.strip())
    return metadata, parts[2]


def _parse_yaml_scalar(value: str) -> Any:
    if value.startswith("[") and value.endswith("]"):
        raw_items = value[1:-1].strip()
        if not raw_items:
            return []
        return [item.strip().strip('"\'') for item in raw_items.split(",")]
    return value.strip('"\'')


def parse_skill_md(content: str, root_path: str) -> SkillManifest:
    """
    Parse SKILL.md content into a SkillManifest.

    Args:
        content: Raw SKILL.md file content.
        root_path: Path to the skill's root directory.

    Returns:
        Populated SkillManifest.

    Raises:
        SkillParseError: If the file cannot be parsed or is missing required fields.
    """
    frontmatter_dict, markdown_body = parse_frontmatter(content)

    name = frontmatter_dict.get("name")
    if not name:
        raise SkillParseError("SKILL.md is missing required 'name' field in frontmatter")

    description = frontmatter_dict.get("description")
    if not description:
        raise SkillParseError(
            "SKILL.md is missing required 'description' field in frontmatter"
        )

    frontmatter_obj = SkillFrontmatter(
        name=name,
        description=description,
        version=frontmatter_dict.get("version"),
        tags=frontmatter_dict.get("tags", []),
        author=frontmatter_dict.get("author"),
        triggers=frontmatter_dict.get("triggers", []),
    )

    readme_path = Path(root_path) / "SKILL.md"
    scripts_dir = Path(root_path) / "scripts"
    scripts: list[SkillScript] = []

    if scripts_dir.exists() and scripts_dir.is_dir():
        for script_path in sorted(scripts_dir.iterdir()):
            if script_path.is_file() and script_path.suffix == ".sh":
                scripts.append(
                    SkillScript(
                        name=script_path.name,
                        path=str(script_path),
                        description=None,
                        arguments=[],
                    )
                )

    return SkillManifest(
        frontmatter=frontmatter_obj,
        instructions=markdown_body.strip(),
        scripts=scripts,
        root_path=str(Path(root_path).resolve()),
        readme_path=str(readme_path.resolve()),
    )


def parse_skill_file(file_path: str | Path) -> SkillManifest:
    """
    Parse a SKILL.md file from the filesystem.

    Args:
        file_path: Path to the SKILL.md file or the skill directory.

    Returns:
        Populated SkillManifest.

    Raises:
        SkillParseError: If the file cannot be read or parsed.
    """
    path = Path(file_path)

    if path.is_dir():
        skill_path = path
        readme_path = path / "SKILL.md"
    else:
        skill_path = path.parent
        readme_path = path

    if not readme_path.exists():
        raise SkillParseError(f"SKILL.md not found at {readme_path}")

    try:
        content = readme_path.read_text(encoding="utf-8")
    except Exception as exc:
        raise SkillParseError(f"Failed to read {readme_path}: {exc}") from exc

    return parse_skill_md(content, str(skill_path))


def parse_skill_manifest(file_path: str | Path) -> SkillManifest:
    """Compatibility alias for parsing a SKILL.md manifest file."""
    return parse_skill_file(file_path)


def scan_skill_directory(directory: str | Path) -> SkillValidationResult:
    """
    Scan a skill directory and attempt to parse it.

    Returns a validation result indicating whether the skill is valid,
    along with any errors or warnings.

    Args:
        directory: Path to the skill directory.

    Returns:
        SkillValidationResult with validation status and any errors.
    """
    path = Path(directory)
    errors: list[str] = []
    warnings: list[str] = []

    if not path.exists():
        return SkillValidationResult(
            is_valid=False,
            errors=[f"Directory does not exist: {path}"],
        )

    if not path.is_dir():
        return SkillValidationResult(
            is_valid=False,
            errors=[f"Path is not a directory: {path}"],
        )

    readme_path = path / "SKILL.md"
    if not readme_path.exists():
        errors.append("SKILL.md file not found")

    scripts_dir = path / "scripts"
    if not scripts_dir.exists():
        warnings.append("scripts/ directory not found (optional but recommended)")
    elif not scripts_dir.is_dir():
        errors.append("scripts/ exists but is not a directory")

    if errors:
        return SkillValidationResult(
            is_valid=False,
            errors=errors,
            warnings=warnings,
        )

    try:
        manifest = parse_skill_file(path)
        return SkillValidationResult(
            is_valid=True,
            manifest=manifest,
            warnings=warnings,
        )
    except SkillParseError as exc:
        return SkillValidationResult(
            is_valid=False,
            errors=[str(exc)],
            warnings=warnings,
        )
