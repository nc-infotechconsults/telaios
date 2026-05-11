"""Integration tests for environment endpoints.

Routes under test:
  GET    /projects/{project_id}/environments
  POST   /projects/{project_id}/environments
  GET    /projects/{project_id}/environments/{env_id}
  PATCH  /projects/{project_id}/environments/{env_id}
  DELETE /projects/{project_id}/environments/{env_id}
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from starlette.testclient import TestClient

from tests.helpers.factories import (
    create_environment,
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
        lambda s: create_project_member(  # type: ignore[return-value]
            s,
            editor.id,
            project.id,
            role="editor",  # type: ignore[union-attr]
        )
    )
    return project


@pytest.fixture
def project_with_viewer(db: Callable[..., object], project: object, viewer: object) -> object:
    db(
        lambda s: create_project_member(  # type: ignore[return-value]
            s,
            viewer.id,
            project.id,
            role="viewer",  # type: ignore[union-attr]
        )
    )
    return project


# ─── GET /projects/{project_id}/environments ──────────────────────────────


class TestListEnvironments:
    def test_empty_list(
        self,
        client: TestClient,
        db: Callable[..., object],
        project: object,
        owner_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}/environments",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json() == []

    def test_lists_environments(
        self,
        client: TestClient,
        db: Callable[..., object],
        project: object,
        owner_token: str,
    ) -> None:
        db(lambda s: create_environment(s, project.id, name="Staging"))  # type: ignore[union-attr]
        db(lambda s: create_environment(s, project.id, name="Production"))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/environments",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        names = {e["name"] for e in res.json()}
        assert names == {"Staging", "Production"}

    def test_requires_auth(self, client: TestClient, project: object) -> None:
        res = client.get(f"/projects/{project.id}/environments")  # type: ignore[union-attr]
        assert res.status_code == 401

    def test_forbids_non_member(
        self, client: TestClient, project: object, viewer_token: str
    ) -> None:
        # viewer is not yet a member
        res = client.get(
            f"/projects/{project.id}/environments",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403


# ─── POST /projects/{project_id}/environments ─────────────────────────────


class TestCreateEnvironment:
    def test_editor_can_create(
        self,
        client: TestClient,
        project_with_editor: object,
        editor_token: str,
    ) -> None:
        res = client.post(
            f"/projects/{project_with_editor.id}/environments",  # type: ignore[union-attr]
            json={"name": "Dev", "type": "kubernetes"},
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["name"] == "Dev"
        assert body["type"] == "kubernetes"
        assert body["status"] == "disconnected"

    def test_viewer_cannot_create(
        self,
        client: TestClient,
        project_with_viewer: object,
        viewer_token: str,
    ) -> None:
        res = client.post(
            f"/projects/{project_with_viewer.id}/environments",  # type: ignore[union-attr]
            json={"name": "Dev", "type": "kubernetes"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403

    def test_requires_auth(self, client: TestClient, project: object) -> None:
        res = client.post(
            f"/projects/{project.id}/environments",  # type: ignore[union-attr]
            json={"name": "Dev", "type": "kubernetes"},
        )
        assert res.status_code == 401


# ─── GET /projects/{project_id}/environments/{env_id} ────────────────────


class TestGetEnvironment:
    def test_owner_can_get(
        self,
        client: TestClient,
        db: Callable[..., object],
        project: object,
        owner_token: str,
    ) -> None:
        env = db(lambda s: create_environment(s, project.id, name="Staging"))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/environments/{env.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "Staging"

    def test_unknown_env_returns_404(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}/environments/{uuid.uuid4()}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 404


# ─── PATCH /projects/{project_id}/environments/{env_id} ──────────────────


class TestPatchEnvironment:
    def test_editor_can_patch(
        self,
        client: TestClient,
        db: Callable[..., object],
        project_with_editor: object,
        editor_token: str,
    ) -> None:
        env = db(  # type: ignore[union-attr]
            lambda s: create_environment(s, project_with_editor.id, name="Old")  # type: ignore[union-attr]
        )
        res = client.patch(
            f"/projects/{project_with_editor.id}/environments/{env.id}",  # type: ignore[union-attr]
            json={"name": "New"},
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "New"

    def test_viewer_cannot_patch(
        self,
        client: TestClient,
        db: Callable[..., object],
        project_with_viewer: object,
        viewer_token: str,
        owner: object,
        owner_token: str,
    ) -> None:
        env = db(  # type: ignore[union-attr]
            lambda s: create_environment(s, project_with_viewer.id, name="Env")  # type: ignore[union-attr]
        )
        res = client.patch(
            f"/projects/{project_with_viewer.id}/environments/{env.id}",  # type: ignore[union-attr]
            json={"name": "New"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403


# ─── DELETE /projects/{project_id}/environments/{env_id} ─────────────────


class TestDeleteEnvironment:
    def test_owner_can_delete(
        self,
        client: TestClient,
        db: Callable[..., object],
        project: object,
        owner_token: str,
    ) -> None:
        env = db(lambda s: create_environment(s, project.id))  # type: ignore[union-attr]
        res = client.delete(
            f"/projects/{project.id}/environments/{env.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 204

    def test_editor_cannot_delete(
        self,
        client: TestClient,
        db: Callable[..., object],
        project_with_editor: object,
        editor_token: str,
    ) -> None:
        env = db(  # type: ignore[union-attr]
            lambda s: create_environment(s, project_with_editor.id)  # type: ignore[union-attr]
        )
        res = client.delete(
            f"/projects/{project_with_editor.id}/environments/{env.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 403
