"""Integration tests for library endpoints.

Routes under test:
  GET    /library/agents                       (authenticated)
  POST   /library/agents                       (admin)
  GET    /library/agents/by-slug/{slug}        (authenticated)
  GET    /library/agents/{agent_id}            (authenticated)
  PATCH  /library/agents/{agent_id}            (admin)
  DELETE /library/agents/{agent_id}            (admin)
  POST   /library/agents/{agent_id}/usage      (authenticated)
  GET    /library/mcp                          (authenticated)
  POST   /library/mcp                          (admin)
  GET    /library/mcp/{mcp_id}                 (authenticated)
  PATCH  /library/mcp/{mcp_id}                 (admin)
  DELETE /library/mcp/{mcp_id}                 (admin)
  GET    /library/skills                       (authenticated)
  POST   /library/skills                       (admin)
  GET    /library/skills/{skill_id}            (authenticated)
  PATCH  /library/skills/{skill_id}            (admin)
  DELETE /library/skills/{skill_id}            (admin)
  GET    /library/skills/{skill_id}/download   (authenticated)
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from starlette.testclient import TestClient

from tests.helpers.factories import (
    create_library_agent,
    create_library_skill,
    create_user,
    make_token,
)

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


# ─── LibraryAgent ─────────────────────────────────────────────────────────


class TestListLibraryAgents:
    def test_authenticated_can_list(
        self, client: TestClient, db: Callable[..., object], member_token: str
    ) -> None:
        db(lambda s: create_library_agent(s, slug="agent-a", name="Agent A"))
        db(lambda s: create_library_agent(s, slug="agent-b", name="Agent B"))
        res = client.get("/library/agents", headers={"Authorization": f"Bearer {member_token}"})
        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 2
        assert len(body["items"]) == 2

    def test_requires_auth(self, client: TestClient) -> None:
        res = client.get("/library/agents")
        assert res.status_code == 401


class TestCreateLibraryAgent:
    def test_admin_can_create(self, client: TestClient, admin_token: str) -> None:
        res = client.post(
            "/library/agents",
            json={"name": "New Agent", "slug": "new-agent"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["slug"] == "new-agent"
        assert body["has_llm_api_key"] is False

    def test_duplicate_slug_returns_409(
        self, client: TestClient, db: Callable[..., object], admin_token: str
    ) -> None:
        db(lambda s: create_library_agent(s, slug="duplicate"))
        res = client.post(
            "/library/agents",
            json={"name": "Dup", "slug": "duplicate"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 409

    def test_member_is_forbidden(self, client: TestClient, member_token: str) -> None:
        res = client.post(
            "/library/agents",
            json={"name": "X", "slug": "x-agent"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 403


class TestGetLibraryAgent:
    def test_get_by_id(
        self, client: TestClient, db: Callable[..., object], member_token: str
    ) -> None:
        agent = db(lambda s: create_library_agent(s, slug="fetch-me"))
        res = client.get(
            f"/library/agents/{agent.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        assert res.json()["slug"] == "fetch-me"

    def test_get_by_slug(
        self, client: TestClient, db: Callable[..., object], member_token: str
    ) -> None:
        db(lambda s: create_library_agent(s, slug="by-slug-test"))
        res = client.get(
            "/library/agents/by-slug/by-slug-test",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        assert res.json()["slug"] == "by-slug-test"

    def test_unknown_id_returns_404(self, client: TestClient, member_token: str) -> None:
        res = client.get(
            f"/library/agents/{uuid.uuid4()}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 404


class TestPatchLibraryAgent:
    def test_admin_can_patch(
        self, client: TestClient, db: Callable[..., object], admin_token: str
    ) -> None:
        agent = db(lambda s: create_library_agent(s, slug="patch-me", name="Old"))
        res = client.patch(
            f"/library/agents/{agent.id}",  # type: ignore[union-attr]
            json={"name": "New"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "New"

    def test_member_is_forbidden(
        self, client: TestClient, db: Callable[..., object], member_token: str
    ) -> None:
        agent = db(lambda s: create_library_agent(s, slug="no-patch"))
        res = client.patch(
            f"/library/agents/{agent.id}",  # type: ignore[union-attr]
            json={"name": "Hacked"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 403


class TestDeleteLibraryAgent:
    def test_admin_can_delete(
        self, client: TestClient, db: Callable[..., object], admin_token: str
    ) -> None:
        agent = db(lambda s: create_library_agent(s, slug="del-me"))
        res = client.delete(
            f"/library/agents/{agent.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 204

    def test_member_is_forbidden(
        self, client: TestClient, db: Callable[..., object], member_token: str
    ) -> None:
        agent = db(lambda s: create_library_agent(s, slug="no-del"))
        res = client.delete(
            f"/library/agents/{agent.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 403


class TestIncrementAgentUsage:
    def test_increments(
        self, client: TestClient, db: Callable[..., object], member_token: str
    ) -> None:
        agent = db(lambda s: create_library_agent(s, slug="count-me"))
        res = client.post(
            f"/library/agents/{agent.id}/usage",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 204


# ─── LibraryMCP ───────────────────────────────────────────────────────────


class TestLibraryMcp:
    def test_crud(
        self, client: TestClient, db: Callable[..., object], admin_token: str, member_token: str
    ) -> None:
        # create
        res = client.post(
            "/library/mcp",
            json={"name": "Test MCP", "slug": "test-mcp-new", "transport": "stdio"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 201
        mcp_id = res.json()["id"]

        # list
        res = client.get("/library/mcp", headers={"Authorization": f"Bearer {member_token}"})
        assert res.status_code == 200
        assert res.json()["total"] >= 1

        # get
        res = client.get(
            f"/library/mcp/{mcp_id}", headers={"Authorization": f"Bearer {member_token}"}
        )
        assert res.status_code == 200

        # patch
        res = client.patch(
            f"/library/mcp/{mcp_id}",
            json={"name": "Updated MCP"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "Updated MCP"

        # delete
        res = client.delete(
            f"/library/mcp/{mcp_id}", headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 204

        # gone
        res = client.get(
            f"/library/mcp/{mcp_id}", headers={"Authorization": f"Bearer {member_token}"}
        )
        assert res.status_code == 404

    def test_member_cannot_create(self, client: TestClient, member_token: str) -> None:
        res = client.post(
            "/library/mcp",
            json={"name": "X", "slug": "x-mcp"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 403


# ─── LibrarySkill ─────────────────────────────────────────────────────────


class TestLibrarySkill:
    def test_crud_and_download(
        self, client: TestClient, db: Callable[..., object], admin_token: str, member_token: str
    ) -> None:
        # create
        res = client.post(
            "/library/skills",
            json={
                "name": "My Skill",
                "slug": "my-skill",
                "content": "## Instructions\nDo stuff.",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 201
        skill_id = res.json()["id"]

        # get (includes files=[])
        res = client.get(
            f"/library/skills/{skill_id}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        assert res.json()["files"] == []

        # patch
        res = client.patch(
            f"/library/skills/{skill_id}",
            json={"name": "Updated Skill"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "Updated Skill"

        # download zip
        res = client.get(
            f"/library/skills/{skill_id}/download",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/zip"

        # delete
        res = client.delete(
            f"/library/skills/{skill_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 204

    def test_member_cannot_create(self, client: TestClient, member_token: str) -> None:
        res = client.post(
            "/library/skills",
            json={"name": "X", "slug": "x-skill", "content": "x"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 403

    def test_list_pagination(
        self, client: TestClient, db: Callable[..., object], member_token: str
    ) -> None:
        for i in range(5):
            db(lambda s, i=i: create_library_skill(s, slug=f"skill-{i}", name=f"Skill {i}"))
        res = client.get(
            "/library/skills?limit=3&page=1",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 5
        assert len(body["items"]) == 3
