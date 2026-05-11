"""Integration tests for message endpoints.

Routes under test:
  GET    /projects/{project_id}/messages
  POST   /projects/{project_id}/messages
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from starlette.testclient import TestClient

from tests.helpers.factories import (
    create_message,
    create_plan,
    create_project,
    create_project_member,
    create_user,
    make_token,
)

pytestmark = pytest.mark.integration


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def owner(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="owner@test.com"))


@pytest.fixture
def owner_token(owner: object) -> str:
    return make_token(owner)  # type: ignore[arg-type]


@pytest.fixture
def viewer(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="viewer@test.com"))


@pytest.fixture
def viewer_token(viewer: object) -> str:
    return make_token(viewer)  # type: ignore[arg-type]


@pytest.fixture
def outsider(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="outsider@test.com"))


@pytest.fixture
def outsider_token(outsider: object) -> str:
    return make_token(outsider)  # type: ignore[arg-type]


# ─── GET /projects/{project_id}/messages ─────────────────────────────────────


class TestListMessages:
    def test_empty_list(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/messages",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json() == []

    def test_lists_messages(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        db(lambda s: create_message(s, project.id, content="First"))  # type: ignore[union-attr]
        db(lambda s: create_message(s, project.id, content="Second"))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/messages",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert len(res.json()) == 2

    def test_excludes_other_project_messages(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project_a = db(lambda s: create_project(s, owner_id=owner.id, name="A"))  # type: ignore[union-attr]
        project_b = db(lambda s: create_project(s, owner_id=owner.id, name="B"))  # type: ignore[union-attr]
        db(lambda s: create_message(s, project_a.id, content="From A"))  # type: ignore[union-attr]
        db(lambda s: create_message(s, project_b.id, content="From B"))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project_a.id}/messages",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["content"] == "From A"

    def test_viewer_can_list(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        viewer: object,
        viewer_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        db(lambda s: create_project_member(s, viewer.id, project.id, "viewer"))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/messages",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200

    def test_outsider_forbidden(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        outsider_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/messages",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {outsider_token}"},
        )
        assert res.status_code == 403

    def test_filter_by_plan(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        """Messages tied to a specific plan appear in the project-level list."""
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        db(lambda s: create_message(s, project.id, plan_id=plan.id, content="Linked"))  # type: ignore[union-attr]
        db(lambda s: create_message(s, project.id, content="Unlinked"))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/messages",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert len(res.json()) == 2
        linked = [m for m in res.json() if m["plan_id"] == str(plan.id)]  # type: ignore[union-attr]
        assert len(linked) == 1


# ─── POST /projects/{project_id}/messages ────────────────────────────────────


class TestCreateMessage:
    def test_creates_message(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        res = client.post(
            f"/projects/{project.id}/messages",  # type: ignore[union-attr]
            json={"role": "user", "content": "Hello world"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["role"] == "user"
        assert data["content"] == "Hello world"
        assert data["project_id"] == str(project.id)  # type: ignore[union-attr]
        assert data["plan_id"] is None

    def test_creates_message_with_plan(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        res = client.post(
            f"/projects/{project.id}/messages",  # type: ignore[union-attr]
            json={"role": "assistant", "content": "I can help", "plan_id": str(plan.id)},  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 201
        assert res.json()["plan_id"] == str(plan.id)  # type: ignore[union-attr]

    def test_viewer_cannot_create(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        viewer: object,
        viewer_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        db(lambda s: create_project_member(s, viewer.id, project.id, "viewer"))  # type: ignore[union-attr]
        res = client.post(
            f"/projects/{project.id}/messages",  # type: ignore[union-attr]
            json={"role": "user", "content": "Blocked"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403

    def test_unauthenticated(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        res = client.post(
            f"/projects/{project.id}/messages",  # type: ignore[union-attr]
            json={"role": "user", "content": "No auth"},
        )
        assert res.status_code == 401
