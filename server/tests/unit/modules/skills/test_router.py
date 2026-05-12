"""Unit tests for skills router authorization."""

from __future__ import annotations

import uuid
from unittest.mock import patch

from starlette.testclient import TestClient

from telaios.auth.dependencies import set_user_loader
from telaios.auth.jwt import issue_token
from telaios.main import create_app


def _token(system_role: str = "member") -> str:
    return issue_token(
        user_id=str(uuid.uuid4()),
        email=f"{system_role}@test.com",
        system_role=system_role,
    )


def test_reload_requires_authentication() -> None:
    app = create_app()
    set_user_loader(None)

    with TestClient(app, raise_server_exceptions=False) as client:
        res = client.post("/skills/reload")

    assert res.status_code == 401


def test_reload_forbids_non_admin() -> None:
    app = create_app()
    set_user_loader(None)

    with TestClient(app, raise_server_exceptions=False) as client:
        res = client.post("/skills/reload", headers={"Authorization": f"Bearer {_token()}"})

    assert res.status_code == 403


def test_reload_allows_admin() -> None:
    app = create_app()
    set_user_loader(None)

    with (
        patch(
            "telaios.modules.skills.router.reload_skills", return_value={"loaded": 0, "errors": []}
        ),
        TestClient(app, raise_server_exceptions=False) as client,
    ):
        res = client.post("/skills/reload", headers={"Authorization": f"Bearer {_token('admin')}"})

    assert res.status_code == 200
    assert res.json() == {"loaded": 0, "errors": []}


def test_install_forbids_non_admin() -> None:
    app = create_app()
    set_user_loader(None)

    with TestClient(app, raise_server_exceptions=False) as client:
        res = client.post(
            "/skills/install",
            json={"zip_path": "/tmp/skill.zip"},
            headers={"Authorization": f"Bearer {_token()}"},
        )

    assert res.status_code == 403
