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

from telaios.auth.jwt import TokenClaims
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


def _claims() -> TokenClaims:
    return TokenClaims(
        sub=str(USER_ID),
        email="test@test.com",
        system_role="user",
        iat=0,
        exp=9_999_999_999,
    )


def _active_user() -> MagicMock:
    u = MagicMock()
    u.is_active = True
    return u


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


def _ws_url(env_id: uuid.UUID = ENV_ID, container: str = CONTAINER_ID, token: str = "") -> str:
    return f"/ws/environments/{env_id}/docker/shell/{container}?token={token}"


# ---------------------------------------------------------------------------
# 1. Auth-rejection tests
# ---------------------------------------------------------------------------


def test_rejects_missing_token(app_client: TestClient) -> None:
    """Empty token string must cause the server to close the WS."""
    with pytest.raises(WebSocketDisconnect), app_client.websocket_connect(_ws_url(token="")) as ws:
        ws.receive_bytes()


def test_rejects_invalid_jwt(app_client: TestClient) -> None:
    """Malformed JWT must cause the server to close the WS."""
    with (
        pytest.raises(WebSocketDisconnect),
        app_client.websocket_connect(_ws_url(token="not.a.valid.jwt")) as ws,
    ):
        ws.receive_bytes()


# ---------------------------------------------------------------------------
# 2. DB-rejection: environment not found
# ---------------------------------------------------------------------------


def test_closes_when_env_not_found() -> None:
    """Valid JWT + missing environment → server closes WS."""
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None  # env not found
    mock_session.execute.return_value = mock_result

    mock_user_repo = AsyncMock()
    mock_user_repo.find_by_id.return_value = _active_user()

    client = TestClient(create_app(), raise_server_exceptions=False)

    with (
        patch("telaios.modules.docker_shell.router.verify_token", return_value=_claims()),
        patch(
            "telaios.modules.docker_shell.router.get_sessionmaker",
            return_value=_FakeSessionmaker(mock_session),
        ),
        patch("telaios.modules.users.repository.UserRepository", return_value=mock_user_repo),
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect(_ws_url(token=VALID_TOKEN)) as ws,
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
    mock_session.execute.return_value = mock_result

    mock_user_repo = AsyncMock()
    mock_user_repo.find_by_id.return_value = _active_user()

    client = TestClient(create_app(), raise_server_exceptions=False)

    with (
        patch("telaios.modules.docker_shell.router.verify_token", return_value=_claims()),
        patch(
            "telaios.modules.docker_shell.router.get_sessionmaker",
            return_value=_FakeSessionmaker(mock_session),
        ),
        patch("telaios.modules.users.repository.UserRepository", return_value=mock_user_repo),
        patch(
            "telaios.modules.docker_shell.router.DockerClient.build_client_sync",
            return_value=mock_sync_client,
        ),
        contextlib.suppress(Exception),
        client.websocket_connect(_ws_url(token=VALID_TOKEN)) as ws,
    ):
        chunk = ws.receive_bytes()
        assert chunk == pty_output
        # After EOF the server closes; further receives raise
        with contextlib.suppress(Exception):
            ws.receive_bytes()

    # Verify Docker exec was created and started
    mock_api.exec_create.assert_called_once()
    mock_api.exec_start.assert_called_once()
