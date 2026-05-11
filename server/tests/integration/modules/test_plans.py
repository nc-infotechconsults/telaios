"""Integration tests for plan endpoints.

Routes under test:
  GET    /projects/{project_id}/plans
  POST   /projects/{project_id}/plans
  GET    /plans/{plan_id}
  PATCH  /plans/{plan_id}
  DELETE /plans/{plan_id}
  DELETE /plans/{plan_id}/tasks  (bulk delete)
  POST   /plans/{plan_id}/cancel
  GET    /plans/{plan_id}/messages
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
    create_task,
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


# ─── GET /projects/{project_id}/plans ────────────────────────────────────────


class TestListPlans:
    def test_empty_list(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/plans",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json() == []

    def test_lists_plans(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        db(lambda s: create_plan(s, project.id, title="Plan A"))  # type: ignore[union-attr]
        db(lambda s: create_plan(s, project.id, title="Plan B"))  # type: ignore[union-attr]
        res = client.get(
            f"/projects/{project.id}/plans",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        titles = {p["title"] for p in res.json()}
        assert titles == {"Plan A", "Plan B"}

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
            f"/projects/{project.id}/plans",  # type: ignore[union-attr]
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
            f"/projects/{project.id}/plans",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {outsider_token}"},
        )
        assert res.status_code == 403

    def test_unauthenticated(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        res = client.get(f"/projects/{project.id}/plans")  # type: ignore[union-attr]
        assert res.status_code == 401


# ─── POST /projects/{project_id}/plans ───────────────────────────────────────


class TestCreatePlan:
    def test_creates_plan(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        res = client.post(
            f"/projects/{project.id}/plans",  # type: ignore[union-attr]
            json={"title": "My Plan"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["title"] == "My Plan"
        assert data["status"] == "draft"
        assert data["project_id"] == str(project.id)  # type: ignore[union-attr]

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
            f"/projects/{project.id}/plans",  # type: ignore[union-attr]
            json={"title": "Should Fail"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403


# ─── GET /plans/{plan_id} ─────────────────────────────────────────────────────


class TestGetPlan:
    def test_get_plan(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id, title="Alpha"))  # type: ignore[union-attr]
        res = client.get(
            f"/plans/{plan.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["title"] == "Alpha"

    def test_not_found(
        self,
        client: TestClient,
        owner_token: str,
    ) -> None:
        import uuid

        res = client.get(
            f"/plans/{uuid.uuid4()}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 404


# ─── PATCH /plans/{plan_id} ───────────────────────────────────────────────────


class TestPatchPlan:
    def test_patch_title(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id, title="Old"))  # type: ignore[union-attr]
        res = client.patch(
            f"/plans/{plan.id}",  # type: ignore[union-attr]
            json={"title": "New"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["title"] == "New"

    def test_patch_status(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        res = client.patch(
            f"/plans/{plan.id}",  # type: ignore[union-attr]
            json={"status": "confirmed"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "confirmed"


# ─── DELETE /plans/{plan_id} ──────────────────────────────────────────────────


class TestDeletePlan:
    def test_deletes_plan(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        res = client.delete(
            f"/plans/{plan.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 204
        # confirm soft-deleted (get returns 404)
        res2 = client.get(
            f"/plans/{plan.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res2.status_code == 404


# ─── DELETE /plans/{plan_id}/tasks ────────────────────────────────────────────


class TestDeletePlanTasks:
    def test_bulk_delete_tasks(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        db(lambda s: create_task(s, plan.id, title="T1"))  # type: ignore[union-attr]
        db(lambda s: create_task(s, plan.id, title="T2"))  # type: ignore[union-attr]
        res = client.delete(
            f"/plans/{plan.id}/tasks",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["deleted"] == 2


# ─── POST /plans/{plan_id}/cancel ─────────────────────────────────────────────


class TestCancelPlan:
    def test_cancel_no_active_tasks(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        res = client.post(
            f"/plans/{plan.id}/cancel",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["cancelled"] == 0

    def test_cancel_in_progress_tasks(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        db(lambda s: create_task(s, plan.id, title="Active", status="in_progress"))  # type: ignore[union-attr]
        res = client.post(
            f"/plans/{plan.id}/cancel",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["cancelled"] == 1


# ─── GET /plans/{plan_id}/messages ────────────────────────────────────────────


class TestGetPlanMessages:
    def test_returns_messages_for_plan(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        db(lambda s: create_message(s, project.id, plan_id=plan.id, content="Hello"))  # type: ignore[union-attr]
        db(lambda s: create_message(s, project.id, plan_id=plan.id, content="World"))  # type: ignore[union-attr]
        res = client.get(
            f"/plans/{plan.id}/messages",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert len(res.json()) == 2

    def test_excludes_other_plan_messages(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan_a = db(lambda s: create_plan(s, project.id, title="A"))  # type: ignore[union-attr]
        plan_b = db(lambda s: create_plan(s, project.id, title="B"))  # type: ignore[union-attr]
        db(lambda s: create_message(s, project.id, plan_id=plan_a.id, content="For A"))  # type: ignore[union-attr]
        db(lambda s: create_message(s, project.id, plan_id=plan_b.id, content="For B"))  # type: ignore[union-attr]
        res = client.get(
            f"/plans/{plan_a.id}/messages",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["content"] == "For A"
