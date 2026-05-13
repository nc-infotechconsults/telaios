"""Integration tests for chat planning endpoints.

Routes under test:
  GET  /chat/{plan_id}/stream
  POST /chat/{plan_id}/message
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.testclient import TestClient

from telaios.db.models.documents import Document, DocumentChunk
from tests.helpers.factories import (
    create_plan,
    create_project,
    create_project_member,
    create_repository,
    create_user,
    make_token,
)

pytestmark = pytest.mark.integration


@pytest.fixture
def owner(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="owner-chat@test.com"))


@pytest.fixture
def owner_token(owner: object) -> str:
    return make_token(owner)  # type: ignore[arg-type]


@pytest.fixture
def viewer(db: Callable[..., object]) -> object:
    return db(lambda s: create_user(s, email="viewer-chat@test.com"))


@pytest.fixture
def viewer_token(viewer: object) -> str:
    return make_token(viewer)  # type: ignore[arg-type]


async def _create_ready_document_with_chunk(
    session: AsyncSession,
    project_id: uuid.UUID,
    *,
    name: str = "knowledge.md",
    chunk_text: str = "OAuth2 device flow is required for authentication.",
) -> Document:
    doc = Document(
        project_id=project_id,
        name=name,
        file_type="md",
        mime_type="text/markdown",
        s3_key=f"test/{project_id}/{uuid.uuid4()}/{name}",
        size_bytes=128,
        checksum_sha256="deadbeef",
        status="ready",
        doc_metadata={"source": "integration-test"},
    )
    session.add(doc)
    await session.flush()
    await session.refresh(doc)

    chunk = DocumentChunk(
        document_id=doc.id,
        chunk_index=0,
        content=chunk_text,
        embedding=None,
        chunk_metadata={"kind": "test"},
    )
    session.add(chunk)
    await session.flush()
    return doc


class TestChatPlanning:
    def test_send_message_generates_assistant_and_tasks_with_project_knowledge(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id, title="Auth plan"))  # type: ignore[union-attr]
        repo = db(
            lambda s: create_repository(
                s,
                project.id,  # type: ignore[union-attr]
                name="auth-service",
                remote_url="https://github.com/acme/auth-service",
                branch="main",
                status="ready",
            )
        )
        document = db(
            lambda s: _create_ready_document_with_chunk(
                s,
                project.id,  # type: ignore[union-attr]
                name="requirements.md",
                chunk_text="Authentication must use OAuth2 Device Authorization Grant.",
            )
        )

        res = client.post(
            f"/chat/{plan.id}/message",  # type: ignore[union-attr]
            json={
                "content": "Create an implementation plan for auth using repository and document knowledge.",
            },
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert res.status_code == 202

        messages_res = client.get(
            f"/plans/{plan.id}/messages",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert messages_res.status_code == 200
        messages = messages_res.json()
        assert len(messages) >= 2
        assert any(m["role"] == "assistant" for m in messages)
        assistant_content = "\n".join(m["content"] for m in messages if m["role"] == "assistant")
        assert "auth-service" in assistant_content
        assert "requirements.md" in assistant_content

        tasks_res = client.get(
            f"/plans/{plan.id}/tasks",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert tasks_res.status_code == 200
        tasks = tasks_res.json()
        assert len(tasks) >= 3
        assert any(str(repo.id) in (t.get("repository_ids") or []) for t in tasks)  # type: ignore[union-attr]
        assert any("requirements.md" in (t.get("description") or "") for t in tasks)
        assert str(document.id)

    def test_confirm_message_marks_plan_confirmed(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        owner_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id, title="Confirmable"))  # type: ignore[union-attr]

        # First turn generates a draft/tasks.
        first = client.post(
            f"/chat/{plan.id}/message",  # type: ignore[union-attr]
            json={"content": "Draft a plan for adding auth."},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert first.status_code == 202

        # Confirm turn should flip plan status.
        confirm = client.post(
            f"/chat/{plan.id}/message",  # type: ignore[union-attr]
            json={"content": "confirm"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert confirm.status_code == 202

        get_plan = client.get(
            f"/plans/{plan.id}",  # type: ignore[union-attr]
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert get_plan.status_code == 200
        assert get_plan.json()["status"] == "confirmed"

    def test_viewer_can_send_message(
        self,
        client: TestClient,
        db: Callable[..., object],
        owner: object,
        viewer: object,
        viewer_token: str,
    ) -> None:
        project = db(lambda s: create_project(s, owner_id=owner.id))  # type: ignore[union-attr]
        db(lambda s: create_project_member(s, viewer.id, project.id, "viewer"))  # type: ignore[union-attr]
        plan = db(lambda s: create_plan(s, project.id, title="Viewer plan"))  # type: ignore[union-attr]

        res = client.post(
            f"/chat/{plan.id}/message",  # type: ignore[union-attr]
            json={"content": "Please propose a draft."},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 202
