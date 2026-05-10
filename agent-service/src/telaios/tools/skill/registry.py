"""
src/tools/skill/registry.py
---------------------------
Registry that manages loaded skills with CRUD operations and indexing.

Integrates with ToolRegistry to make skills available as executable tools.
"""

from __future__ import annotations

import logging
import threading

from telaios.tools.skill.loader import SkillDirectoryScanner
from telaios.tools.skill.types import SkillManifest

logger = logging.getLogger(__name__)


class SkillRegistry:
    """
    Thread-safe registry for managing loaded skills.

    Supports:
    - Loading skills from filesystem directories
    - Adding/removing skills manually
    - Searching by name, description, or tags
    - Listing all loaded skills
    """

    def __init__(self) -> None:
        self._skills: dict[str, SkillManifest] = {}
        self._lock = threading.RLock()

    # ── Loading ────────────────────────────────────────────────────────────

    def load_from_directory(self, path: str) -> int:
        """
        Load all valid skills from a directory.

        Args:
            path: Root directory containing skill subdirectories.

        Returns:
            Number of skills successfully loaded.
        """
        manifests = SkillDirectoryScanner.scan(path)

        with self._lock:
            for manifest in manifests:
                self._skills[manifest.name] = manifest
                logger.info("Registered skill: %s", manifest.name)

        return len(manifests)

    # ── CRUD ───────────────────────────────────────────────────────────────

    def add(self, manifest: SkillManifest) -> None:
        """
        Add a skill manifest to the registry.

        Overwrites any existing skill with the same name.
        """
        with self._lock:
            self._skills[manifest.name] = manifest
            logger.debug("SkillRegistry: added skill '%s'", manifest.name)

    def get(self, name: str) -> SkillManifest | None:
        """
        Get a skill by name.

        Args:
            name: Skill name (kebab-case).

        Returns:
            SkillManifest if found, None otherwise.
        """
        with self._lock:
            return self._skills.get(name)

    def remove(self, name: str) -> bool:
        """
        Remove a skill from the registry.

        Args:
            name: Skill name to remove.

        Returns:
            True if removed, False if not found.
        """
        with self._lock:
            if name in self._skills:
                del self._skills[name]
                logger.debug("SkillRegistry: removed skill '%s'", name)
                return True
            return False

    def list(self) -> list[SkillManifest]:
        """Return all loaded skills as a list."""
        with self._lock:
            return list(self._skills.values())

    def names(self) -> list[str]:
        """Return names of all loaded skills."""
        with self._lock:
            return list(self._skills.keys())

    def __contains__(self, name: object) -> bool:
        """Check if a skill is registered."""
        if not isinstance(name, str):
            return False
        with self._lock:
            return name in self._skills

    def __len__(self) -> int:
        """Return the number of registered skills."""
        with self._lock:
            return len(self._skills)

    # ── Search ───────────────────────────────────────────────────────────────

    def search(self, query: str) -> list[SkillManifest]:
        """
        Search skills by name, description, or tags.

        Args:
            query: Search query string (case-insensitive substring match).

        Returns:
            List of matching SkillManifest objects, ordered by relevance.
        """
        query_lower = query.lower()
        query_terms = [term for term in query_lower.split() if term]
        matches: list[tuple[SkillManifest, int]] = []

        with self._lock:
            for manifest in self._skills.values():
                score = 0

                # Name match (highest priority)
                if query_lower in manifest.name.lower():
                    score += 100

                # Description match
                if query_lower in manifest.description.lower():
                    score += 50

                # Tag match
                for tag in manifest.frontmatter.tags:
                    if query_lower in tag.lower():
                        score += 25

                # Trigger phrase match
                for trigger in manifest.frontmatter.triggers:
                    if query_lower in trigger.lower():
                        score += 20

                if score == 0 and query_terms:
                    haystack = " ".join(
                        [
                            manifest.name,
                            manifest.description,
                            *manifest.frontmatter.tags,
                            *manifest.frontmatter.triggers,
                        ]
                    ).lower()
                    score += sum(10 for term in query_terms if term in haystack)

                if score > 0:
                    matches.append((manifest, score))

        # Sort by score (descending)
        matches.sort(key=lambda x: x[1], reverse=True)
        return [manifest for manifest, _ in matches]

    def find_by_tag(self, tag: str) -> list[SkillManifest]:
        """
        Find all skills with a specific tag.

        Args:
            tag: Tag to search for (case-insensitive exact match).

        Returns:
            List of matching SkillManifest objects.
        """
        tag_lower = tag.lower()
        matches: list[SkillManifest] = []

        with self._lock:
            for manifest in self._skills.values():
                if any(t.lower() == tag_lower for t in manifest.frontmatter.tags):
                    matches.append(manifest)

        return matches

    # ── Bulk operations ────────────────────────────────────────────────────

    def clear(self) -> None:
        """Remove all skills from the registry."""
        with self._lock:
            count = len(self._skills)
            self._skills.clear()
            logger.info("SkillRegistry: cleared %d skills", count)

    def load_multiple(self, manifests: list[SkillManifest]) -> None:
        """Load multiple skill manifests at once."""
        with self._lock:
            for manifest in manifests:
                self._skills[manifest.name] = manifest
            logger.info("SkillRegistry: bulk-loaded %d skills", len(manifests))
