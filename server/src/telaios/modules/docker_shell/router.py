"""Docker shell WebSocket router.

WebSocket endpoint:
  ws /ws/environments/{env_id}/docker/shell/{container_id}?token=<JWT>

Protocol (identical to the legacy TS implementation):
  client → server: raw stdin bytes OR JSON resize ``{"type":"resize","cols":N,"rows":N}``
  server → client: raw stdout/stderr bytes from the container PTY

The Python docker SDK's ``exec_start(socket=True, tty=True)`` returns a
``docker.types.daemon.CancellableStream`` whose ``._sock`` is a raw socket.
TTY mode means no multiplex framing — bytes are raw PTY output, same as the
legacy TS raw-socket approach.

We bridge the raw socket ↔ WebSocket using two asyncio tasks:
  1. reader — runs ``sock.recv()`` in a thread pool and forwards to WS
  2. writer — receives WS messages and writes to the socket
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import secrets
import time
import uuid
from dataclasses import dataclass
from typing import Any

import structlog
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_environment_project_access
from telaios.db.models.environments import Environment
from telaios.db.session import get_session, get_sessionmaker
from telaios.infra.docker import DockerClient, DockerConnectionConfig
from telaios.utils.crypto import decrypt

log = structlog.get_logger(__name__)

docker_shell_router = APIRouter(tags=["docker-shell"])

_SHELL_CMD = "/bin/sh -c 'if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi'"
_SHELL_TICKET_TTL_SECONDS = 30


@dataclass(frozen=True)
class _ShellTicket:
    principal: Principal
    env_id: uuid.UUID
    container_id: str
    expires_at: float


_shell_tickets: dict[str, _ShellTicket] = {}


def _issue_shell_ticket(principal: Principal, env_id: uuid.UUID, container_id: str) -> str:
    ticket = secrets.token_urlsafe(32)
    _shell_tickets[ticket] = _ShellTicket(
        principal=principal,
        env_id=env_id,
        container_id=container_id,
        expires_at=time.monotonic() + _SHELL_TICKET_TTL_SECONDS,
    )
    return ticket


def _consume_shell_ticket(ticket: str, env_id: uuid.UUID, container_id: str) -> Principal | None:
    payload = _shell_tickets.pop(ticket, None)
    if payload is None:
        return None
    if time.monotonic() > payload.expires_at:
        return None
    if payload.env_id != env_id or payload.container_id != container_id:
        return None
    return payload.principal


def _build_cfg(connection_config_encrypted: str | None) -> DockerConnectionConfig:
    """Decrypt and parse the environment's connection config."""
    if not connection_config_encrypted:
        return DockerConnectionConfig()
    raw = decrypt(connection_config_encrypted)
    if not raw:
        return DockerConnectionConfig()
    try:
        data: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError, TypeError:
        return DockerConnectionConfig()
    return DockerConnectionConfig(
        host=data.get("host"),
        tls_cert=data.get("tls_cert"),
        tls_key=data.get("tls_key"),
        tls_ca=data.get("tls_ca"),
        type=data.get("type", "docker"),
    )


async def _resolve_config(session: AsyncSession, env_id: uuid.UUID) -> DockerConnectionConfig:
    # list_by_project requires project_id — use a raw find instead
    result = await session.execute(
        select(Environment).where(Environment.id == env_id, Environment.deleted_at.is_(None))
    )
    env = result.scalars().first()
    if env is None:
        raise ValueError(f"Environment {env_id} not found")
    return _build_cfg(env.connection_config)


@docker_shell_router.post("/environments/{env_id}/docker/shell/{container_id}/ticket")
async def create_docker_shell_ticket(
    env_id: uuid.UUID,
    container_id: str,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> dict[str, int | str]:
    """Issue a short-lived one-time ticket for a Docker shell WebSocket."""
    await check_environment_project_access(env_id, principal, session, min_role="editor")
    ticket = _issue_shell_ticket(principal, env_id, container_id)
    return {"ticket": ticket, "expires_in": _SHELL_TICKET_TTL_SECONDS}


@docker_shell_router.websocket("/ws/environments/{env_id}/docker/shell/{container_id}")
async def docker_shell(
    websocket: WebSocket,
    env_id: uuid.UUID,
    container_id: str,
    ticket: str = "",
) -> None:
    # ── Auth ──────────────────────────────────────────────────────────────────
    principal = _consume_shell_ticket(ticket, env_id, container_id)
    if principal is None:
        await websocket.close(code=4001)
        return

    async with get_sessionmaker()() as session:
        try:
            await check_environment_project_access(env_id, principal, session, min_role="editor")
        except Exception:
            await websocket.close(code=4003)
            return

        # ── Resolve Docker config ─────────────────────────────────────────────
        try:
            cfg = await _resolve_config(session, env_id)
        except Exception as exc:
            log.error("docker_shell.config_error", env_id=str(env_id), error=str(exc))
            await websocket.close(code=4000)
            return

    await websocket.accept()

    # ── Build docker client and create exec ───────────────────────────────────
    try:
        sync_client = DockerClient.build_client_sync(cfg)
        container = sync_client.containers.get(container_id)
        exec_obj = sync_client.api.exec_create(
            container.id,
            cmd=[
                "/bin/sh",
                "-c",
                "if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi",
            ],
            stdin=True,
            stdout=True,
            stderr=True,
            tty=True,
        )
        exec_id: str = exec_obj["Id"]
        # exec_start with socket=True returns a generator; .makefile() on the
        # underlying socket gives us a readable/writable raw socket.
        sock_gen = sync_client.api.exec_start(exec_id, detach=False, socket=True, tty=True)
        raw_sock = sock_gen._sock  # private socket from docker SDK CancellableStream
        raw_sock.setblocking(False)
    except Exception as exc:
        log.error(
            "docker_shell.exec_create_error",
            env_id=str(env_id),
            container_id=container_id,
            error=str(exc),
        )
        await websocket.close(code=4000)
        return

    loop = asyncio.get_event_loop()
    send_queue: asyncio.Queue[bytes | None] = asyncio.Queue()

    # ── Reader task: socket → WebSocket ───────────────────────────────────────
    async def reader() -> None:
        try:
            while True:
                try:
                    chunk: bytes = await loop.run_in_executor(None, raw_sock.recv, 4096)
                    if not chunk:
                        break
                    await websocket.send_bytes(chunk)
                except OSError:
                    break
        except WebSocketDisconnect, RuntimeError:
            pass
        finally:
            await send_queue.put(None)  # signal writer to stop

    # ── Writer task: WebSocket → socket ───────────────────────────────────────
    async def writer() -> None:
        try:
            while True:
                try:
                    data = await websocket.receive()
                except WebSocketDisconnect, RuntimeError:
                    break
                raw: bytes | str | None = data.get("bytes") or data.get("text")
                if raw is None:
                    break
                # Handle resize JSON
                text = raw if isinstance(raw, str) else raw.decode("utf-8", errors="ignore")
                try:
                    msg = json.loads(text)
                    if (
                        isinstance(msg, dict)
                        and msg.get("type") == "resize"
                        and isinstance(msg.get("cols"), int)
                        and isinstance(msg.get("rows"), int)
                    ):
                        sync_client.api.exec_resize(exec_id, height=msg["rows"], width=msg["cols"])
                        continue
                except json.JSONDecodeError, ValueError:
                    pass
                # Raw stdin
                payload = raw if isinstance(raw, bytes) else raw.encode("utf-8")
                try:
                    await loop.run_in_executor(None, raw_sock.sendall, payload)
                except OSError:
                    break
        finally:
            await send_queue.put(None)

    reader_task = asyncio.create_task(reader())
    writer_task = asyncio.create_task(writer())
    log.info("docker_shell.started", env_id=str(env_id), container_id=container_id)

    # Wait for either side to close
    _done, pending = await asyncio.wait(
        [reader_task, writer_task],
        return_when=asyncio.FIRST_COMPLETED,
    )
    for t in pending:
        t.cancel()
    with contextlib.suppress(OSError):
        raw_sock.close()
    with contextlib.suppress(RuntimeError):
        await websocket.close()
    log.info("docker_shell.ended", env_id=str(env_id), container_id=container_id)
