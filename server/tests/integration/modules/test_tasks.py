"""Integration tests for task endpoints.

Routes under test:
  GET    /plans/{plan_id}/tasks
  POST   /plans/{plan_id}/tasks
  GET    /tasks/{task_id}
  PATCH  /tasks/{task_id}
  POST   /tasks/{task_id}/retry
  POST   /tasks/{task_id}/cancel
  GET    /tasks/{task_id}/artifacts
  POST   /tasks/{task_id}/artifacts/bulk
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from starlette.testclient import TestClient

from tests.helpers.factories import (
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


# ─── GET /plans/{plan_id}/tasks ───────────────────────────────────────────────


class TestListTasks:
    def test_empty_list(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        res = client.get(
            f"/plans/{plan.id}/tasks",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json() == []

    def test_lists_tasks(
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
        res = client.get(
            f"/plans/{plan.id}/tasks",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert len(res.json()) == 2

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
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        res = client.get(
            f"/plans/{plan.id}/tasks",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200

    def test_unknown_plan_not_found(
        self,
        client: TestClient,
        owner_token: str,
    ) -> None:
        res = client.get(
            f"/plans/{uuid.uuid4()}/tasks",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 404


# ─── POST /plans/{plan_id}/tasks ──────────────────────────────────────────────


class TestCreateTask:
    def test_creates_task(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        res = client.post(
            f"/plans/{plan.id}/tasks",  # type: ignore[union-attr]
            json={"title": "Implement login", "type": "code"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["title"] == "Implement login"
        assert data["type"] == "code"
        assert data["status"] == "pending"
        assert data["plan_id"] == str(plan.id)  # type: ignore[union-attr]

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
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        res = client.post(
            f"/plans/{plan.id}/tasks",  # type: ignore[union-attr]
            json={"title": "Blocked"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 403


# ─── GET /tasks/{task_id} ─────────────────────────────────────────────────────


class TestGetTask:
    def test_get_task(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        task = db(lambda s: create_task(s, plan.id, title="My Task"))  # type: ignore[union-attr]
        res = client.get(
            f"/tasks/{task.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["title"] == "My Task"

    def test_not_found(
        self,
        client: TestClient,
        owner_token: str,
    ) -> None:
        res = client.get(
            f"/tasks/{uuid.uuid4()}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 404


# ─── PATCH /tasks/{task_id} ───────────────────────────────────────────────────


class TestPatchTask:
    def test_patch_title_and_status(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        task = db(lambda s: create_task(s, plan.id, title="Old"))  # type: ignore[union-attr]
        res = client.patch(
            f"/tasks/{task.id}",  # type: ignore[union-attr]
            json={"title": "New", "status": "in_progress"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["title"] == "New"
        assert data["status"] == "in_progress"


# ─── POST /tasks/{task_id}/retry ──────────────────────────────────────────────


class TestRetryTask:
    def test_retry_failed_task(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        task = db(lambda s: create_task(s, plan.id, status="failed"))  # type: ignore[union-attr]
        res = client.post(
            f"/tasks/{task.id}/retry",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "pending"


# ─── POST /tasks/{task_id}/cancel ─────────────────────────────────────────────


class TestCancelTask:
    def test_cancel_pending_task(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        task = db(lambda s: create_task(s, plan.id))  # type: ignore[union-attr]
        res = client.post(
            f"/tasks/{task.id}/cancel",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "cancelled"


# ─── GET /tasks/{task_id}/artifacts ───────────────────────────────────────────


class TestListArtifacts:
    def test_empty_artifacts(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        task = db(lambda s: create_task(s, plan.id))  # type: ignore[union-attr]
        res = client.get(
            f"/tasks/{task.id}/artifacts",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert res.json() == []


# ─── POST /tasks/{task_id}/artifacts/bulk ─────────────────────────────────────


class TestBulkCreateArtifacts:
    def test_bulk_create(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        task = db(lambda s: create_task(s, plan.id))  # type: ignore[union-attr]
        res = client.post(
            f"/tasks/{task.id}/artifacts/bulk",  # type: ignore[union-attr]
            json={
                "artifacts": [
                    {"type": "log", "title": "Build log", "content": "All good"},
                    {"type": "diff", "title": "Patch", "content": "--- a\n+++ b"},
                ]
            },
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 201
        items = res.json()
        assert len(items) == 2
        titles = {a["title"] for a in items}
        assert titles == {"Build log", "Patch"}

    def test_then_list_returns_artifacts(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id))  # type: ignore[union-attr]
        task = db(lambda s: create_task(s, plan.id))  # type: ignore[union-attr]
        client.post(
            f"/tasks/{task.id}/artifacts/bulk",  # type: ignore[union-attr]
            json={"artifacts": [{"type": "log", "title": "Run log", "content": "ok"}]},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        res = client.get(
            f"/tasks/{task.id}/artifacts",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["title"] == "Run log"
