"""Integration tests for admin user-management endpoints.

GET    /users         — list all users (admin only)
GET    /users/{id}    — get user by id (admin only)
PATCH  /users/{id}    — update fields (admin only)
DELETE /users/{id}    — soft-delete (admin only)
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from starlette.testclient import TestClient

from tests.helpers.factories import create_user, make_token

pytestmark = pytest.mark.integration


# ─── Helpers ──────────────────────────────────────────────────────────────


def _admin_headers(client: TestClient, db: Callable[..., object]) -> dict[str, str]:
    admin = db(lambda s: create_user(s, email="admin@test.com", system_role="admin"))
    return {"Authorization": f"Bearer {make_token(admin)}"}  # type: ignore[union-attr]


def _member_headers(client: TestClient, db: Callable[..., object]) -> dict[str, str]:
    member = db(lambda s: create_user(s, email="member@test.com", system_role="member"))
    return {"Authorization": f"Bearer {make_token(member)}"}  # type: ignore[union-attr]


# ─── GET /users ───────────────────────────────────────────────────────────


class TestListUsers:
    def test_admin_can_list(self, client: TestClient, db: Callable[..., object]) -> None:
        headers = _admin_headers(client, db)
        db(lambda s: create_user(s, email="u1@test.com"))
        db(lambda s: create_user(s, email="u2@test.com"))
        res = client.get("/users", headers=headers)
        assert res.status_code == 200
        assert len(res.json()) >= 3  # admin + 2 users

    def test_non_admin_returns_403(self, client: TestClient, db: Callable[..., object]) -> None:
        headers = _member_headers(client, db)
        res = client.get("/users", headers=headers)
        assert res.status_code == 403

    def test_no_token_returns_401(self, client: TestClient) -> None:
        res = client.get("/users")
        assert res.status_code == 401


# ─── GET /users/{id} ──────────────────────────────────────────────────────


class TestGetUser:
    def test_admin_can_get(self, client: TestClient, db: Callable[..., object]) -> None:
        headers = _admin_headers(client, db)
        target = db(lambda s: create_user(s, email="target@test.com"))
        res = client.get(f"/users/{target.id}", headers=headers)  # type: ignore[union-attr]
        assert res.status_code == 200
        assert res.json()["email"] == "target@test.com"

    def test_unknown_id_returns_404(self, client: TestClient, db: Callable[..., object]) -> None:
        headers = _admin_headers(client, db)
        res = client.get(f"/users/{uuid.uuid4()}", headers=headers)
        assert res.status_code == 404

    def test_non_admin_returns_403(self, client: TestClient, db: Callable[..., object]) -> None:
        headers = _member_headers(client, db)
        target = db(lambda s: create_user(s, email="target2@test.com"))
        res = client.get(f"/users/{target.id}", headers=headers)  # type: ignore[union-attr]
        assert res.status_code == 403


# ─── PATCH /users/{id} ────────────────────────────────────────────────────


class TestPatchUser:
    def test_admin_can_update_display_name(
        self, client: TestClient, db: Callable[..., object]
    ) -> None:
        headers = _admin_headers(client, db)
        target = db(lambda s: create_user(s, email="patch@test.com", display_name="Old"))
        res = client.patch(
            f"/users/{target.id}",  # type: ignore[union-attr]
            json={"display_name": "New Name"},
            headers=headers,
        )
        assert res.status_code == 200
        assert res.json()["display_name"] == "New Name"

    def test_admin_can_deactivate(self, client: TestClient, db: Callable[..., object]) -> None:
        headers = _admin_headers(client, db)
        target = db(lambda s: create_user(s, email="active@test.com"))
        res = client.patch(
            f"/users/{target.id}",  # type: ignore[union-attr]
            json={"is_active": False},
            headers=headers,
        )
        assert res.status_code == 200
        assert res.json()["is_active"] is False

    def test_non_admin_returns_403(self, client: TestClient, db: Callable[..., object]) -> None:
        headers = _member_headers(client, db)
        target = db(lambda s: create_user(s, email="patch2@test.com"))
        res = client.patch(
            f"/users/{target.id}",  # type: ignore[union-attr]
            json={"display_name": "X"},
            headers=headers,
        )
        assert res.status_code == 403


# ─── DELETE /users/{id} ───────────────────────────────────────────────────


class TestDeleteUser:
    def test_admin_can_delete(self, client: TestClient, db: Callable[..., object]) -> None:
        headers = _admin_headers(client, db)
        target = db(lambda s: create_user(s, email="del@test.com"))
        res = client.delete(f"/users/{target.id}", headers=headers)  # type: ignore[union-attr]
        assert res.status_code == 204

    def test_deleted_user_returns_404(self, client: TestClient, db: Callable[..., object]) -> None:
        headers = _admin_headers(client, db)
        target = db(lambda s: create_user(s, email="del2@test.com"))
        client.delete(f"/users/{target.id}", headers=headers)  # type: ignore[union-attr]
        res = client.get(f"/users/{target.id}", headers=headers)  # type: ignore[union-attr]
        assert res.status_code == 404

    def test_non_admin_returns_403(self, client: TestClient, db: Callable[..., object]) -> None:
        headers = _member_headers(client, db)
        target = db(lambda s: create_user(s, email="del3@test.com"))
        res = client.delete(f"/users/{target.id}", headers=headers)  # type: ignore[union-attr]
        assert res.status_code == 403
