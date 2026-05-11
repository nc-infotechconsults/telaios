"""Integration tests for POST /auth/register, POST /auth/login, GET /auth/me.

Ported from ``data-api/src/__tests__/integration/auth.test.ts``.

Notes vs TS:
  - Invalid payload → 422 (Pydantic) instead of TS's 400 (Zod).
  - password_hash is never serialised — confirmed via ``UserRead`` schema.
"""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

pytestmark = pytest.mark.integration


# ─── POST /auth/register ──────────────────────────────────────────────────


class TestRegister:
    def test_first_user_becomes_admin(self, client: TestClient) -> None:
        res = client.post(
            "/auth/register",
            json={"email": "first@test.com", "password": "password123", "display_name": "First"},
        )
        assert res.status_code == 201
        assert res.json()["user"]["system_role"] == "admin"
        assert "password_hash" not in res.json()["user"]
        assert res.json()["token"]

    def test_second_user_is_member(self, client: TestClient) -> None:
        client.post(
            "/auth/register",
            json={"email": "first@test.com", "password": "password123", "display_name": "First"},
        )
        res = client.post(
            "/auth/register",
            json={
                "email": "second@test.com",
                "password": "password123",
                "display_name": "Second",
            },
        )
        assert res.status_code == 201
        assert res.json()["user"]["system_role"] == "member"

    def test_duplicate_email_returns_409(self, client: TestClient) -> None:
        client.post(
            "/auth/register",
            json={"email": "dup@test.com", "password": "password123", "display_name": "Dup"},
        )
        # Case-insensitive duplicate
        res = client.post(
            "/auth/register",
            json={
                "email": "DUP@TEST.COM",
                "password": "password123",
                "display_name": "Dup2",
            },
        )
        assert res.status_code == 409

    def test_invalid_payload_returns_422(self, client: TestClient) -> None:
        res = client.post(
            "/auth/register",
            json={"email": "not-an-email", "password": "short"},
        )
        assert res.status_code == 422


# ─── POST /auth/login ─────────────────────────────────────────────────────


class TestLogin:
    def _register(self, client: TestClient, email: str = "user@test.com") -> None:
        client.post(
            "/auth/register",
            json={"email": email, "password": "password123", "display_name": "User"},
        )

    def test_valid_credentials_return_token(self, client: TestClient) -> None:
        self._register(client)
        res = client.post(
            "/auth/login",
            json={"email": "user@test.com", "password": "password123"},
        )
        assert res.status_code == 200
        assert res.json()["token"]
        assert "password_hash" not in res.json()["user"]

    def test_wrong_password_returns_401(self, client: TestClient) -> None:
        self._register(client)
        res = client.post(
            "/auth/login",
            json={"email": "user@test.com", "password": "wrongpassword"},
        )
        assert res.status_code == 401

    def test_unknown_email_returns_401(self, client: TestClient) -> None:
        res = client.post(
            "/auth/login",
            json={"email": "nobody@test.com", "password": "password123"},
        )
        assert res.status_code == 401

    def test_invalid_payload_returns_422(self, client: TestClient) -> None:
        res = client.post("/auth/login", json={"email": "bad"})
        assert res.status_code == 422


# ─── GET /auth/me ─────────────────────────────────────────────────────────


class TestMe:
    def test_returns_current_user(self, client: TestClient) -> None:
        reg = client.post(
            "/auth/register",
            json={"email": "me@test.com", "password": "password123", "display_name": "Me"},
        )
        token: str = reg.json()["token"]
        res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        assert res.json()["email"] == "me@test.com"
        assert "password_hash" not in res.json()

    def test_no_token_returns_401(self, client: TestClient) -> None:
        res = client.get("/auth/me")
        assert res.status_code == 401

    def test_invalid_token_returns_401(self, client: TestClient) -> None:
        res = client.get("/auth/me", headers={"Authorization": "Bearer bad.token.here"})
        assert res.status_code == 401
