"""Integration tests for project, member, and agent endpoints.

Routes under test:
  GET    /projects
  POST   /projects
  GET    /projects/{id}
  PATCH  /projects/{id}
  DELETE /projects/{id}

  GET    /projects/{id}/members
  POST   /projects/{id}/members
  PATCH  /projects/{id}/members/{user_id}
  DELETE /projects/{id}/members/{user_id}

  GET    /projects/{id}/agents
  POST   /projects/{id}/agents
  GET    /projects/{id}/agents/{agent_id}
  PATCH  /projects/{id}/agents/{agent_id}
  DELETE /projects/{id}/agents/{agent_id}
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from starlette.testclient import TestClient

from tests.helpers.factories import (
    create_project,
    create_project_member,
    create_user,
    make_token,
)

pytestmark = pytest.mark.integration


# ─── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def owner(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="owner@test.com"))


@pytest.fixture
def owner_token(owner: object) -> str:
    return make_token(owner)  # type: ignore[arg-type]


@pytest.fixture
def editor(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="editor@test.com"))


@pytest.fixture
def editor_token(editor: object) -> str:
    return make_token(editor)  # type: ignore[arg-type]


@pytest.fixture
def viewer(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="viewer@test.com"))


@pytest.fixture
def viewer_token(viewer: object) -> str:
    return make_token(viewer)  # type: ignore[arg-type]


@pytest.fixture
def project(db: Callable[..., object], owner: object) -> object:
    return db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]


@pytest.fixture
def project_with_editor(db: Callable[..., object], project: object, editor: object) -> object:
    db(
        lambda s: create_project_member(
            s,
            editor.id,  # type: ignore[union-attr]
            project.id,  # type: ignore[union-attr]
            role="editor",
        )
    )
    return project


@pytest.fixture
def project_with_viewer(db: Callable[..., object], project: object, viewer: object) -> object:
    db(
        lambda s: create_project_member(
            s,
            viewer.id,  # type: ignore[union-attr]
            project.id,  # type: ignore[union-attr]
            role="viewer",
        )
    )
    return project


# ─── GET /projects ────────────────────────────────────────────────────────


class TestListProjects:
    def test_returns_paginated_response(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.get(
            "/projects",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert "items" in body
        assert "total" in body
        assert "page" in body
        assert "limit" in body

    def test_includes_own_projects(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.get(
            "/projects",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        ids = [item["id"] for item in res.json()["items"]]
        assert str(project.id) in ids  # type: ignore[union-attr]

    def test_requires_auth(self, client: TestClient) -> None:
        res = client.get("/projects")
        assert res.status_code == 401


# ─── POST /projects ───────────────────────────────────────────────────────


class TestCreateProject:
    def test_creates_project(
        self,
        client: TestClient,
        owner_token: str,
    ) -> None:
        res = client.post(
            "/projects",
            json={"name": "New Project"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["name"] == "New Project"
        assert body["status"] == "planning"
        assert "id" in body

    def test_creates_with_description(
        self,
        client: TestClient,
        owner_token: str,
    ) -> None:
        res = client.post(
            "/projects",
            json={"name": "Described", "description": "A project"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 201
        assert res.json()["description"] == "A project"

    def test_creator_becomes_owner_member(
        self,
        client: TestClient,
        owner: object,
        owner_token: str,
    ) -> None:
        res = client.post(
            "/projects",
            json={"name": "My Project"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        project_id = res.json()["id"]
        members = client.get(
            f"/projects/{project_id}/members",
            headers={"Authorization": f"Bearer {owner_token}"},
        ).json()
        owner_members = [m for m in members if m["role"] == "owner"]
        assert len(owner_members) == 1
        assert owner_members[0]["user_id"] == str(owner.id)  # type: ignore[union-attr]

    def test_empty_name_rejected(
        self,
        client: TestClient,
        owner_token: str,
    ) -> None:
        res = client.post(
            "/projects",
            json={"name": ""},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 422

    def test_requires_auth(self, client: TestClient) -> None:
        res = client.post("/projects", json={"name": "X"})
        assert res.status_code == 401


# ─── GET /projects/{id} ───────────────────────────────────────────────────


class TestGetProject:
    def test_owner_can_get(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["id"] == str(project.id)  # type: ignore[union-attr]

    def test_viewer_can_get(
        self,
        client: TestClient,
        project_with_viewer: object,
        viewer_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project_with_viewer.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200

    def test_non_member_gets_403(
        self,
        client: TestClient,
        project: object,
        viewer_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403

    def test_unknown_project_returns_404(
        self,
        client: TestClient,
        owner_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{uuid.uuid4()}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code in (403, 404)


# ─── PATCH /projects/{id} ─────────────────────────────────────────────────


class TestPatchProject:
    def test_owner_can_patch(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.patch(
            f"/projects/{project.id}",  # type: ignore[union-attr]
            json={"name": "Renamed"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "Renamed"

    def test_editor_cannot_patch(
        self,
        client: TestClient,
        project_with_editor: object,
        editor_token: str,
    ) -> None:
        res = client.patch(
            f"/projects/{project_with_editor.id}",  # type: ignore[union-attr]
            json={"name": "Renamed"},
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 403

    def test_viewer_cannot_patch(
        self,
        client: TestClient,
        project_with_viewer: object,
        viewer_token: str,
    ) -> None:
        res = client.patch(
            f"/projects/{project_with_viewer.id}",  # type: ignore[union-attr]
            json={"name": "Renamed"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403


# ─── DELETE /projects/{id} ────────────────────────────────────────────────


class TestDeleteProject:
    def test_owner_can_delete(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.delete(
            f"/projects/{project.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 204

    def test_editor_cannot_delete(
        self,
        client: TestClient,
        project_with_editor: object,
        editor_token: str,
    ) -> None:
        res = client.delete(
            f"/projects/{project_with_editor.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 403


# ─── GET /projects/{id}/members ───────────────────────────────────────────


class TestListMembers:
    def test_returns_owner_member(
        self,
        client: TestClient,
        project: object,
        owner: object,
        owner_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}/members",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        roles = {m["role"] for m in res.json()}
        assert "owner" in roles

    def test_viewer_can_list(
        self,
        client: TestClient,
        project_with_viewer: object,
        viewer_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project_with_viewer.id}/members",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200

    def test_non_member_gets_403(
        self,
        client: TestClient,
        project: object,
        viewer_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}/members",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403


# ─── POST /projects/{id}/members ──────────────────────────────────────────


class TestAddMember:
    def test_owner_can_add_member(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
        editor: object,
    ) -> None:
        res = client.post(
            f"/projects/{project.id}/members",  # type: ignore[union-attr]
            json={"user_id": str(editor.id), "role": "editor"},  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["role"] == "editor"
        assert body["user_id"] == str(editor.id)  # type: ignore[union-attr]

    def test_editor_cannot_add_member(
        self,
        client: TestClient,
        project_with_editor: object,
        editor_token: str,
        viewer: object,
    ) -> None:
        res = client.post(
            f"/projects/{project_with_editor.id}/members",  # type: ignore[union-attr]
            json={"user_id": str(viewer.id), "role": "viewer"},  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 403


# ─── PATCH /projects/{id}/members/{user_id} ───────────────────────────────


class TestPatchMember:
    def test_owner_can_change_role(
        self,
        client: TestClient,
        project_with_editor: object,
        owner_token: str,
        editor: object,
    ) -> None:
        res = client.patch(
            f"/projects/{project_with_editor.id}/members/{editor.id}",  # type: ignore[union-attr]
            json={"role": "viewer"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["role"] == "viewer"

    def test_editor_cannot_change_role(
        self,
        client: TestClient,
        project_with_editor: object,
        editor_token: str,
        owner: object,
    ) -> None:
        res = client.patch(
            f"/projects/{project_with_editor.id}/members/{owner.id}",  # type: ignore[union-attr]
            json={"role": "viewer"},
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 403


# ─── DELETE /projects/{id}/members/{user_id} ──────────────────────────────


class TestRemoveMember:
    def test_owner_can_remove(
        self,
        client: TestClient,
        project_with_editor: object,
        owner_token: str,
        editor: object,
    ) -> None:
        res = client.delete(
            f"/projects/{project_with_editor.id}/members/{editor.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 204

    def test_editor_cannot_remove(
        self,
        client: TestClient,
        project_with_editor: object,
        editor_token: str,
        owner: object,
    ) -> None:
        res = client.delete(
            f"/projects/{project_with_editor.id}/members/{owner.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 403


# ─── GET /projects/{id}/agents ────────────────────────────────────────────


class TestListAgents:
    def test_owner_sees_empty_list(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}/agents",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json() == []

    def test_non_member_gets_403(
        self,
        client: TestClient,
        project: object,
        viewer_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}/agents",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403


# ─── POST /projects/{id}/agents ───────────────────────────────────────────


class TestCreateAgent:
    def test_editor_can_create(
        self,
        client: TestClient,
        project_with_editor: object,
        editor_token: str,
    ) -> None:
        res = client.post(
            f"/projects/{project_with_editor.id}/agents",  # type: ignore[union-attr]
            json={"name": "Coder", "role": "coder"},
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["name"] == "Coder"
        assert body["role"] == "coder"
        assert body["has_llm_api_key"] is False

    def test_owner_can_create(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.post(
            f"/projects/{project.id}/agents",  # type: ignore[union-attr]
            json={"name": "Planner", "role": "planner"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 201

    def test_viewer_cannot_create(
        self,
        client: TestClient,
        project_with_viewer: object,
        viewer_token: str,
    ) -> None:
        res = client.post(
            f"/projects/{project_with_viewer.id}/agents",  # type: ignore[union-attr]
            json={"name": "Agent", "role": "custom"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403

    def test_llm_api_key_not_exposed(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.post(
            f"/projects/{project.id}/agents",  # type: ignore[union-attr]
            json={"name": "Secure", "role": "coder", "llm_api_key": "super-secret"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 201
        body = res.json()
        assert "llm_api_key" not in body
        assert body["has_llm_api_key"] is True


# ─── GET /projects/{id}/agents/{agent_id} ─────────────────────────────────


class TestGetAgent:
    def test_viewer_can_get(
        self,
        client: TestClient,
        project_with_viewer: object,
        owner_token: str,
        viewer_token: str,
    ) -> None:
        # Owner creates an agent first
        create_res = client.post(
            f"/projects/{project_with_viewer.id}/agents",  # type: ignore[union-attr]
            json={"name": "Tester", "role": "tester"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        agent_id = create_res.json()["id"]

        res = client.get(
            f"/projects/{project_with_viewer.id}/agents/{agent_id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200
        assert res.json()["id"] == agent_id

    def test_unknown_agent_returns_404(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}/agents/{uuid.uuid4()}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 404


# ─── PATCH /projects/{id}/agents/{agent_id} ───────────────────────────────


class TestPatchAgent:
    def test_editor_can_patch(
        self,
        client: TestClient,
        project_with_editor: object,
        owner_token: str,
        editor_token: str,
    ) -> None:
        create_res = client.post(
            f"/projects/{project_with_editor.id}/agents",  # type: ignore[union-attr]
            json={"name": "Old", "role": "coder"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        agent_id = create_res.json()["id"]

        res = client.patch(
            f"/projects/{project_with_editor.id}/agents/{agent_id}",  # type: ignore[union-attr]
            json={"name": "New"},
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "New"

    def test_viewer_cannot_patch(
        self,
        client: TestClient,
        project_with_viewer: object,
        owner_token: str,
        viewer_token: str,
    ) -> None:
        create_res = client.post(
            f"/projects/{project_with_viewer.id}/agents",  # type: ignore[union-attr]
            json={"name": "Agent", "role": "coder"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        agent_id = create_res.json()["id"]

        res = client.patch(
            f"/projects/{project_with_viewer.id}/agents/{agent_id}",  # type: ignore[union-attr]
            json={"name": "Hacked"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403


# ─── DELETE /projects/{id}/agents/{agent_id} ──────────────────────────────


class TestDeleteAgent:
    def test_editor_can_delete(
        self,
        client: TestClient,
        project_with_editor: object,
        owner_token: str,
        editor_token: str,
    ) -> None:
        create_res = client.post(
            f"/projects/{project_with_editor.id}/agents",  # type: ignore[union-attr]
            json={"name": "ToDelete", "role": "coder"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        agent_id = create_res.json()["id"]

        res = client.delete(
            f"/projects/{project_with_editor.id}/agents/{agent_id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 204

    def test_viewer_cannot_delete(
        self,
        client: TestClient,
        project_with_viewer: object,
        owner_token: str,
        viewer_token: str,
    ) -> None:
        create_res = client.post(
            f"/projects/{project_with_viewer.id}/agents",  # type: ignore[union-attr]
            json={"name": "Protected", "role": "coder"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        agent_id = create_res.json()["id"]

        res = client.delete(
            f"/projects/{project_with_viewer.id}/agents/{agent_id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403
