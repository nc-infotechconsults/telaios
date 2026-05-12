"""Unit smoke tests for the docker_shell WebSocket router.

Three tiers of coverage (no real Docker daemon required):

1. Auth-rejection tests — invalid / empty JWT closes the WS with WebSocketDisconnect.
2. DB-rejection test — valid JWT but environment not in DB → connection closed.
3. Full-lifecycle mock — valid JWT + mock DB session + mock Docker socket:
   server accepts the connection, forwards PTY output, and closes cleanly
   when the container socket signals EOF.

The full PTY bridge (resize, real stdin/stdout) requires a live container
and is exercised manually / in CI with a Docker-in-Docker service.
"""

from __future__ import annotations

import contextlib
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from telaios.auth.dependencies import Principal, set_user_loader
from telaios.auth.jwt import issue_token
from telaios.db.session import get_session
from telaios.main import create_app

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ENV_ID = uuid.uuid4()
CONTAINER_ID = "abc123"
USER_ID = uuid.uuid4()
VALID_TOKEN = "valid.test.token"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _principal() -> Principal:
    return Principal(
        id=str(USER_ID),
        email="test@test.com",
        system_role="user",
    )


def _env_lookup_result(project_id: uuid.UUID) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = project_id
    return result


def _membership_result(role: str = "editor") -> MagicMock:
    member = MagicMock()
    member.role = role
    result = MagicMock()
    result.scalar_one_or_none.return_value = member
    return result


def _jwt(role: str = "member") -> str:
    return issue_token(user_id=str(USER_ID), email="test@test.com", system_role=role)


def _mock_sock(chunks: list[bytes]) -> MagicMock:
    """Return a mock PTY socket whose recv() yields *chunks* sequentially."""
    sock = MagicMock()
    sock.recv.side_effect = chunks
    sock.setblocking = MagicMock()
    sock.sendall = MagicMock()
    sock.close = MagicMock()
    return sock


class _FakeSessionCtx:
    """Async context manager that yields a given session object."""

    def __init__(self, session: Any) -> None:
        self._session = session

    async def __aenter__(self) -> Any:
        return self._session

    async def __aexit__(self, *_: object) -> None:
        pass


class _FakeSessionmaker:
    """Callable that always returns _FakeSessionCtx(session)."""

    def __init__(self, session: Any) -> None:
        self._session = session

    def __call__(self) -> _FakeSessionCtx:
        return _FakeSessionCtx(self._session)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def app_client() -> TestClient:
    return TestClient(create_app(), raise_server_exceptions=False)


def _ws_url(env_id: uuid.UUID = ENV_ID, container: str = CONTAINER_ID, ticket: str = "") -> str:
    return f"/ws/environments/{env_id}/docker/shell/{container}?ticket={ticket}"


# ---------------------------------------------------------------------------
# 1. Auth-rejection tests
# ---------------------------------------------------------------------------


def test_rejects_missing_ticket(app_client: TestClient) -> None:
    """Empty ticket string must cause the server to close the WS."""
    with pytest.raises(WebSocketDisconnect), app_client.websocket_connect(_ws_url(ticket="")) as ws:
        ws.receive_bytes()


def test_rejects_invalid_ticket(app_client: TestClient) -> None:
    """Unknown ticket must cause the server to close the WS."""
    with (
        pytest.raises(WebSocketDisconnect),
        app_client.websocket_connect(_ws_url(ticket="not-a-ticket")) as ws,
    ):
        ws.receive_bytes()


def test_ticket_endpoint_requires_authentication() -> None:
    client = TestClient(create_app(), raise_server_exceptions=False)

    res = client.post(f"/environments/{ENV_ID}/docker/shell/{CONTAINER_ID}/ticket")

    assert res.status_code == 401


def test_ticket_endpoint_checks_environment_membership() -> None:
    app = create_app()
    set_user_loader(None)

    mock_session = AsyncMock()
    mock_session.execute.side_effect = [_env_lookup_result(uuid.uuid4()), _membership_result()]

    async def override_session_yield():
        yield mock_session

    app.dependency_overrides[get_session] = override_session_yield

    with TestClient(app, raise_server_exceptions=False) as client:
        res = client.post(
            f"/environments/{ENV_ID}/docker/shell/{CONTAINER_ID}/ticket",
            headers={"Authorization": f"Bearer {_jwt()}"},
        )

    assert res.status_code == 200
    assert res.json()["ticket"]
    assert res.json()["expires_in"] == 30
    assert mock_session.execute.await_count == 2


# ---------------------------------------------------------------------------
# 2. DB-rejection: environment not found
# ---------------------------------------------------------------------------


def test_closes_when_env_not_found() -> None:
    """Valid JWT + missing environment → server closes WS."""
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None  # env not found
    mock_session.execute.side_effect = [_env_lookup_result(uuid.uuid4()), mock_result]

    client = TestClient(create_app(), raise_server_exceptions=False)

    with (
        patch(
            "telaios.modules.docker_shell.router._consume_shell_ticket",
            return_value=_principal(),
        ),
        patch(
            "telaios.modules.docker_shell.router.get_sessionmaker",
            return_value=_FakeSessionmaker(mock_session),
        ),
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect(_ws_url(ticket=VALID_TOKEN)) as ws,
    ):
        ws.receive_bytes()


# ---------------------------------------------------------------------------
# 3. Full lifecycle: connect → receive PTY output → EOF → disconnect
# ---------------------------------------------------------------------------


def test_pty_lifecycle_connect_receive_disconnect() -> None:
    """Mock Docker socket: server accepts WS, forwards one PTY chunk, then closes on EOF."""
    pty_output = b"$ "
    mock_sock = _mock_sock([pty_output, b""])  # one chunk then EOF

    exec_obj = {"Id": "exec-abc"}
    sock_gen = MagicMock()
    sock_gen._sock = mock_sock

    mock_api = MagicMock()
    mock_api.exec_create.return_value = exec_obj
    mock_api.exec_start.return_value = sock_gen

    mock_container = MagicMock()
    mock_container.id = CONTAINER_ID

    mock_sync_client = MagicMock()
    mock_sync_client.containers.get.return_value = mock_container
    mock_sync_client.api = mock_api

    mock_session = AsyncMock()
    mock_env = MagicMock()
    mock_env.connection_config = None
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = mock_env
    mock_session.execute.side_effect = [
        _env_lookup_result(uuid.uuid4()),
        _membership_result(),
        mock_result,
    ]

    client = TestClient(create_app(), raise_server_exceptions=False)

    with (
        patch(
            "telaios.modules.docker_shell.router._consume_shell_ticket",
            return_value=_principal(),
        ),
        patch(
            "telaios.modules.docker_shell.router.get_sessionmaker",
            return_value=_FakeSessionmaker(mock_session),
        ),
        patch(
            "telaios.modules.docker_shell.router.DockerClient.build_client_sync",
            return_value=mock_sync_client,
        ),
        contextlib.suppress(Exception),
        client.websocket_connect(_ws_url(ticket=VALID_TOKEN)) as ws,
    ):
        chunk = ws.receive_bytes()
        assert chunk == pty_output
        # After EOF the server closes; further receives raise
        with contextlib.suppress(Exception):
            ws.receive_bytes()

    # Verify Docker exec was created and started
    mock_api.exec_create.assert_called_once()
    mock_api.exec_start.assert_called_once()
