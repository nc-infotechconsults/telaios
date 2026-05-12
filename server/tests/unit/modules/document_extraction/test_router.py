"""Unit tests for document extraction router authorization."""

from __future__ import annotations

import time
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from starlette.testclient import TestClient

from telaios.auth.dependencies import set_user_loader
from telaios.auth.jwt import issue_token
from telaios.infra.jobs import Job
from telaios.main import create_app


def _token() -> str:
    return issue_token(
        user_id=str(uuid.uuid4()),
        email="user@test.com",
        system_role="member",
    )


def _job(document_id: uuid.UUID) -> Job:
    return Job(
        id="job_123",
        type="analyze",
        status="completed",
        document_id=str(document_id),
        created_at=time.time(),
        updated_at=time.time(),
        result={"summary": "ok"},
        progress=100,
    )


def test_get_job_status_requires_authentication() -> None:
    app = create_app()
    set_user_loader(None)

    with TestClient(app, raise_server_exceptions=False) as client:
        res = client.get("/document-jobs/job_123")

    assert res.status_code == 401


def test_get_job_status_checks_document_access() -> None:
    app = create_app()
    set_user_loader(None)
    document_id = uuid.uuid4()
    tracker = MagicMock()
    tracker.get_job.return_value = _job(document_id)

    with (
        patch("telaios.modules.document_extraction.router.get_job_tracker", return_value=tracker),
        patch(
            "telaios.modules.document_extraction.router._check_doc_access",
            new=AsyncMock(),
        ) as check_doc_access,
        TestClient(app, raise_server_exceptions=False) as client,
    ):
        res = client.get(
            "/document-jobs/job_123",
            headers={"Authorization": f"Bearer {_token()}"},
        )

    assert res.status_code == 200
    check_doc_access.assert_awaited_once()
    assert check_doc_access.await_args.args[0] == document_id


def test_list_jobs_requires_authentication() -> None:
    app = create_app()
    set_user_loader(None)

    with TestClient(app, raise_server_exceptions=False) as client:
        res = client.get("/document-jobs")

    assert res.status_code == 401


def test_list_jobs_requires_document_filter_for_members() -> None:
    app = create_app()
    set_user_loader(None)
    tracker = MagicMock()

    with (
        patch("telaios.modules.document_extraction.router.get_job_tracker", return_value=tracker),
        TestClient(app, raise_server_exceptions=False) as client,
    ):
        res = client.get(
            "/document-jobs",
            headers={"Authorization": f"Bearer {_token()}"},
        )

    assert res.status_code == 400
    tracker.list_jobs.assert_not_called()


def test_list_jobs_checks_document_access_when_filtered() -> None:
    app = create_app()
    set_user_loader(None)
    document_id = uuid.uuid4()
    tracker = MagicMock()
    tracker.list_jobs.return_value = [_job(document_id)]

    with (
        patch("telaios.modules.document_extraction.router.get_job_tracker", return_value=tracker),
        patch(
            "telaios.modules.document_extraction.router._check_doc_access",
            new=AsyncMock(),
        ) as check_doc_access,
        TestClient(app, raise_server_exceptions=False) as client,
    ):
        res = client.get(
            f"/document-jobs?document_id={document_id}",
            headers={"Authorization": f"Bearer {_token()}"},
        )

    assert res.status_code == 200
    check_doc_access.assert_awaited_once()
    assert check_doc_access.await_args.args[0] == document_id
