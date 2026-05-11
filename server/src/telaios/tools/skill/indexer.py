"""
src/tools/skill/indexer.py
-------------------------
Searchable index for skills.

Builds an in-memory index for fast skill lookup by:
- Name (exact match)
- Description (substring search)
- Tags (exact match)
- Trigger phrases (substring search)

The index is rebuilt on demand when skills are added or removed.
"""

from __future__ import annotations

import logging

from telaios.tools.skill.types import SkillManifest

logger = logging.getLogger(__name__)


class SkillIndexer:
    """
    Searchable index for skills.

    Supports:
    - Exact name lookup (O(1))
    - Tag filtering (O(n) with early exit)
    - Full-text search over name, description, and triggers
    - Relevance scoring for ranked results
    """

    def __init__(self) -> None:
        self._skills: dict[str, SkillManifest] = {}
        self._by_tag: dict[str, set[str]] = {}
        self._dirty: bool = True

    def add(self, manifest: SkillManifest) -> None:
        """Add or update a skill in the index."""
        self._skills[manifest.name] = manifest
        self._dirty = True

    def remove(self, name: str) -> bool:
        """Remove a skill from the index."""
        if name in self._skills:
            del self._skills[name]
            self._dirty = True
            return True
        return False

    def clear(self) -> None:
        """Clear all skills from the index."""
        self._skills.clear()
        self._by_tag.clear()
        self._dirty = True

    def get(self, name: str) -> SkillManifest | None:
        """Get a skill by exact name match (O(1))."""
        return self._skills.get(name)

    def list_all(self) -> list[SkillManifest]:
        """Return all indexed skills."""
        return list(self._skills.values())

    def find_by_tag(self, tag: str) -> list[SkillManifest]:
        """Find all skills with a specific tag."""
        tag_lower = tag.lower()
        matches: list[SkillManifest] = []

        for manifest in self._skills.values():
            if any(t.lower() == tag_lower for t in manifest.frontmatter.tags):
                matches.append(manifest)

        return matches

    def search(self, query: str, limit: int = 10) -> list[tuple[SkillManifest, int]]:
        """
        Search skills by query string.

        Scoring:
        - Name match: +100
        - Tag match: +50
        - Trigger match: +30
        - Description match: +20

        Args:
            query: Search query string (case-insensitive).
            limit: Maximum number of results to return.

        Returns:
            List of (manifest, score) tuples, sorted by score descending.
        """
        query_lower = query.lower()
        scored: list[tuple[SkillManifest, int]] = []

        for manifest in self._skills.values():
            score = 0

            # Name match (highest priority)
            if query_lower in manifest.name.lower():
                score += 100

            # Tag match
            for tag in manifest.frontmatter.tags:
                if query_lower in tag.lower():
                    score += 50

            # Trigger match
            for trigger in manifest.frontmatter.triggers:
                if query_lower in trigger.lower():
                    score += 30

            # Description match
            if query_lower in manifest.description.lower():
                score += 20

            if score > 0:
                scored.append((manifest, score))

        # Sort by score descending
        scored.sort(key=lambda x: x[1], reverse=True)

        return scored[:limit]

    def search_names(self, prefix: str, limit: int = 10) -> list[str]:
        """
        Search skill names by prefix.

        Args:
            prefix: Name prefix to search for.
            limit: Maximum number of results.

        Returns:
            List of matching skill names.
        """
        prefix_lower = prefix.lower()
        matches: list[str] = []

        for name in self._skills:
            if name.lower().startswith(prefix_lower):
                matches.append(name)
                if len(matches) >= limit:
                    break

        return matches

    def rebuild(self) -> None:
        """Rebuild the tag index from current skills."""
        self._by_tag.clear()

        for manifest in self._skills.values():
            for tag in manifest.frontmatter.tags:
                tag_lower = tag.lower()
                if tag_lower not in self._by_tag:
                    self._by_tag[tag_lower] = set()
                self._by_tag[tag_lower].add(manifest.name)

        self._dirty = False
        logger.debug("SkillIndexer: rebuilt index with %d skills", len(self._skills))
