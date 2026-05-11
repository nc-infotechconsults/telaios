"""Pydantic schemas for the repositories module.

Ported from ``data-api/src/schemas/repository.schema.ts``.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

ProviderType = str  # "github" | "gitlab" | "bitbucket" | "git" | "s3"
AuthType = str  # "none" | "token" | "ssh"
RepoStatus = str  # "unconfigured" | "cloning" | "ready" | "error"

RepoTestCode = str  # "OK" | "INVALID_URL" | ... etc.


class RepositoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    remote_url: str | None
    branch: str
    auth_type: AuthType
    provider_type: ProviderType
    bucket_name: str | None
    region: str | None
    endpoint: str | None
    status: RepoStatus
    error_message: str | None
    has_credentials: bool
    updated_at: datetime

    @classmethod
    def from_orm_sanitized(cls, obj: object) -> RepositoryRead:
        from telaios.utils.crypto import decrypt

        raw = getattr(obj, "credentials", None)
        has_credentials = bool(raw and decrypt(raw))
        data = {
            col: getattr(obj, col)
            for col in (
                "id",
                "project_id",
                "name",
                "remote_url",
                "branch",
                "auth_type",
                "provider_type",
                "bucket_name",
                "region",
                "endpoint",
                "status",
                "error_message",
                "updated_at",
            )
        }
        data["has_credentials"] = has_credentials
        return cls.model_validate(data)


class RepositoryCreate(BaseModel):
    name: str = Field(min_length=1)
    remote_url: str | None = None
    branch: str = "main"
    auth_type: AuthType = "none"
    credentials: str | None = None
    provider_type: ProviderType = "git"
    bucket_name: str | None = None
    region: str | None = None
    endpoint: str | None = None


class RepositoryPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    remote_url: str | None = None
    branch: str | None = None
    auth_type: AuthType | None = None
    credentials: str | None = None
    provider_type: ProviderType | None = None
    bucket_name: str | None = None
    region: str | None = None
    endpoint: str | None = None
    status: RepoStatus | None = None
    error_message: str | None = None


class TestRepositoryDto(BaseModel):
    provider_type: ProviderType = "git"
    remote_url: str | None = None
    branch: str | None = None
    auth_type: AuthType = "none"
    credentials: str | None = None
    bucket_name: str | None = None
    region: str | None = None
    endpoint: str | None = None


class RepoTestResult(BaseModel):
    ok: bool
    code: RepoTestCode
    message: str
    default_branch: str | None = None


__all__ = [
    "RepoTestCode",
    "RepoTestResult",
    "RepositoryCreate",
    "RepositoryPatch",
    "RepositoryRead",
    "TestRepositoryDto",
]
