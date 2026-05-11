"""Integration tests for agent profile endpoints.

Routes under test:
  GET    /agent-profiles
  POST   /agent-profiles
  GET    /agent-profiles/{profile_id}
  PATCH  /agent-profiles/{profile_id}
  DELETE /agent-profiles/{profile_id}
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from starlette.testclient import TestClient

from tests.helpers.factories import create_user, make_token

pytestmark = pytest.mark.integration

_PAYLOAD = {
    "name": "Test Profile",
    "llm_provider": "openai",
    "llm_model": "gpt-4o",
}


# ─── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def member(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="member@test.com"))


@pytest.fixture
def member_token(member: object) -> str:
    return make_token(member)  # type: ignore[arg-type]


# ─── GET /agent-profiles ──────────────────────────────────────────────────


class TestListAgentProfiles:
    def test_empty_list(self, client: TestClient, member_token: str) -> None:
        res = client.get("/agent-profiles", headers={"Authorization": f"Bearer {member_token}"})
        assert res.status_code == 200
        assert res.json() == []

    def test_requires_auth(self, client: TestClient) -> None:
        res = client.get("/agent-profiles")
        assert res.status_code == 401


# ─── POST /agent-profiles ─────────────────────────────────────────────────


class TestCreateAgentProfile:
    def test_creates_profile(self, client: TestClient, member_token: str) -> None:
        res = client.post(
            "/agent-profiles",
            json=_PAYLOAD,
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["name"] == "Test Profile"
        assert body["llm_provider"] == "openai"
        assert body["has_llm_api_key"] is False
        assert body["has_github_token"] is False
        assert body["sub_agent_ids"] == []

    def test_profile_appears_in_list(self, client: TestClient, member_token: str) -> None:
        client.post(
            "/agent-profiles",
            json=_PAYLOAD,
            headers={"Authorization": f"Bearer {member_token}"},
        )
        res = client.get("/agent-profiles", headers={"Authorization": f"Bearer {member_token}"})
        assert res.status_code == 200
        assert len(res.json()) == 1

    def test_requires_auth(self, client: TestClient) -> None:
        res = client.post("/agent-profiles", json=_PAYLOAD)
        assert res.status_code == 401


# ─── GET /agent-profiles/{profile_id} ────────────────────────────────────


class TestGetAgentProfile:
    def test_get_by_id(self, client: TestClient, member_token: str) -> None:
        create_res = client.post(
            "/agent-profiles",
            json=_PAYLOAD,
            headers={"Authorization": f"Bearer {member_token}"},
        )
        profile_id = create_res.json()["id"]
        res = client.get(
            f"/agent-profiles/{profile_id}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        assert res.json()["id"] == profile_id

    def test_unknown_id_returns_404(self, client: TestClient, member_token: str) -> None:
        res = client.get(
            f"/agent-profiles/{uuid.uuid4()}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 404


# ─── PATCH /agent-profiles/{profile_id} ──────────────────────────────────


class TestPatchAgentProfile:
    def test_can_patch(self, client: TestClient, member_token: str) -> None:
        create_res = client.post(
            "/agent-profiles",
            json=_PAYLOAD,
            headers={"Authorization": f"Bearer {member_token}"},
        )
        profile_id = create_res.json()["id"]
        res = client.patch(
            f"/agent-profiles/{profile_id}",
            json={"name": "Updated", "llm_model": "gpt-3.5-turbo"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["name"] == "Updated"
        assert body["llm_model"] == "gpt-3.5-turbo"

    def test_unknown_returns_404(self, client: TestClient, member_token: str) -> None:
        res = client.patch(
            f"/agent-profiles/{uuid.uuid4()}",
            json={"name": "X"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 404


# ─── DELETE /agent-profiles/{profile_id} ─────────────────────────────────


class TestDeleteAgentProfile:
    def test_can_delete(self, client: TestClient, member_token: str) -> None:
        create_res = client.post(
            "/agent-profiles",
            json=_PAYLOAD,
            headers={"Authorization": f"Bearer {member_token}"},
        )
        profile_id = create_res.json()["id"]
        res = client.delete(
            f"/agent-profiles/{profile_id}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 204

        # soft-deleted — subsequent GET returns 404
        res = client.get(
            f"/agent-profiles/{profile_id}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 404

    def test_requires_auth(self, client: TestClient, member_token: str) -> None:
        create_res = client.post(
            "/agent-profiles",
            json=_PAYLOAD,
            headers={"Authorization": f"Bearer {member_token}"},
        )
        profile_id = create_res.json()["id"]
        res = client.delete(f"/agent-profiles/{profile_id}")
        assert res.status_code == 401
