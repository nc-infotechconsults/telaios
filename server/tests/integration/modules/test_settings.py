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

    def test_member_gets_settings(self, client: TestClient, member_token: str) -> None:
        res = client.get("/settings", headers={"Authorization": f"Bearer {member_token}"})
        assert res.status_code == 200
        body = res.json()
        assert body["density"] == "regular"
        assert body["glass_blur"] == 28

    def test_requires_auth(self, client: TestClient) -> None:
        res = client.get("/settings")
        assert res.status_code == 401


# ─── PATCH /settings ──────────────────────────────────────────────────────


class TestPatchSettings:
    def test_admin_can_patch(self, client: TestClient, admin_token: str) -> None:
        res = client.patch(
            "/settings",
            json={"brand_name": "Acme", "brand_color": "#112233", "default_theme": "light"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["brand_name"] == "Acme"
        assert body["brand_color"] == "#112233"
        assert body["default_theme"] == "light"

    def test_patch_is_idempotent(self, client: TestClient, admin_token: str) -> None:
        client.patch(
            "/settings",
            json={"brand_name": "Brand A"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        res = client.patch(
            "/settings",
            json={"brand_name": "Brand B"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        assert res.json()["brand_name"] == "Brand B"

    def test_member_is_forbidden(self, client: TestClient, member_token: str) -> None:
        res = client.patch(
            "/settings",
            json={"brand_name": "Nope"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 403

    def test_admin_can_patch_large_logo_data_url(
        self, client: TestClient, admin_token: str
    ) -> None:
        large_logo = f"data:image/png;base64,{('a' * 600_000)}"
        res = client.patch(
            "/settings",
            json={"logo_url": large_logo},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["logo_url"] == large_logo

    def test_requires_auth(self, client: TestClient) -> None:
        res = client.patch("/settings", json={"brand_name": "No Auth"})
        assert res.status_code == 401

    def test_admin_can_patch_density_and_glass_blur(
        self, client: TestClient, admin_token: str
    ) -> None:
        res = client.patch(
            "/settings",
            json={"density": "compact", "glass_blur": 40},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["density"] == "compact"
        assert body["glass_blur"] == 40

    def test_rejects_invalid_density(self, client: TestClient, admin_token: str) -> None:
        res = client.patch(
            "/settings",
            json={"density": "huge"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 422
