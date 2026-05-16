"""Containers HTTP router.

All endpoints are scoped under ``/environments/{env_id}/docker/...`` and
delegate to ``telaios.modules.containers.service.ContainersService``.
Auth is done via the standard project-member check (viewer role minimum).

The environment must have ``type == "docker"``; otherwise 400 is returned.
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.project_access import require_environment_project_access
from telaios.db.session import get_session
from telaios.modules.containers.service import ContainersService
from telaios.utils.errors import NotFoundError

log = structlog.get_logger(__name__)

containers_router = APIRouter(
    prefix="/environments/{env_id}/docker",
    tags=["containers"],
)


def _handle_docker_error(exc: Exception) -> HTTPException:
    msg = str(exc)
    log.error("docker_error", error=msg)
    if "404" in msg or "no such" in msg.lower():
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
    return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=msg)


class CreateContainerBody(BaseModel):
    image: str
    name: str | None = None
    cmd: list[str] | None = None
    env: dict[str, str] | None = None
    ports: list[dict[str, Any]] | None = None
    volumes: list[dict[str, Any]] | None = None
    network: str | None = None
    auto_remove: bool = False
    start: bool = False


class ExecContainerBody(BaseModel):
    cmd: list[str]
    working_dir: str | None = None
    user: str | None = None
    timeout_ms: int = 30_000


class ImageTagBody(BaseModel):
    repo: str
    tag: str


class CreateVolumeBody(BaseModel):
    name: str
    driver: str | None = None
    driver_opts: dict[str, str] | None = None


class CreateNetworkBody(BaseModel):
    name: str
    driver: str | None = None
    subnet: str | None = None
    gateway: str | None = None
    internal: bool = False


class UpdateFileBody(BaseModel):
    content: str


# ── Containers ────────────────────────────────────────────────────────────────


@containers_router.get(
    "/containers",
    dependencies=[Depends(require_environment_project_access("viewer"))],
)
async def list_containers(
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    try:
        svc = ContainersService(session)
        return await svc.list_containers(env_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.get(
    "/containers/{container_id}",
    dependencies=[Depends(require_environment_project_access("viewer"))],
)
async def get_container(
    env_id: uuid.UUID,
    container_id: str,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.get_container(env_id, container_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.get(
    "/containers/{container_id}/logs",
    response_class=PlainTextResponse,
    dependencies=[Depends(require_environment_project_access("viewer"))],
)
async def get_container_logs(
    env_id: uuid.UUID,
    container_id: str,
    tail: int = Query(default=200, ge=1, le=5000),
    session: AsyncSession = Depends(get_session),
) -> str:
    try:
        svc = ContainersService(session)
        return await svc.get_container_logs(env_id, container_id, tail=tail)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.post(
    "/containers/{container_id}/start",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def start_container(
    env_id: uuid.UUID,
    container_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        svc = ContainersService(session)
        await svc.start_container(env_id, container_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.post(
    "/containers/{container_id}/stop",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def stop_container(
    env_id: uuid.UUID,
    container_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        svc = ContainersService(session)
        await svc.stop_container(env_id, container_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.post(
    "/containers/{container_id}/restart",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def restart_container(
    env_id: uuid.UUID,
    container_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        svc = ContainersService(session)
        await svc.restart_container(env_id, container_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.delete(
    "/containers/{container_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def remove_container(
    env_id: uuid.UUID,
    container_id: str,
    force: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        svc = ContainersService(session)
        await svc.remove_container(env_id, container_id, force=force)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.post(
    "/containers",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def create_container(
    env_id: uuid.UUID,
    body: CreateContainerBody,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.create_container(
            env_id,
            image=body.image,
            name=body.name,
            cmd=body.cmd,
            env=body.env,
            ports=body.ports,
            volumes=body.volumes,
            network=body.network,
            auto_remove=body.auto_remove,
            start=body.start,
        )
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.post(
    "/containers/{container_id}/exec",
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def exec_container(
    env_id: uuid.UUID,
    container_id: str,
    body: ExecContainerBody,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.exec_container(
            env_id,
            container_id,
            cmd=body.cmd,
            working_dir=body.working_dir,
            user=body.user,
            timeout_ms=body.timeout_ms,
        )
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.get(
    "/containers/{container_id}/stats",
    dependencies=[Depends(require_environment_project_access("viewer"))],
)
async def container_stats(
    env_id: uuid.UUID,
    container_id: str,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.container_stats(env_id, container_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


# ── Images ────────────────────────────────────────────────────────────────────


@containers_router.get(
    "/images",
    dependencies=[Depends(require_environment_project_access("viewer"))],
)
async def list_images(
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    try:
        svc = ContainersService(session)
        return await svc.list_images(env_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.delete(
    "/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def remove_image(
    env_id: uuid.UUID,
    image_id: str,
    force: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        svc = ContainersService(session)
        await svc.remove_image(env_id, image_id, force=force)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.get(
    "/images/{image_id}",
    dependencies=[Depends(require_environment_project_access("viewer"))],
)
async def inspect_image(
    env_id: uuid.UUID,
    image_id: str,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.inspect_image(env_id, image_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.post(
    "/images/{image_id}/tag",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def tag_image(
    env_id: uuid.UUID,
    image_id: str,
    body: ImageTagBody,
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        svc = ContainersService(session)
        await svc.tag_image(env_id, image_id, body.repo, body.tag)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.post(
    "/images/prune",
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def prune_images(
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.prune_images(env_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


# ── Volumes ───────────────────────────────────────────────────────────────────


@containers_router.get(
    "/volumes",
    dependencies=[Depends(require_environment_project_access("viewer"))],
)
async def list_volumes(
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    try:
        svc = ContainersService(session)
        return await svc.list_volumes(env_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.post(
    "/volumes",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def create_volume(
    env_id: uuid.UUID,
    body: CreateVolumeBody,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.create_volume(env_id, body.name, body.driver, body.driver_opts)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.delete(
    "/volumes/{name}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def remove_volume(
    env_id: uuid.UUID,
    name: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        svc = ContainersService(session)
        await svc.remove_volume(env_id, name)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.post(
    "/volumes/prune",
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def prune_volumes(
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.prune_volumes(env_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.get(
    "/volumes/{name}/files",
    dependencies=[Depends(require_environment_project_access("viewer"))],
)
async def list_volume_files(
    env_id: uuid.UUID,
    name: str,
    path: str = Query(default="/"),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    try:
        svc = ContainersService(session)
        return await svc.list_volume_files(env_id, name, path)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.get(
    "/volumes/{name}/files/content",
    dependencies=[Depends(require_environment_project_access("viewer"))],
)
async def get_volume_file_content(
    env_id: uuid.UUID,
    name: str,
    path: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.get_volume_file_content(env_id, name, path)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.put(
    "/volumes/{name}/files/content",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def update_volume_file_content(
    env_id: uuid.UUID,
    name: str,
    body: UpdateFileBody,
    path: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        svc = ContainersService(session)
        await svc.update_volume_file_content(env_id, name, path, body.content)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


# ── Networks ──────────────────────────────────────────────────────────────────


@containers_router.get(
    "/networks",
    dependencies=[Depends(require_environment_project_access("viewer"))],
)
async def list_networks(
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    try:
        svc = ContainersService(session)
        return await svc.list_networks(env_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.get(
    "/networks/{network_id}",
    dependencies=[Depends(require_environment_project_access("viewer"))],
)
async def inspect_network(
    env_id: uuid.UUID,
    network_id: str,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.inspect_network(env_id, network_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.post(
    "/networks",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def create_network(
    env_id: uuid.UUID,
    body: CreateNetworkBody,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.create_network(
            env_id,
            name=body.name,
            driver=body.driver,
            subnet=body.subnet,
            gateway=body.gateway,
            internal=body.internal,
        )
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.delete(
    "/networks/{network_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def remove_network(
    env_id: uuid.UUID,
    network_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        svc = ContainersService(session)
        await svc.remove_network(env_id, network_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


@containers_router.post(
    "/networks/prune",
    dependencies=[Depends(require_environment_project_access("editor"))],
)
async def prune_networks(
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        svc = ContainersService(session)
        return await svc.prune_networks(env_id)
    except HTTPException, NotFoundError:
        raise
    except Exception as exc:
        raise _handle_docker_error(exc) from exc


__all__ = ["containers_router"]
