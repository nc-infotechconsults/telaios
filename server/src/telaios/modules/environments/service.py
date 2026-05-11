"""Environments service.

CRUD for environments and helm releases.  Infra calls (Kubernetes, Docker,
PVC file browser) are **Phase 8 stubs** — they return structured error
responses rather than delegating to the real client implementations.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.environments.repository import EnvironmentRepository
from telaios.modules.environments.schemas import (
    ConnectionTestResult,
    EnvironmentCreate,
    EnvironmentPatch,
    EnvironmentRead,
    HelmReleaseRead,
    InstallHelmChartDto,
    UpgradeHelmChartDto,
)
from telaios.utils.crypto import decrypt, encrypt
from telaios.utils.errors import NotFoundError


def _serialize_connection_config(raw: dict[str, Any]) -> str:
    """JSON-encode + encrypt the connection config dict."""
    return encrypt(json.dumps(raw))


def _deserialize_connection_config(encrypted: str | None) -> dict[str, Any] | None:
    """Decrypt + JSON-decode the stored connection config; returns None on failure."""
    if not encrypted:
        return None
    try:
        plaintext = decrypt(encrypted)
        return json.loads(plaintext) if plaintext else None
    except Exception:
        return None


def _env_to_read(env: object, *, include_releases: bool = False) -> EnvironmentRead:
    return EnvironmentRead.model_validate(
        env,
        from_attributes=True,
        context={"include_releases": include_releases},
    )


class EnvironmentService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = EnvironmentRepository(session)

    # ── CRUD ──────────────────────────────────────────────────────────────

    async def list_environments(self, project_id: uuid.UUID) -> list[EnvironmentRead]:
        items = await self._repo.list_by_project(project_id)
        out: list[EnvironmentRead] = []
        for env in items:
            r = EnvironmentRead.model_validate(env, from_attributes=True)
            r.helm_releases = None  # not loaded in list
            out.append(r)
        return out

    async def create_environment(
        self,
        project_id: uuid.UUID,
        dto: EnvironmentCreate,
        created_by: uuid.UUID | None = None,
    ) -> EnvironmentRead:
        data: dict[str, Any] = {
            "project_id": project_id,
            "name": dto.name,
            "type": dto.type,
            "namespace": dto.namespace,
            "created_by": created_by,
        }
        if dto.connection_config is not None:
            data["connection_config"] = _serialize_connection_config(dto.connection_config)

        obj = await self._repo.create(**data)
        result = EnvironmentRead.model_validate(obj, from_attributes=True)
        result.helm_releases = None
        return result

    async def get_environment(self, env_id: uuid.UUID, project_id: uuid.UUID) -> EnvironmentRead:
        obj = await self._repo.find_with_releases(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        releases = [
            HelmReleaseRead.model_validate(r, from_attributes=True) for r in obj.helm_releases
        ]
        result = EnvironmentRead.model_validate(obj, from_attributes=True)
        result.helm_releases = releases
        return result

    async def patch_environment(
        self, env_id: uuid.UUID, project_id: uuid.UUID, dto: EnvironmentPatch
    ) -> EnvironmentRead:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        for field, val in dto.model_dump(exclude_unset=True).items():
            if field == "connection_config":
                if val is not None:
                    obj.connection_config = _serialize_connection_config(val)
            else:
                setattr(obj, field, val)
        obj = await self._repo.save(obj)
        result = EnvironmentRead.model_validate(obj, from_attributes=True)
        result.helm_releases = None
        return result

    async def delete_environment(self, env_id: uuid.UUID, project_id: uuid.UUID) -> None:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        await self._repo.soft_delete(obj)

    # ── Infra: connection test (Phase 8 stub) ────────────────────────────

    async def test_connection(
        self, env_id: uuid.UUID, project_id: uuid.UUID
    ) -> ConnectionTestResult:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        return ConnectionTestResult(
            ok=False,
            message="Infrastructure clients are not yet implemented (Phase 8)",
        )

    # ── Infra: resource browser (Phase 8 stubs) ─────────────────────────

    async def list_resources(
        self,
        env_id: uuid.UUID,
        project_id: uuid.UUID,
        namespace: str,
        kind: str,
    ) -> list[Any]:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        return []

    async def get_resource(
        self,
        env_id: uuid.UUID,
        project_id: uuid.UUID,
        namespace: str,
        kind: str,
        name: str,
    ) -> Any:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        return None

    async def get_resource_logs(
        self,
        env_id: uuid.UUID,
        project_id: uuid.UUID,
        namespace: str,
        name: str,
        container: str | None = None,
    ) -> str:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        return ""

    # ── Helm (Phase 8 stubs — DB records written, CLI call stubbed) ──────

    async def install_helm_chart(
        self,
        env_id: uuid.UUID,
        project_id: uuid.UUID,
        dto: InstallHelmChartDto,
        deployed_by: uuid.UUID | None = None,
    ) -> HelmReleaseRead:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")

        stub_msg = "Helm operations are not yet implemented (Phase 8)"
        release = await self._repo.create_release(
            environment_id=env_id,
            project_id=project_id,
            name=dto.release_name,
            chart_name=dto.chart_name,
            chart_repo_url=dto.chart_repo_url,
            chart_version=dto.chart_version,
            namespace=dto.namespace or "default",
            values_override=dto.values_override,
            status="failed",
            release_notes=stub_msg,
            deployed_by=deployed_by,
            deployed_at=datetime.now(UTC),
        )
        return HelmReleaseRead.model_validate(release, from_attributes=True)

    async def list_helm_releases(
        self, env_id: uuid.UUID, project_id: uuid.UUID
    ) -> list[HelmReleaseRead]:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        items = await self._repo.list_releases(env_id)
        return [HelmReleaseRead.model_validate(r, from_attributes=True) for r in items]

    async def upgrade_helm_release(
        self,
        env_id: uuid.UUID,
        project_id: uuid.UUID,
        release_name: str,
        dto: UpgradeHelmChartDto,
        deployed_by: uuid.UUID | None = None,
    ) -> HelmReleaseRead:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        release = await self._repo.find_release(env_id, release_name)
        if release is None:
            raise NotFoundError("Helm release not found")

        stub_msg = "Helm operations are not yet implemented (Phase 8)"
        release.status = "failed"
        release.release_notes = stub_msg
        release.deployed_by = deployed_by
        release.deployed_at = datetime.now(UTC)
        if dto.chart_name is not None:
            release.chart_name = dto.chart_name
        if dto.chart_repo_url is not None:
            release.chart_repo_url = dto.chart_repo_url
        if dto.chart_version is not None:
            release.chart_version = dto.chart_version
        if dto.namespace is not None:
            release.namespace = dto.namespace
        if dto.values_override is not None:
            release.values_override = dto.values_override
        release = await self._repo.save_release(release)
        return HelmReleaseRead.model_validate(release, from_attributes=True)

    async def uninstall_helm_release(
        self, env_id: uuid.UUID, project_id: uuid.UUID, release_name: str
    ) -> None:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        release = await self._repo.find_release(env_id, release_name)
        if release is None:
            raise NotFoundError("Helm release not found")
        release.status = "uninstalled"
        await self._repo.save_release(release)

    async def scan_project_charts(self, env_id: uuid.UUID, project_id: uuid.UUID) -> list[Any]:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        return []
