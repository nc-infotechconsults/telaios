"""Integration tests for repository endpoints.

Routes under test:
  GET    /projects/{project_id}/repositories
  POST   /projects/{project_id}/repositories
  GET    /projects/{project_id}/repositories/{repo_id}
  PATCH  /projects/{project_id}/repositories/{repo_id}
  DELETE /projects/{project_id}/repositories/{repo_id}
  POST   /repositories/test
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from starlette.testclient import TestClient

from tests.helpers.factories import (
    create_project,
    create_project_member,
    create_repository,
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
def unrelated(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="unrelated@test.com"))


@pytest.fixture
def unrelated_token(unrelated: object) -> str:
    return make_token(unrelated)  # type: ignore[arg-type]


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


# ─── GET /projects/{project_id}/repositories ──────────────────────────────


class TestListRepositories:
    def test_empty_list(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}/repositories",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json() == []

    def test_lists_repositories(
        self,
        client: TestClient,
        db: Callable[..., object],
        project: object,
        owner_token: str,
    ) -> None:
        db(lambda s: create_repository(s, project.id, name="repo-a"))  # type: ignore[union-attr]
        db(lambda s: create_repository(s, project.id, name="repo-b"))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/repositories",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        names = {r["name"] for r in res.json()}
        assert names == {"repo-a", "repo-b"}

    def test_viewer_can_list(
        self,
        client: TestClient,
        project_with_viewer: object,
        viewer_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project_with_viewer.id}/repositories",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200

    def test_non_member_gets_403(
        self,
        client: TestClient,
        project: object,
        unrelated_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}/repositories",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {unrelated_token}"},
        )
        assert res.status_code == 403

    def test_requires_auth(
        self,
        client: TestClient,
        project: object,
    ) -> None:
        res = client.get(f"/projects/{project.id}/repositories")  # type: ignore[union-attr]
        assert res.status_code == 401


# ─── POST /projects/{project_id}/repositories ─────────────────────────────


class TestCreateRepository:
    def test_editor_can_create(
        self,
        client: TestClient,
        project_with_editor: object,
        editor_token: str,
    ) -> None:
        res = client.post(
            f"/projects/{project_with_editor.id}/repositories",  # type: ignore[union-attr]
            json={"name": "my-repo"},
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["name"] == "my-repo"
        assert body["branch"] == "main"
        assert body["has_credentials"] is False

    def test_owner_can_create(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.post(
            f"/projects/{project.id}/repositories",  # type: ignore[union-attr]
            json={"name": "owner-repo"},
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
            f"/projects/{project_with_viewer.id}/repositories",  # type: ignore[union-attr]
            json={"name": "viewer-repo"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403

    def test_empty_name_rejected(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.post(
            f"/projects/{project.id}/repositories",  # type: ignore[union-attr]
            json={"name": ""},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 422

    def test_requires_auth(
        self,
        client: TestClient,
        project: object,
    ) -> None:
        res = client.post(
            f"/projects/{project.id}/repositories",  # type: ignore[union-attr]
            json={"name": "x"},
        )
        assert res.status_code == 401


# ─── GET /projects/{project_id}/repositories/{repo_id} ────────────────────


class TestGetRepository:
    def test_owner_can_get(
        self,
        client: TestClient,
        db: Callable[..., object],
        project: object,
        owner_token: str,
    ) -> None:
        repo = db(lambda s: create_repository(s, project.id, name="fetch-me"))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/repositories/{repo.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "fetch-me"

    def test_viewer_can_get(
        self,
        client: TestClient,
        db: Callable[..., object],
        project_with_viewer: object,
        viewer_token: str,
    ) -> None:
        repo = db(  # type: ignore[union-attr]
            lambda s: create_repository(s, project_with_viewer.id, name="readable")  # type: ignore[union-attr]
        )
        res = client.get(
            f"/projects/{project_with_viewer.id}/repositories/{repo.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200

    def test_unknown_repo_returns_404(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.get(
            f"/projects/{project.id}/repositories/{uuid.uuid4()}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 404

    def test_non_member_gets_403(
        self,
        client: TestClient,
        db: Callable[..., object],
        project: object,
        unrelated_token: str,
    ) -> None:
        repo = db(lambda s: create_repository(s, project.id))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/repositories/{repo.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {unrelated_token}"},
        )
        assert res.status_code == 403


# ─── PATCH /projects/{project_id}/repositories/{repo_id} ──────────────────


class TestPatchRepository:
    def test_editor_can_patch(
        self,
        client: TestClient,
        db: Callable[..., object],
        project_with_editor: object,
        editor_token: str,
    ) -> None:
        repo = db(  # type: ignore[union-attr]
            lambda s: create_repository(s, project_with_editor.id, name="old-name")  # type: ignore[union-attr]
        )
        res = client.patch(
            f"/projects/{project_with_editor.id}/repositories/{repo.id}",  # type: ignore[union-attr]
            json={"name": "new-name"},
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "new-name"

    def test_viewer_cannot_patch(
        self,
        client: TestClient,
        db: Callable[..., object],
        project_with_viewer: object,
        viewer_token: str,
    ) -> None:
        repo = db(  # type: ignore[union-attr]
            lambda s: create_repository(s, project_with_viewer.id)  # type: ignore[union-attr]
        )
        res = client.patch(
            f"/projects/{project_with_viewer.id}/repositories/{repo.id}",  # type: ignore[union-attr]
            json={"name": "hacked"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403

    def test_patch_not_found(
        self,
        client: TestClient,
        project: object,
        owner_token: str,
    ) -> None:
        res = client.patch(
            f"/projects/{project.id}/repositories/{uuid.uuid4()}",
            json={"name": "x"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 404


# ─── DELETE /projects/{project_id}/repositories/{repo_id} ─────────────────


class TestDeleteRepository:
    def test_editor_can_delete(
        self,
        client: TestClient,
        db: Callable[..., object],
        project_with_editor: object,
        editor_token: str,
    ) -> None:
        repo = db(  # type: ignore[union-attr]
            lambda s: create_repository(s, project_with_editor.id)  # type: ignore[union-attr]
        )
        res = client.delete(
            f"/projects/{project_with_editor.id}/repositories/{repo.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {editor_token}"},
        )
        assert res.status_code == 204

    def test_viewer_cannot_delete(
        self,
        client: TestClient,
        db: Callable[..., object],
        project_with_viewer: object,
        viewer_token: str,
    ) -> None:
        repo = db(  # type: ignore[union-attr]
            lambda s: create_repository(s, project_with_viewer.id)  # type: ignore[union-attr]
        )
        res = client.delete(
            f"/projects/{project_with_viewer.id}/repositories/{repo.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403

    def test_owner_can_delete(
        self,
        client: TestClient,
        db: Callable[..., object],
        project: object,
        owner_token: str,
    ) -> None:
        repo = db(lambda s: create_repository(s, project.id))  # type: ignore[union-attr]
        res = client.delete(
            f"/projects/{project.id}/repositories/{repo.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 204


# ─── POST /repositories/test ──────────────────────────────────────────────


class TestRepositoryTest:
    def test_authenticated_can_test_invalid_git_url(
        self,
        client: TestClient,
        owner_token: str,
    ) -> None:
        res = client.post(
            "/repositories/test",
            json={"provider_type": "git", "remote_url": ""},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is False
        assert body["code"] == "INVALID_URL"

    def test_authenticated_can_test_s3_missing_bucket(
        self,
        client: TestClient,
        owner_token: str,
    ) -> None:
        res = client.post(
            "/repositories/test",
            json={"provider_type": "s3"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is False
        assert body["code"] == "INVALID_PATH"

    def test_requires_auth(self, client: TestClient) -> None:
        res = client.post(
            "/repositories/test",
            json={"provider_type": "git", "remote_url": ""},
        )
        assert res.status_code == 401
