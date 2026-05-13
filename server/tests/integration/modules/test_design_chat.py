"""Integration tests for design chat endpoints.

Routes under test:
  GET    /projects/{project_id}/design/sessions
  POST   /projects/{project_id}/design/sessions
  GET    /design/sessions/{session_id}
  GET    /design/sessions/{session_id}/messages
  GET    /design/sessions/{session_id}/artifacts
  POST   /design/sessions/{session_id}/message
"""

from __future__ import annotations

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


@pytest.fixture
def owner(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="owner-design@test.com"))


@pytest.fixture
def owner_token(owner: object) -> str:
    return make_token(owner)  # type: ignore[arg-type]


@pytest.fixture
def editor(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="editor-design@test.com"))


@pytest.fixture
def editor_token(editor: object) -> str:
    return make_token(editor)  # type: ignore[arg-type]


@pytest.fixture
def viewer(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="viewer-design@test.com"))


@pytest.fixture
def viewer_token(viewer: object) -> str:
    return make_token(viewer)  # type: ignore[arg-type]


@pytest.fixture
def outsider(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="outsider-design@test.com"))


@pytest.fixture
def outsider_token(outsider: object) -> str:
    return make_token(outsider)  # type: ignore[arg-type]


class TestDesignSessions:
    def test_owner_can_create_and_list_sessions(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]

        created = client.post(
            f"/projects/{project.id}/design/sessions",  # type: ignore[union-attr]
            json={"title": "Landing page exploration"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert created.status_code == 201
        assert created.json()["status"] == "active"
        assert created.json()["title"] == "Landing page exploration"

        listed = client.get(
            f"/projects/{project.id}/design/sessions",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert listed.status_code == 200
        assert len(listed.json()) == 1

    def test_viewer_cannot_create_session(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        viewer: object,
        viewer_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        db(lambda s: create_project_member(s, viewer.id, project.id, "viewer"))  # type: ignore[union-attr]

        created = client.post(
            f"/projects/{project.id}/design/sessions",  # type: ignore[union-attr]
            json={"title": "Viewer create attempt"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert created.status_code == 403


class TestDesignConversation:
    def test_send_message_generates_assistant_and_artifact_revision(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]

        created = client.post(
            f"/projects/{project.id}/design/sessions",  # type: ignore[union-attr]
            json={"title": "Marketing hero"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert created.status_code == 201
        session_id = created.json()["id"]

        message = client.post(
            f"/design/sessions/{session_id}/message",
            json={"content": "Design a modern hero section with CTA and trust badges."},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert message.status_code == 202

        messages = client.get(
            f"/design/sessions/{session_id}/messages",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert messages.status_code == 200
        payload = messages.json()
        assert any(m["role"] == "user" for m in payload)
        assert any(m["role"] == "assistant" for m in payload)

        artifacts = client.get(
            f"/design/sessions/{session_id}/artifacts",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert artifacts.status_code == 200
        artifact_rows = artifacts.json()
        assert len(artifact_rows) == 1
        assert artifact_rows[0]["revision"] == 1
        assert "<" in artifact_rows[0]["html_content"]
        assert artifact_rows[0]["artifact_metadata"]["source"] in {"llm", "fallback"}

    def test_second_turn_creates_new_artifact_revision(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]

        created = client.post(
            f"/projects/{project.id}/design/sessions",  # type: ignore[union-attr]
            json={"title": "Dashboard UI"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        session_id = created.json()["id"]

        for prompt in (
            "Create a dashboard with KPI cards and a trend chart.",
            "Revise it with a compact sidebar and denser table rows.",
        ):
            posted = client.post(
                f"/design/sessions/{session_id}/message",
                json={"content": prompt},
                headers={"Authorization": f"Bearer {owner_token}"},
            )
            assert posted.status_code == 202

        artifacts = client.get(
            f"/design/sessions/{session_id}/artifacts",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        revisions = [a["revision"] for a in artifacts.json()]
        assert revisions == [1, 2]


class TestDesignSessionAccess:
    def test_outsider_cannot_read_session(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
        outsider_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]

        created = client.post(
            f"/projects/{project.id}/design/sessions",  # type: ignore[union-attr]
            json={"title": "Private design"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        session_id = created.json()["id"]

        res = client.get(
            f"/design/sessions/{session_id}",
            headers={"Authorization": f"Bearer {outsider_token}"},
        )
        assert res.status_code == 403
