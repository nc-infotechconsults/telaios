"""Integration tests for workspace endpoints.

Ported from ``data-api/src/__tests__/integration/workspaces.test.ts``.

Routes under test:
  GET    /projects/{project_id}/workspaces
  POST   /projects/{project_id}/workspaces
  GET    /workspaces/{workspace_id}
  PATCH  /workspaces/{workspace_id}
  DELETE /workspaces/{workspace_id}
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
    create_workspace,
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
    return db(lambda s: create_user(s, email="member@test.com", system_role="member"))


@pytest.fixture
def member_token(member: object) -> str:
    return make_token(member)  # type: ignore[arg-type]


# ─── GET /projects/{project_id}/workspaces ────────────────────────────────


class TestListWorkspaces:
    def test_empty_list(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/workspaces",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        assert res.json() == []

    def test_lists_project_workspaces(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        db(lambda s: create_workspace(s, project.id, name="WS-1", created_by=member.id))  # type: ignore[union-attr]
        db(lambda s: create_workspace(s, project.id, name="WS-2", created_by=member.id))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/workspaces",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        assert len(res.json()) == 2

    def test_viewer_can_list(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        viewer = db(lambda s: create_user(s, email="viewer@test.com"))
        db(
            lambda s: create_project_member(
                s,
                viewer.id,
                project.id,
                role="viewer",  # type: ignore[union-attr]
            )
        )
        viewer_token = make_token(viewer)  # type: ignore[arg-type]
        res = client.get(
            f"/projects/{project.id}/workspaces",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200

    def test_no_token_returns_401(
        self, client: TestClient, db: Callable[..., object], member: object
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        res = client.get(f"/projects/{project.id}/workspaces")  # type: ignore[union-attr]
        assert res.status_code == 401

    def test_non_member_returns_403(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        other = db(lambda s: create_user(s, email="other@test.com"))
        other_token = make_token(other)  # type: ignore[arg-type]
        res = client.get(
            f"/projects/{project.id}/workspaces",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert res.status_code == 403

    def test_admin_bypasses_membership(
        self, client: TestClient, db: Callable[..., object], member: object, admin_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/workspaces",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200


# ─── POST /projects/{project_id}/workspaces ───────────────────────────────


class TestCreateWorkspace:
    def test_owner_can_create(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        res = client.post(
            f"/projects/{project.id}/workspaces",  # type: ignore[union-attr]
            json={"name": "My Workspace"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["name"] == "My Workspace"
        assert str(body["project_id"]) == str(project.id)  # type: ignore[union-attr]
        assert body["status"] == "idle"

    def test_editor_can_create(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        editor = db(lambda s: create_user(s, email="editor@test.com"))
        db(
            lambda s: create_project_member(
                s,
                editor.id,
                project.id,
                role="editor",  # type: ignore[union-attr]
            )
        )
        editor_token = make_token(editor)  # type: ignore[arg-type]
        res = client.post(
            f"/projects/{project.id}/workspaces",  # type: ignore[union-attr]
            json={"name": "Editor WS"},
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 201

    def test_creates_with_config(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        res = client.post(
            f"/projects/{project.id}/workspaces",  # type: ignore[union-attr]
            json={
                "name": "Configured WS",
                "config": {
                    "agent_profile_id": "ap-1",
                    "env_vars": {"NODE_ENV": "development"},
                    "devcontainer_overrides": {"image": "node:20"},
                },
            },
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 201
        assert res.json()["config"]["agent_profile_id"] == "ap-1"

    def test_viewer_returns_403(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        viewer = db(lambda s: create_user(s, email="viewer2@test.com"))
        db(
            lambda s: create_project_member(
                s,
                viewer.id,
                project.id,
                role="viewer",  # type: ignore[union-attr]
            )
        )
        viewer_token = make_token(viewer)  # type: ignore[arg-type]
        res = client.post(
            f"/projects/{project.id}/workspaces",  # type: ignore[union-attr]
            json={"name": "Viewer WS"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403

    def test_missing_name_returns_422(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        res = client.post(
            f"/projects/{project.id}/workspaces",  # type: ignore[union-attr]
            json={},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 422

    def test_no_token_returns_401(
        self, client: TestClient, db: Callable[..., object], member: object
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        res = client.post(
            f"/projects/{project.id}/workspaces",  # type: ignore[union-attr]
            json={"name": "WS"},
        )
        assert res.status_code == 401


# ─── GET /workspaces/{workspace_id} ──────────────────────────────────────


class TestGetWorkspace:
    def test_member_can_fetch(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        ws = db(lambda s: create_workspace(s, project.id, name="Detail WS", created_by=member.id))  # type: ignore[union-attr]
        res = client.get(
            f"/workspaces/{ws.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        assert str(res.json()["id"]) == str(ws.id)  # type: ignore[union-attr]
        assert res.json()["name"] == "Detail WS"

    def test_unknown_workspace_returns_404(
        self, client: TestClient, db: Callable[..., object], member_token: str
    ) -> None:
        res = client.get(
            f"/workspaces/{uuid.uuid4()}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        # 404 (not found) — 403 also acceptable per TS test
        assert res.status_code in (403, 404)

    def test_no_token_returns_401(
        self, client: TestClient, db: Callable[..., object], member: object
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        ws = db(lambda s: create_workspace(s, project.id))  # type: ignore[union-attr]
        res = client.get(f"/workspaces/{ws.id}")  # type: ignore[union-attr]
        assert res.status_code == 401

    def test_admin_can_access_any(
        self, client: TestClient, db: Callable[..., object], member: object, admin_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        ws = db(lambda s: create_workspace(s, project.id))  # type: ignore[union-attr]
        res = client.get(
            f"/workspaces/{ws.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200


# ─── PATCH /workspaces/{workspace_id} ────────────────────────────────────


class TestPatchWorkspace:
    def test_owner_can_rename(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        ws = db(lambda s: create_workspace(s, project.id, created_by=member.id))  # type: ignore[union-attr]
        res = client.patch(
            f"/workspaces/{ws.id}",  # type: ignore[union-attr]
            json={"name": "Renamed WS"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "Renamed WS"

    def test_owner_can_update_status(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        ws = db(lambda s: create_workspace(s, project.id, created_by=member.id))  # type: ignore[union-attr]
        res = client.patch(
            f"/workspaces/{ws.id}",  # type: ignore[union-attr]
            json={"status": "running"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "running"

    def test_invalid_status_returns_422(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        ws = db(lambda s: create_workspace(s, project.id, created_by=member.id))  # type: ignore[union-attr]
        res = client.patch(
            f"/workspaces/{ws.id}",  # type: ignore[union-attr]
            json={"status": "nonexistent"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 422

    def test_no_token_returns_401(
        self, client: TestClient, db: Callable[..., object], member: object
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        ws = db(lambda s: create_workspace(s, project.id))  # type: ignore[union-attr]
        res = client.patch(f"/workspaces/{ws.id}", json={"name": "x"})  # type: ignore[union-attr]
        assert res.status_code == 401


# ─── DELETE /workspaces/{workspace_id} ───────────────────────────────────


class TestDeleteWorkspace:
    def test_owner_can_delete(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        ws = db(lambda s: create_workspace(s, project.id, created_by=member.id))  # type: ignore[union-attr]
        res = client.delete(
            f"/workspaces/{ws.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert res.status_code == 204

    def test_soft_deleted_workspace_returns_404(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        ws = db(lambda s: create_workspace(s, project.id, created_by=member.id))  # type: ignore[union-attr]
        client.delete(
            f"/workspaces/{ws.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {member_token}"},
        )
        get_res = client.get(
            f"/workspaces/{ws.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert get_res.status_code == 404

    def test_viewer_returns_403(
        self, client: TestClient, db: Callable[..., object], member: object, member_token: str
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        ws = db(lambda s: create_workspace(s, project.id))  # type: ignore[union-attr]
        viewer = db(lambda s: create_user(s, email="viewer3@test.com"))
        db(
            lambda s: create_project_member(
                s,
                viewer.id,
                project.id,
                role="viewer",  # type: ignore[union-attr]
            )
        )
        viewer_token = make_token(viewer)  # type: ignore[arg-type]
        res = client.delete(
            f"/workspaces/{ws.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403

    def test_no_token_returns_401(
        self, client: TestClient, db: Callable[..., object], member: object
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=member.id))  # type: ignore[union-attr]
        ws = db(lambda s: create_workspace(s, project.id))  # type: ignore[union-attr]
        res = client.delete(f"/workspaces/{ws.id}")  # type: ignore[union-attr]
        assert res.status_code == 401
