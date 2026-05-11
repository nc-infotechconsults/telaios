"""
src/tools/skill/loader.py
-------------------------
Scan directories for skills and load them into SkillManifest objects.

Sources
~~~~~~~
- OpenCode skill spec: /Users/nicocardone/Desktop/DEV/PERSONALI/telaios/AGENTS.md
"""

from __future__ import annotations

import logging
from pathlib import Path

from telaios.tools.skill.types import SkillManifest, SkillValidationResult
from telaios.tools.skill.validator import validate_skill_directory

logger = logging.getLogger(__name__)


class SkillDirectoryScanner:
    """
    Scan filesystem directories for valid OpenCode skills.

    A valid skill directory contains:
    - SKILL.md (skill definition with YAML frontmatter)
    - scripts/ directory (optional but recommended)
    """

    @staticmethod
    def scan(root_path: str | Path) -> list[SkillManifest]:
        """
        Scan a directory and all subdirectories for valid skills.

        Args:
            root_path: Root directory to scan. Each subdirectory that
                      contains a SKILL.md is treated as a skill.

        Returns:
            List of successfully parsed SkillManifest objects.
        """
        root = Path(root_path)
        manifests: list[SkillManifest] = []

        if not root.exists():
            logger.warning("Skills directory does not exist: %s", root)
            return manifests

        for skill_dir in root.iterdir():
            if not skill_dir.is_dir():
                continue

            readme = skill_dir / "SKILL.md"
            if not readme.exists():
                continue

            result = validate_skill_directory(skill_dir)
            if result.is_valid and result.manifest is not None:
                manifests.append(result.manifest)
                logger.info("Loaded skill: %s from %s", result.manifest.name, skill_dir)
            else:
                logger.warning(
                    "Invalid skill directory %s: %s",
                    skill_dir,
                    "; ".join(result.errors),
                )

        return manifests

    @staticmethod
    def scan_with_validation(root_path: str | Path) -> list[SkillValidationResult]:
        """
        Scan a directory and return full validation results.

        Useful for debugging and reporting.
        """
        root = Path(root_path)
        results: list[SkillValidationResult] = []

        if not root.exists():
            logger.warning("Skills directory does not exist: %s", root)
            return results

        for skill_dir in root.iterdir():
            if not skill_dir.is_dir():
                continue

            readme = skill_dir / "SKILL.md"
            if not readme.exists():
                continue

            result = validate_skill_directory(skill_dir)
            results.append(result)

        return results

    @staticmethod
    def scan_single(skill_dir: str | Path) -> SkillManifest | None:
        """
        Scan a single skill directory.

        Args:
            skill_dir: Path to the skill directory.

        Returns:
            SkillManifest if valid, None otherwise.
        """
        result = validate_skill_directory(skill_dir)
        return result.manifest if result.is_valid else None
