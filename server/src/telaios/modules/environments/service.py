"""Environments service.

CRUD for environments and helm releases.  Infra calls (Kubernetes, Docker,
PVC file browser) are delegated to :mod:`telaios.infra.kubernetes` and
:mod:`telaios.infra.helm` starting from **Phase 8**.

Docker-type environments return graceful "not implemented" responses for
infra operations — Docker support lands in Phase 8.5 (``modules/containers``).
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.infra.helm import WORKSPACES_ROOT, HelmClient
from telaios.infra.kubernetes import K8sConnectionConfig, KubernetesClient
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


def _k8s_cfg_from_dict(cfg_dict: dict[str, Any]) -> K8sConnectionConfig:
    """Build a :class:`K8sConnectionConfig` from a raw connection-config dict."""
    return K8sConnectionConfig(
        kubeconfig=cfg_dict.get("kubeconfig"),
        cluster_url=cfg_dict.get("cluster_url"),
        token=cfg_dict.get("token"),
        ca_cert=cfg_dict.get("ca_cert"),
        context_name=cfg_dict.get("context_name"),
    )


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

    async def get_environment_raw(self, env_id: uuid.UUID) -> Any:
        """Return raw ORM object for cross-module use (containers, docker_shell)."""
        obj = await self._repo.find_by_id(env_id)
        if obj is None:
            raise NotFoundError("Environment not found")
        return obj

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

    # ── Infra: connection test ────────────────────────────────────────────

    async def test_connection(
        self, env_id: uuid.UUID, project_id: uuid.UUID
    ) -> ConnectionTestResult:
        obj = await self._repo.find(env_id, project_id)
        if obj is None:
            raise NotFoundError("Environment not found")

        cfg_dict = _deserialize_connection_config(obj.connection_config)
        if cfg_dict is None:
            return ConnectionTestResult(ok=False, message="No connection config stored")

        if obj.type == "kubernetes":
            k8s_cfg = _k8s_cfg_from_dict(cfg_dict)
            ok = await KubernetesClient().test_connection(k8s_cfg)
            return ConnectionTestResult(
                ok=ok,
                message="Connected successfully" if ok else "Failed to connect to cluster",
            )

        return ConnectionTestResult(
            ok=False,
            message=f"Connection test not implemented for type '{obj.type}'",
        )

    # ── Infra: resource browser ───────────────────────────────────────────

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

        cfg_dict = _deserialize_connection_config(obj.connection_config)
        if cfg_dict is None or obj.type != "kubernetes":
            return []

        k8s_cfg = _k8s_cfg_from_dict(cfg_dict)
        return await KubernetesClient().list_resources(k8s_cfg, namespace, kind)

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

        cfg_dict = _deserialize_connection_config(obj.connection_config)
        if cfg_dict is None or obj.type != "kubernetes":
            return None

        k8s_cfg = _k8s_cfg_from_dict(cfg_dict)
        return await KubernetesClient().get_resource(k8s_cfg, namespace, kind, name)

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

        cfg_dict = _deserialize_connection_config(obj.connection_config)
        if cfg_dict is None or obj.type != "kubernetes":
            return ""

        k8s_cfg = _k8s_cfg_from_dict(cfg_dict)
        return await KubernetesClient().get_pod_logs(k8s_cfg, namespace, name, container=container)

    # ── Helm ─────────────────────────────────────────────────────────────

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

        namespace = dto.namespace or getattr(obj, "namespace", None) or "default"
        status = "deployed"
        notes: str | None = None

        try:
            await HelmClient().install(
                release_name=dto.release_name,
                chart=dto.chart_name,
                namespace=namespace,
                values=dto.values_override,
                repo_url=dto.chart_repo_url,
                chart_version=dto.chart_version,
            )
        except Exception as exc:
            status = "failed"
            notes = str(exc)

        release = await self._repo.create_release(
            environment_id=env_id,
            project_id=project_id,
            name=dto.release_name,
            chart_name=dto.chart_name,
            chart_repo_url=dto.chart_repo_url,
            chart_version=dto.chart_version,
            namespace=namespace,
            values_override=dto.values_override,
            status=status,
            release_notes=notes,
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

        namespace = dto.namespace or getattr(release, "namespace", None) or "default"
        chart: str = dto.chart_name or str(getattr(release, "chart_name", ""))
        repo_url = dto.chart_repo_url or getattr(release, "chart_repo_url", None)
        version = dto.chart_version or getattr(release, "chart_version", None)

        status: Literal["pending", "deployed", "failed", "uninstalled"] = "deployed"
        notes: str | None = None

        try:
            await HelmClient().upgrade(
                release_name=release_name,
                chart=chart,
                namespace=namespace,
                values=dto.values_override,
                repo_url=repo_url,
                chart_version=version,
            )
        except Exception as exc:
            status = "failed"
            notes = str(exc)

        release.status = status
        release.release_notes = notes
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

        base = Path(WORKSPACES_ROOT) / str(project_id)
        if not base.is_dir():
            return []

        repo_names = [d.name for d in base.iterdir() if d.is_dir()]
        return await HelmClient().scan_project_charts(str(project_id), repo_names)
