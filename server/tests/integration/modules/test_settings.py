"""Integration tests for settings endpoints.

Routes under test:
  GET    /settings
  PATCH  /settings
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from starlette.testclient import TestClient

from tests.helpers.factories import create_user, make_token

pytestmark = pytest.mark.integration


# ─── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def admin(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="admin@test.com", system_role="admin"))


@pytest.fixture
def admin_token(admin: object) -> str:
    return make_token(admin)  # type: ignore[arg-type]


@pytest.fixture
def member(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="member@test.com"))


@pytest.fixture
def member_token(member: object) -> str:
    return make_token(member)  # type: ignore[arg-type]


# ─── GET /settings ────────────────────────────────────────────────────────


class TestGetSettings:
    def test_admin_gets_settings(self, client: TestClient, admin_token: str) -> None:
        res = client.get("/settings", headers={"Authorization": f"Bearer {admin_token}"})
        assert res.status_code == 200
        body = res.json()
        # Singleton row is created on demand
        assert "id" in body

    def test_member_is_forbidden(self, client: TestClient, member_token: str) -> None:
        res = client.get("/settings", headers={"Authorization": f"Bearer {member_token}"})
        assert res.status_code == 403

    def test_requires_auth(self, client: TestClient) -> None:
        res = client.get("/settings")
        assert res.status_code == 401


# ─── PATCH /settings ──────────────────────────────────────────────────────


class TestPatchSettings:
    def test_admin_can_patch(self, client: TestClient, admin_token: str) -> None:
        res = client.patch(
            "/settings",
            json={"llm_provider": "openai", "llm_model": "gpt-4o"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["llm_provider"] == "openai"
        assert body["llm_model"] == "gpt-4o"

    def test_patch_is_idempotent(self, client: TestClient, admin_token: str) -> None:
        client.patch(
            "/settings",
            json={"llm_model": "gpt-4"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        res = client.patch(
            "/settings",
            json={"llm_model": "gpt-4o"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        assert res.json()["llm_model"] == "gpt-4o"

    def test_member_is_forbidden(self, client: TestClient, member_token: str) -> None:
        res = client.patch(
            "/settings",
            json={"llm_model": "gpt-4"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 403

    def test_requires_auth(self, client: TestClient) -> None:
        res = client.patch("/settings", json={"llm_model": "gpt-4"})
        assert res.status_code == 401
