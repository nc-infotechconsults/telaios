"""
src/tools/skill/types.py
------------------------
Pydantic models for skill file representation.

These types represent skills loaded from the filesystem,
including SKILL.md frontmatter, instructions, and scripts.

Based on the OpenCode skill specification from AGENTS.md:
- skills/{skill-name}/SKILL.md (required: skill definition)
- skills/{skill-name}/scripts/{script-name}.sh (required: executable scripts)
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SkillFrontmatter(BaseModel):
    """YAML frontmatter parsed from SKILL.md."""

    name: str = Field(..., description="Skill name in kebab-case")
    description: str = Field(..., max_length=200, description="One-line description")
    version: str | None = Field(default="1.0.0", description="Semver version")
    tags: list[str] = Field(default_factory=list, description="Tags for categorization")
    author: str | None = Field(default=None, description="Author name")
    triggers: list[str] = Field(
        default_factory=list,
        description="Trigger phrases that activate this skill",
    )


class SkillScript(BaseModel):
    """A single executable script in a skill."""

    name: str = Field(..., description="Script filename (e.g., 'deploy.sh')")
    path: str = Field(..., description="Absolute path to the script")
    description: str | None = Field(default=None, description="Script purpose")
    arguments: list[str] = Field(
        default_factory=list,
        description="Expected argument names in order",
    )


class SkillManifest(BaseModel):
    """
    Complete skill manifest parsed from a skill directory.

    Combines the SKILL.md frontmatter, the markdown body (instructions),
    and the scripts directory contents.
    """

    frontmatter: SkillFrontmatter
    instructions: str = Field(..., description="Full markdown instructions body")
    scripts: list[SkillScript] = Field(default_factory=list)
    root_path: str = Field(..., description="Path to the skill directory")
    readme_path: str = Field(..., description="Path to the SKILL.md file")

    @property
    def name(self) -> str:
        return self.frontmatter.name

    @property
    def description(self) -> str:
        return self.frontmatter.description

    @property
    def version(self) -> str:
        return self.frontmatter.version or "1.0.0"


class SkillFile(BaseModel):
    """Represents a single file within a skill directory."""

    name: str
    path: str
    is_executable: bool = False
    size_bytes: int | None = None


class SkillDirectory(BaseModel):
    """
    Represents a skill directory on the filesystem.

    Used for scanning and validation purposes.
    """

    name: str = Field(..., description="Skill directory name (kebab-case)")
    path: str = Field(..., description="Absolute path to the skill directory")
    readme_exists: bool = Field(default=False, description="SKILL.md exists")
    scripts_dir_exists: bool = Field(default=False, description="scripts/ directory exists")
    scripts: list[SkillFile] = Field(default_factory=list)
    validation_errors: list[str] = Field(default_factory=list)
    validation_warnings: list[str] = Field(default_factory=list)


class SkillValidationResult(BaseModel):
    """Result of validating a skill directory."""

    is_valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    manifest: SkillManifest | None = None