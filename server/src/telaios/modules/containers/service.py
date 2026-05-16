"""Containers service — orchestrates Docker infra calls.

All public methods take a session so the caller (router) doesn't need
to manage DB access directly.  This service is the ONLY public facade for
container/image/volume/network operations from the modules layer.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.infra.docker import DockerClient, DockerConnectionConfig
from telaios.modules.environments.service import EnvironmentService
from telaios.utils.crypto import decrypt


def _decrypt_connection_cfg(raw: str | None) -> dict[str, Any] | None:
    """Decrypt + JSON-decode a connection-config string."""
    if not raw:
        return None
    try:
        plaintext = decrypt(raw)
        return json.loads(plaintext) if plaintext else None
    except Exception:
        return None


def _build_docker_cfg(env_obj: object) -> DockerConnectionConfig:
    """Build a DockerConnectionConfig from an Environment ORM object."""
    cfg = DockerConnectionConfig()
    raw = getattr(env_obj, "connection_config", None)
    if not raw:
        return cfg
    data = _decrypt_connection_cfg(raw)
    if not data:
        return cfg
    return DockerConnectionConfig(
        host=data.get("host"),
        tls_cert=data.get("tls_cert"),
        tls_key=data.get("tls_key"),
        tls_ca=data.get("tls_ca"),
        type=data.get("type", "docker"),
    )


class ContainersService:
    def __init__(self, session: AsyncSession) -> None:
        self._env_service = EnvironmentService(session)

    def _check_docker_type(self, env_obj: object) -> None:
        if getattr(env_obj, "type", None) != "docker":
            from fastapi import HTTPException, status

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Environment is not a Docker environment",
            )

    async def _get_cfg(self, env_id: uuid.UUID) -> tuple[object, DockerConnectionConfig]:
        """Return (env_orm, docker_cfg) for the given env_id."""
        env = await self._env_service.get_environment_raw(env_id)
        self._check_docker_type(env)
        return env, _build_docker_cfg(env)

    # ── Containers ─────────────────────────────────────────────────────────────

    async def list_containers(self, env_id: uuid.UUID) -> list[dict[str, Any]]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.list_containers(cfg)

    async def get_container(self, env_id: uuid.UUID, container_id: str) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.get_container(cfg, container_id)

    async def get_container_logs(
        self, env_id: uuid.UUID, container_id: str, tail: int = 200
    ) -> str:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.get_container_logs(cfg, container_id, tail=tail)

    async def start_container(self, env_id: uuid.UUID, container_id: str) -> None:
        _, cfg = await self._get_cfg(env_id)
        await DockerClient.start_container(cfg, container_id)

    async def stop_container(self, env_id: uuid.UUID, container_id: str) -> None:
        _, cfg = await self._get_cfg(env_id)
        await DockerClient.stop_container(cfg, container_id)

    async def restart_container(self, env_id: uuid.UUID, container_id: str) -> None:
        _, cfg = await self._get_cfg(env_id)
        await DockerClient.restart_container(cfg, container_id)

    async def remove_container(
        self, env_id: uuid.UUID, container_id: str, force: bool = False
    ) -> None:
        _, cfg = await self._get_cfg(env_id)
        await DockerClient.remove_container(cfg, container_id, force=force)

    async def create_container(
        self,
        env_id: uuid.UUID,
        *,
        image: str,
        name: str | None = None,
        cmd: list[str] | None = None,
        env: dict[str, str] | None = None,
        ports: list[dict[str, Any]] | None = None,
        volumes: list[dict[str, Any]] | None = None,
        network: str | None = None,
        auto_remove: bool = False,
        start: bool = False,
    ) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.create_container(
            cfg,
            image=image,
            name=name,
            cmd=cmd,
            env=env,
            ports=ports,
            volumes=volumes,
            network=network,
            auto_remove=auto_remove,
            start=start,
        )

    async def exec_container(
        self,
        env_id: uuid.UUID,
        container_id: str,
        *,
        cmd: list[str],
        working_dir: str | None = None,
        user: str | None = None,
        timeout_ms: int = 30_000,
    ) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.exec_container(
            cfg,
            container_id=container_id,
            cmd=cmd,
            working_dir=working_dir,
            user=user,
            timeout_ms=timeout_ms,
        )

    async def container_stats(self, env_id: uuid.UUID, container_id: str) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.container_stats(cfg, container_id)

    # ── Images ─────────────────────────────────────────────────────────────────

    async def list_images(self, env_id: uuid.UUID) -> list[dict[str, Any]]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.list_images(cfg)

    async def remove_image(self, env_id: uuid.UUID, image_id: str, force: bool = False) -> None:
        _, cfg = await self._get_cfg(env_id)
        await DockerClient.remove_image(cfg, image_id, force=force)

    async def inspect_image(self, env_id: uuid.UUID, image_id: str) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.inspect_image(cfg, image_id)

    async def tag_image(self, env_id: uuid.UUID, image_id: str, repo: str, tag: str) -> None:
        _, cfg = await self._get_cfg(env_id)
        await DockerClient.tag_image(cfg, image_id, repo, tag)

    async def prune_images(self, env_id: uuid.UUID) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.prune_images(cfg)

    # ── Volumes ────────────────────────────────────────────────────────────────

    async def list_volumes(self, env_id: uuid.UUID) -> list[dict[str, Any]]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.list_volumes(cfg)

    async def create_volume(
        self,
        env_id: uuid.UUID,
        name: str,
        driver: str | None = None,
        driver_opts: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.create_volume(cfg, name, driver or "local", driver_opts)

    async def remove_volume(self, env_id: uuid.UUID, name: str) -> None:
        _, cfg = await self._get_cfg(env_id)
        await DockerClient.remove_volume(cfg, name)

    async def prune_volumes(self, env_id: uuid.UUID) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.prune_volumes(cfg)

    async def list_volume_files(
        self, env_id: uuid.UUID, name: str, path: str = "/"
    ) -> list[dict[str, Any]]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.list_volume_files(cfg, name, path)

    async def get_volume_file_content(
        self, env_id: uuid.UUID, name: str, path: str
    ) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.get_volume_file_content(cfg, name, path)

    async def update_volume_file_content(
        self, env_id: uuid.UUID, name: str, path: str, content: str
    ) -> None:
        _, cfg = await self._get_cfg(env_id)
        await DockerClient.update_volume_file_content(cfg, name, path, content)

    # ── Networks ──────────────────────────────────────────────────────────────

    async def list_networks(self, env_id: uuid.UUID) -> list[dict[str, Any]]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.list_networks(cfg)

    async def inspect_network(self, env_id: uuid.UUID, network_id: str) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.inspect_network(cfg, network_id)

    async def create_network(
        self,
        env_id: uuid.UUID,
        name: str,
        driver: str | None = None,
        subnet: str | None = None,
        gateway: str | None = None,
        internal: bool = False,
    ) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.create_network(
            cfg,
            name=name,
            driver=driver or "bridge",
            subnet=subnet,
            gateway=gateway,
            internal=internal,
        )

    async def remove_network(self, env_id: uuid.UUID, network_id: str) -> None:
        _, cfg = await self._get_cfg(env_id)
        await DockerClient.remove_network(cfg, network_id)

    async def prune_networks(self, env_id: uuid.UUID) -> dict[str, Any]:
        _, cfg = await self._get_cfg(env_id)
        return await DockerClient.prune_networks(cfg)
