"""
src/tools/skill/validator.py
----------------------------
Validate SKILL.md files against the OpenCode skill specification.

Based on the specification from AGENTS.md:
- Required: skills/{skill-name}/SKILL.md
- Required: skills/{skill-name}/scripts/ with executable scripts
- Name: kebab-case
- Description: max 200 chars
"""

from __future__ import annotations

import re
from pathlib import Path

from telaios.tools.skill.parser import scan_skill_directory
from telaios.tools.skill.types import SkillValidationResult


# Valid kebab-case pattern: lowercase letters, numbers, hyphens
KEBAB_CASE_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MAX_DESCRIPTION_LENGTH = 200


class SkillValidationError(Exception):
    """Raised when a skill validation check fails."""

    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


def validate_name(name: str) -> list[str]:
    """
    Validate skill name format.

    Rules:
    - Must be in kebab-case (lowercase with hyphens)
    - Cannot start or end with a hyphen
    - Must be at least 1 character

    Returns:
        List of validation error messages (empty if valid).
    """
    errors = []

    if not name:
        errors.append("Name is required")
        return errors

    if len(name) > 50:
        errors.append(f"Name too long: {len(name)} chars (max 50)")

    if not KEBAB_CASE_PATTERN.match(name):
        errors.append(
            f"Name must be kebab-case (lowercase letters, numbers, hyphens): "
            f"got '{name}'"
        )

    return errors


def validate_description(description: str | None) -> list[str]:
    """
    Validate skill description.

    Rules:
    - Required (cannot be None or empty)
    - Max 200 characters

    Returns:
        List of validation error messages (empty if valid).
    """
    errors = []

    if not description:
        errors.append("Description is required")
        return errors

    if len(description) > MAX_DESCRIPTION_LENGTH:
        errors.append(
            f"Description too long: {len(description)} chars (max {MAX_DESCRIPTION_LENGTH})"
        )

    return errors


def validate_instructions(instructions: str | None) -> list[str]:
    """
    Validate skill instructions.

    Rules:
    - Required (cannot be None or empty)
    - Must have at least one line of content

    Returns:
        List of validation error messages (empty if valid).
    """
    errors = []

    if not instructions:
        errors.append("Instructions body is required (markdown content after frontmatter)")
        return errors

    stripped = instructions.strip()
    if not stripped:
        errors.append("Instructions body cannot be empty")

    return errors


def validate_version(version: str | None) -> list[str]:
    """
    Validate version string (semver).

    Rules:
    - If provided, must be valid semver (X.Y.Z)
    - Optional (can be None)

    Returns:
        List of validation error messages (empty if valid).
    """
    errors = []

    if version is None:
        return errors

    semver_pattern = re.compile(r"^\d+\.\d+\.\d+$")
    if not semver_pattern.match(version):
        errors.append(
            f"Version must be semver (X.Y.Z): got '{version}'"
        )

    return errors


def validate_scripts(scripts: list[dict]) -> list[str]:
    """
    Validate skill scripts list.

    Rules:
    - At least one script required
    - Each script must have a name ending in .sh

    Returns:
        List of validation error messages (empty if valid).
    """
    errors = []

    if not scripts:
        errors.append("At least one script is required in scripts/ directory")
        return errors

    for script in scripts:
        name = script.get("name", "")
        if not name.endswith(".sh"):
            errors.append(f"Script must end with .sh: got '{name}'")

        path = script.get("path")
        if path:
            path_obj = Path(path)
            if path_obj.exists() and not path_obj.stat().st_mode & 0o111:
                errors.append(f"Script is not executable: {path}")

    return errors


def validate_skill_directory(directory: str | Path) -> SkillValidationResult:
    """
    Validate a skill directory structure.

    Checks:
    - Directory exists and is accessible
    - SKILL.md exists
    - scripts/ directory exists
    - Scripts are executable

    Args:
        directory: Path to the skill directory.

    Returns:
        SkillValidationResult with validation status and any errors/warnings.
    """
    result = scan_skill_directory(directory)

    if not result.is_valid or result.manifest is None:
        return result

    manifest = result.manifest
    errors = list(result.errors)
    warnings = list(result.warnings)

    # Validate name
    name_errors = validate_name(manifest.name)
    errors.extend(name_errors)

    # Validate description
    desc_errors = validate_description(manifest.description)
    errors.extend(desc_errors)

    # Validate instructions
    instr_errors = validate_instructions(manifest.instructions)
    errors.extend(instr_errors)

    # Validate version
    version_errors = validate_version(manifest.version)
    errors.extend(version_errors)

    # Validate scripts exist
    if manifest.scripts:
        for script in manifest.scripts:
            if not Path(script.path).exists():
                errors.append(f"Script file not found: {script.path}")

    return SkillValidationResult(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        manifest=manifest if len(errors) == 0 else None,
    )


def validate_skill_manifest(manifest: "SkillManifest") -> SkillValidationResult:
    """
    Validate an already-parsed SkillManifest.

    Args:
        manifest: Populated SkillManifest to validate.

    Returns:
        SkillValidationResult with validation status and any errors/warnings.
    """
    errors = []
    warnings = []

    # Validate name
    errors.extend(validate_name(manifest.name))

    # Validate description
    errors.extend(validate_description(manifest.description))

    # Validate instructions
    errors.extend(validate_instructions(manifest.instructions))

    # Validate version
    errors.extend(validate_version(manifest.version))

    # Check scripts
    if not manifest.scripts:
        warnings.append("No scripts found (at least one recommended)")

    return SkillValidationResult(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        manifest=manifest if len(errors) == 0 else None,
    )


def validate_skill(manifest: "SkillManifest") -> list[str]:
    """Compatibility helper returning validation errors only."""
    return validate_skill_manifest(manifest).errors
