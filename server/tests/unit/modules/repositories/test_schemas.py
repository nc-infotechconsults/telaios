"""tests/unit/modules/repositories/test_schemas.py

Unit tests for repositories module Pydantic schemas.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from telaios.modules.repositories.schemas import (
    RepositoryCreate,
    RepositoryPatch,
    RepositoryRead,
    RepoTestResult,
    TestRepositoryDto,
)

# ─── RepositoryCreate ─────────────────────────────────────────────────────


class TestRepositoryCreate:
    def test_valid_minimal(self):
        rc = RepositoryCreate(name="my-repo")
        assert rc.name == "my-repo"
        assert rc.branch == "main"
        assert rc.auth_type == "none"
        assert rc.provider_type == "git"

    def test_full_fields(self):
        rc = RepositoryCreate(
            name="s3-bucket",
            auth_type="token",
            credentials="token123",
            provider_type="s3",
            bucket_name="my-bucket",
            region="us-east-1",
        )
        assert rc.provider_type == "s3"
        assert rc.bucket_name == "my-bucket"

    def test_empty_name_raises(self):
        with pytest.raises(ValidationError):
            RepositoryCreate(name="")


# ─── RepositoryPatch ──────────────────────────────────────────────────────


class TestRepositoryPatch:
    def test_all_none_valid(self):
        rp = RepositoryPatch()
        assert rp.name is None
        assert rp.branch is None

    def test_empty_name_raises(self):
        with pytest.raises(ValidationError):
            RepositoryPatch(name="")

    def test_valid_patch(self):
        rp = RepositoryPatch(name="new-name", branch="develop", status="ready")
        assert rp.name == "new-name"
        assert rp.status == "ready"


# ─── TestRepositoryDto ────────────────────────────────────────────────────


class TestTestRepositoryDto:
    def test_defaults(self):
        dto = TestRepositoryDto()
        assert dto.provider_type == "git"
        assert dto.auth_type == "none"
        assert dto.remote_url is None

    def test_with_url(self):
        dto = TestRepositoryDto(remote_url="https://github.com/org/repo", branch="main")
        assert dto.remote_url == "https://github.com/org/repo"


# ─── RepoTestResult ───────────────────────────────────────────────────────


class TestRepoTestResult:
    def test_ok_result(self):
        r = RepoTestResult(ok=True, code="OK", message="Reachable")
        assert r.ok is True
        assert r.default_branch is None

    def test_with_default_branch(self):
        r = RepoTestResult(ok=True, code="OK", message="OK", default_branch="main")
        assert r.default_branch == "main"

    def test_failed_result(self):
        r = RepoTestResult(ok=False, code="AUTH_FAILED", message="Invalid token")
        assert r.ok is False


# ─── RepositoryRead ───────────────────────────────────────────────────────


class TestRepositoryRead:
    def test_from_orm_sanitized_with_credentials(self):
        """has_credentials=True when decrypt(credentials) is truthy."""
        from unittest.mock import patch

        class FakeRow:
            id = uuid.uuid4()
            project_id = uuid.uuid4()
            name = "repo"
            remote_url = "https://github.com/org/repo"
            branch = "main"
            auth_type = "token"
            provider_type = "github"
            bucket_name = None
            region = None
            endpoint = None
            status = "ready"
            error_message = None
            updated_at = datetime.now(UTC)
            credentials = "encrypted-creds"

        with patch("telaios.utils.crypto.decrypt", return_value="plain-token"):
            result = RepositoryRead.from_orm_sanitized(FakeRow())

        assert result.has_credentials is True
        assert result.name == "repo"
        assert result.status == "ready"

    def test_from_orm_sanitized_without_credentials(self):
        from unittest.mock import patch

        class FakeRow:
            id = uuid.uuid4()
            project_id = uuid.uuid4()
            name = "repo"
            remote_url = None
            branch = "main"
            auth_type = "none"
            provider_type = "git"
            bucket_name = None
            region = None
            endpoint = None
            status = "unconfigured"
            error_message = None
            updated_at = datetime.now(UTC)
            credentials = None

        with patch("telaios.utils.crypto.decrypt", return_value=None):
            result = RepositoryRead.from_orm_sanitized(FakeRow())

        assert result.has_credentials is False
