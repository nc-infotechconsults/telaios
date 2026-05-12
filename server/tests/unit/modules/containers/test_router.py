"""Unit tests for environment-scoped Docker container routes."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.ext.asyncio import AsyncSession
from starlette.testclient import TestClient

from telaios.auth.dependencies import set_user_loader
from telaios.auth.jwt import issue_token
from telaios.db.session import get_session
from telaios.main import create_app


def _token(user_id: uuid.UUID) -> str:
    return issue_token(user_id=str(user_id), email="user@test.com", system_role="member")


def _scalar_result(value: object | None) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def test_env_scoped_route_forbids_non_member_instead_of_missing_project_id() -> None:
    app = create_app()
    set_user_loader(None)

    project_id = uuid.uuid4()
    env_id = uuid.uuid4()
    session = AsyncMock(spec=AsyncSession)
    session.execute.side_effect = [
        _scalar_result(project_id),
        _scalar_result(None),
    ]

    async def override_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = override_session

    with TestClient(app, raise_server_exceptions=False) as client:
        res = client.get(
            f"/environments/{env_id}/docker/containers",
            headers={"Authorization": f"Bearer {_token(uuid.uuid4())}"},
        )

    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"
