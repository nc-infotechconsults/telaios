"""Request/response schemas for the skills module."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SkillSummary(BaseModel):
    name: str
    description: str
    version: str
    tags: list[str]
    author: str | None = None
    script_count: int = 0


class SkillDetail(SkillSummary):
    instructions: str
    scripts: list[dict[str, Any]]
    root_path: str


class SearchResponse(BaseModel):
    query: str
    results: list[SkillSummary]
    total: int


class ReloadResponse(BaseModel):
    loaded: int
    errors: list[str]


class InstallRequest(BaseModel):
    zip_path: str = Field(..., min_length=1)
    conflict_policy: str = "overwrite"


class InstallResponse(BaseModel):
    success: bool
    skill_name: str | None = None
    target_path: str | None = None
    errors: list[str] | None = None


__all__ = [
    "InstallRequest",
    "InstallResponse",
    "ReloadResponse",
    "SearchResponse",
    "SkillDetail",
    "SkillSummary",
]
