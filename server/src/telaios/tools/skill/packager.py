"""
src/tools/skill/packager.py
--------------------------
Package skills into zip files and install from zip or directory.

Features:
- Package a skill directory into a zip file
- Install a skill from a zip file
- Install a skill from a directory
- Handle name conflicts (overwrite/skip/error)
- Validate before packaging/installation
"""

from __future__ import annotations

import logging
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from telaios.tools.skill.validator import validate_skill_directory

logger = logging.getLogger(__name__)


@dataclass
class PackageResult:
    """Result of packaging a skill."""

    success: bool
    zip_path: str | None = None
    errors: list[str] | None = None


@dataclass
class InstallResult:
    """Result of installing a skill."""

    success: bool
    skill_name: str | None = None
    target_path: str | None = None
    errors: list[str] | None = None
    overwritten: bool = False


class SkillPackager:
    """Package skills into zip files for distribution."""

    def package_skill(
        self,
        skill_dir: str | Path,
        output_dir: str | Path | None = None,
        validate: bool = True,
    ) -> PackageResult:
        """
        Package a skill directory into a zip file.

        Args:
            skill_dir: Path to the skill directory.
            output_dir: Directory to write the zip file (default: skill_dir parent).
            validate: Whether to validate the skill before packaging.

        Returns:
            PackageResult with the zip file path or errors.
        """
        skill_path = Path(skill_dir)

        if not skill_path.exists():
            return PackageResult(
                success=False,
                errors=[f"Skill directory not found: {skill_path}"],
            )

        # Validate before packaging
        if validate:
            validation = validate_skill_directory(skill_path)
            if not validation.is_valid:
                return PackageResult(
                    success=False,
                    errors=validation.errors,
                )

        # Determine output directory and zip filename
        if output_dir is None:
            output_dir = skill_path.parent

        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        skill_name = skill_path.name
        zip_filename = f"{skill_name}.zip"
        zip_path = output_path / zip_filename

        try:
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for item in skill_path.rglob("*"):
                    if item.is_file():
                        arcname = item.relative_to(skill_path)
                        zf.write(item, arcname)

            logger.info("Packaged skill '%s' to %s", skill_name, zip_path)
            return PackageResult(success=True, zip_path=str(zip_path))

        except Exception as exc:
            logger.error("Failed to package skill '%s': %s", skill_name, exc)
            return PackageResult(
                success=False,
                errors=[f"Packaging failed: {exc}"],
            )

    def package_skills_directory(
        self,
        skills_dir: str | Path,
        output_dir: str | Path | None = None,
        validate: bool = True,
    ) -> list[PackageResult]:
        """
        Package all skills in a directory.

        Args:
            skills_dir: Directory containing skill subdirectories.
            output_dir: Directory to write zip files.
            validate: Whether to validate each skill before packaging.

        Returns:
            List of PackageResult for each skill.
        """
        skills_path = Path(skills_dir)
        results: list[PackageResult] = []

        if not skills_path.exists():
            return [PackageResult(success=False, errors=[f"Directory not found: {skills_path}"])]

        for subdir in sorted(skills_path.iterdir()):
            if subdir.is_dir() and (subdir / "SKILL.md").exists():
                result = self.package_skill(subdir, output_dir, validate)
                results.append(result)

        return results


class SkillInstaller:
    """Install skills from zip files or directories."""

    def __init__(
        self,
        conflict_policy: Literal["overwrite", "skip", "error"] = "overwrite",
    ) -> None:
        self.conflict_policy = conflict_policy

    def install_from_zip(
        self,
        zip_path: str | Path,
        target_dir: str | Path,
    ) -> InstallResult:
        """
        Install a skill from a zip file.

        Args:
            zip_path: Path to the skill zip file.
            target_dir: Directory to install the skill into.

        Returns:
            InstallResult with installation status.
        """
        zip_file = Path(zip_path)

        if not zip_file.exists():
            return InstallResult(
                success=False,
                errors=[f"Zip file not found: {zip_file}"],
            )

        try:
            # Extract to a temp location first
            import tempfile

            with tempfile.TemporaryDirectory() as tmp_dir:
                with zipfile.ZipFile(zip_file, "r") as zf:
                    zf.extractall(tmp_dir)

                # Find the skill directory in the extracted contents
                tmp_path = Path(tmp_dir)
                skill_dirs = [d for d in tmp_path.iterdir() if d.is_dir()]

                if not skill_dirs:
                    return InstallResult(
                        success=False,
                        errors=["No skill directory found in zip file"],
                    )

                # Use the first directory (should be the skill)
                source_dir = skill_dirs[0]

                # Validate before installing
                validation = validate_skill_directory(source_dir)
                if not validation.is_valid:
                    return InstallResult(
                        success=False,
                        errors=validation.errors,
                    )

                skill_name = validation.manifest.name if validation.manifest else source_dir.name
                install_path = Path(target_dir) / skill_name

                # Handle conflicts
                if install_path.exists():
                    if self.conflict_policy == "skip":
                        return InstallResult(
                            success=False,
                            skill_name=skill_name,
                            errors=[f"Skill '{skill_name}' already exists (skipped)"],
                        )
                    elif self.conflict_policy == "error":
                        return InstallResult(
                            success=False,
                            skill_name=skill_name,
                            errors=[f"Skill '{skill_name}' already exists"],
                        )
                    else:  # overwrite
                        shutil.rmtree(install_path)

                shutil.copytree(source_dir, install_path)

                logger.info("Installed skill '%s' to %s", skill_name, install_path)
                return InstallResult(
                    success=True,
                    skill_name=skill_name,
                    target_path=str(install_path),
                    overwritten=install_path.exists(),
                )

        except Exception as exc:
            logger.error("Failed to install from zip %s: %s", zip_file, exc)
            return InstallResult(
                success=False,
                errors=[f"Installation failed: {exc}"],
            )

    def install_from_directory(
        self,
        source_dir: str | Path,
        target_dir: str | Path,
    ) -> InstallResult:
        """
        Install a skill from a directory.

        Args:
            source_dir: Source skill directory.
            target_dir: Target directory to install into.

        Returns:
            InstallResult with installation status.
        """
        source_path = Path(source_dir)

        if not source_path.exists():
            return InstallResult(
                success=False,
                errors=[f"Source directory not found: {source_path}"],
            )

        # Validate before installing
        validation = validate_skill_directory(source_path)
        if not validation.is_valid:
            return InstallResult(
                success=False,
                errors=validation.errors,
            )

        skill_name = validation.manifest.name if validation.manifest else source_path.name
        install_path = Path(target_dir) / skill_name

        # Handle conflicts
        if install_path.exists():
            if self.conflict_policy == "skip":
                return InstallResult(
                    success=False,
                    skill_name=skill_name,
                    errors=[f"Skill '{skill_name}' already exists (skipped)"],
                )
            elif self.conflict_policy == "error":
                return InstallResult(
                    success=False,
                    skill_name=skill_name,
                    errors=[f"Skill '{skill_name}' already exists"],
                )
            else:  # overwrite
                shutil.rmtree(install_path)

        try:
            shutil.copytree(source_path, install_path)

            logger.info("Installed skill '%s' from %s to %s", skill_name, source_path, install_path)
            return InstallResult(
                success=True,
                skill_name=skill_name,
                target_path=str(install_path),
                overwritten=install_path.exists(),
            )

        except Exception as exc:
            logger.error("Failed to install skill '%s': %s", skill_name, exc)
            return InstallResult(
                success=False,
                errors=[f"Installation failed: {exc}"],
            )
