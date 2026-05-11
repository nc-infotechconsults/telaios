"""tests/unit/modules/environments/test_service.py

Unit tests for EnvironmentService and helper functions.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from telaios.modules.environments.schemas import (
    ConnectionTestResult,
    EnvironmentCreate,
    EnvironmentPatch,
    InstallHelmChartDto,
    UpgradeHelmChartDto,
)
from telaios.modules.environments.service import (
    EnvironmentService,
    _deserialize_connection_config,
    _serialize_connection_config,
)
from telaios.utils.errors import NotFoundError


def _now() -> datetime:
    return datetime.now(UTC)


def _make_env_mock(
    uid: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    name: str = "prod",
    env_type: str = "kubernetes",
    status: str = "connected",
) -> MagicMock:
    m = MagicMock()
    m.id = uid or uuid.uuid4()
    m.project_id = project_id or uuid.uuid4()
    m.name = name
    m.type = env_type
    m.status = status
    m.connection_config = None
    m.namespace = "default"
    m.created_by = None
    m.created_at = _now()
    m.updated_at = _now()
    m.helm_releases = []
    return m


def _make_release_mock(env_id: uuid.UUID | None = None) -> MagicMock:
    r = MagicMock()
    r.id = uuid.uuid4()
    r.environment_id = env_id or uuid.uuid4()
    r.project_id = uuid.uuid4()
    r.name = "test-release"
    r.chart_repo_url = None
    r.chart_name = "nginx"
    r.chart_version = "1.0.0"
    r.namespace = "default"
    r.values_override = None
    r.status = "deployed"
    r.release_notes = None
    r.deployed_by = None
    r.deployed_at = None
    r.created_at = _now()
    r.updated_at = _now()
    return r


def _make_service() -> tuple[EnvironmentService, AsyncMock]:
    session = AsyncMock()
    svc = EnvironmentService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ── _serialize_connection_config ──────────────────────────────────────────


class TestSerializeConnectionConfig:
    @patch("telaios.modules.environments.service.encrypt", return_value="enc_data")
    def test_json_encodes_and_encrypts(self, mock_enc):
        result = _serialize_connection_config({"server": "k8s.local", "port": 443})
        mock_enc.assert_called_once()
        call_arg = mock_enc.call_args[0][0]
        assert '"server"' in call_arg
        assert result == "enc_data"

    @patch("telaios.modules.environments.service.encrypt", return_value="enc2")
    def test_empty_dict(self, mock_enc):
        result = _serialize_connection_config({})
        assert result == "enc2"


# ── _deserialize_connection_config ────────────────────────────────────────


class TestDeserializeConnectionConfig:
    def test_none_input_returns_none(self):
        result = _deserialize_connection_config(None)
        assert result is None

    def test_empty_string_returns_none(self):
        result = _deserialize_connection_config("")
        assert result is None

    @patch(
        "telaios.modules.environments.service.decrypt",
        return_value='{"server": "k8s.local"}',
    )
    def test_decrypts_and_parses_json(self, mock_decrypt):
        result = _deserialize_connection_config("enc_data")
        assert result == {"server": "k8s.local"}

    @patch("telaios.modules.environments.service.decrypt", return_value=None)
    def test_decrypt_returns_none(self, mock_decrypt):
        result = _deserialize_connection_config("something")
        assert result is None

    @patch(
        "telaios.modules.environments.service.decrypt",
        side_effect=Exception("bad"),
    )
    def test_exception_returns_none(self, mock_decrypt):
        result = _deserialize_connection_config("garbage")
        assert result is None


# ── EnvironmentService.list_environments ─────────────────────────────────


class TestListEnvironments:
    @pytest.mark.asyncio
    async def test_returns_list_with_no_helm_releases(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        repo.list_by_project.return_value = [env]

        result = await svc.list_environments(env.project_id)

        repo.list_by_project.assert_awaited_once_with(env.project_id)
        assert len(result) == 1
        assert result[0].helm_releases is None

    @pytest.mark.asyncio
    async def test_empty_list(self):
        svc, repo = _make_service()
        repo.list_by_project.return_value = []
        result = await svc.list_environments(uuid.uuid4())
        assert result == []


# ── EnvironmentService.create_environment ────────────────────────────────


class TestCreateEnvironment:
    @pytest.mark.asyncio
    async def test_without_connection_config(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        repo.create.return_value = env

        dto = EnvironmentCreate(name="staging")
        result = await svc.create_environment(env.project_id, dto)

        call_kwargs = repo.create.call_args[1]
        assert "connection_config" not in call_kwargs
        assert result.name == "prod"
        assert result.helm_releases is None

    @pytest.mark.asyncio
    @patch(
        "telaios.modules.environments.service.encrypt",
        return_value="encrypted_cfg",
    )
    async def test_with_connection_config_encrypted(self, mock_enc):
        svc, repo = _make_service()
        env = _make_env_mock()
        repo.create.return_value = env

        dto = EnvironmentCreate(name="prod", connection_config={"token": "abc"})
        await svc.create_environment(env.project_id, dto, created_by=uuid.uuid4())

        mock_enc.assert_called_once()
        call_kwargs = repo.create.call_args[1]
        assert call_kwargs["connection_config"] == "encrypted_cfg"


# ── EnvironmentService.get_environment ───────────────────────────────────


class TestGetEnvironment:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find_with_releases.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get_environment(uuid.uuid4(), uuid.uuid4())

    @pytest.mark.asyncio
    async def test_found_with_releases(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        release = _make_release_mock(env_id=env.id)
        env.helm_releases = [release]
        repo.find_with_releases.return_value = env

        result = await svc.get_environment(env.id, env.project_id)

        assert result.helm_releases is not None
        assert len(result.helm_releases) == 1
        assert result.helm_releases[0].name == "test-release"

    @pytest.mark.asyncio
    async def test_found_no_releases(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        env.helm_releases = []
        repo.find_with_releases.return_value = env

        result = await svc.get_environment(env.id, env.project_id)
        assert result.helm_releases == []


# ── EnvironmentService.patch_environment ─────────────────────────────────


class TestPatchEnvironment:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.patch_environment(uuid.uuid4(), uuid.uuid4(), EnvironmentPatch(name="new"))

    @pytest.mark.asyncio
    async def test_patches_scalar_field(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        repo.find.return_value = env
        repo.save.return_value = env

        dto = EnvironmentPatch(name="updated")
        await svc.patch_environment(env.id, env.project_id, dto)

        assert env.name == "updated"
        repo.save.assert_awaited_once()

    @pytest.mark.asyncio
    @patch(
        "telaios.modules.environments.service.encrypt",
        return_value="enc_cfg",
    )
    async def test_patches_connection_config_encrypted(self, mock_enc):
        svc, repo = _make_service()
        env = _make_env_mock()
        repo.find.return_value = env
        repo.save.return_value = env

        dto = EnvironmentPatch(connection_config={"token": "new-token"})
        await svc.patch_environment(env.id, env.project_id, dto)

        mock_enc.assert_called_once()
        assert env.connection_config == "enc_cfg"


# ── EnvironmentService.delete_environment ────────────────────────────────


class TestDeleteEnvironment:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.delete_environment(uuid.uuid4(), uuid.uuid4())

    @pytest.mark.asyncio
    async def test_soft_delete_called(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        repo.find.return_value = env

        await svc.delete_environment(env.id, env.project_id)
        repo.soft_delete.assert_awaited_once_with(env)


# ── EnvironmentService.test_connection ───────────────────────────────────


class TestTestConnection:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.test_connection(uuid.uuid4(), uuid.uuid4())

    @pytest.mark.asyncio
    async def test_no_connection_config_returns_not_ok(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        env.connection_config = None
        repo.find.return_value = env

        result = await svc.test_connection(env.id, env.project_id)

        assert isinstance(result, ConnectionTestResult)
        assert result.ok is False

    @pytest.mark.asyncio
    @patch("telaios.modules.environments.service.KubernetesClient")
    @patch(
        "telaios.modules.environments.service.decrypt",
        return_value='{"kubeconfig": "kcfg"}',
    )
    async def test_kubernetes_type_ok(self, mock_decrypt, mock_k8s_cls):
        svc, repo = _make_service()
        env = _make_env_mock(env_type="kubernetes")
        env.connection_config = "encrypted"
        repo.find.return_value = env

        mock_instance = AsyncMock()
        mock_instance.test_connection.return_value = True
        mock_k8s_cls.return_value = mock_instance

        result = await svc.test_connection(env.id, env.project_id)

        mock_instance.test_connection.assert_awaited_once()
        assert result.ok is True

    @pytest.mark.asyncio
    @patch("telaios.modules.environments.service.KubernetesClient")
    @patch(
        "telaios.modules.environments.service.decrypt",
        return_value='{"kubeconfig": "kcfg"}',
    )
    async def test_kubernetes_type_failed(self, mock_decrypt, mock_k8s_cls):
        svc, repo = _make_service()
        env = _make_env_mock(env_type="kubernetes")
        env.connection_config = "encrypted"
        repo.find.return_value = env

        mock_instance = AsyncMock()
        mock_instance.test_connection.return_value = False
        mock_k8s_cls.return_value = mock_instance

        result = await svc.test_connection(env.id, env.project_id)

        assert result.ok is False

    @pytest.mark.asyncio
    @patch(
        "telaios.modules.environments.service.decrypt",
        return_value='{"some": "config"}',
    )
    async def test_docker_type_returns_not_implemented(self, mock_decrypt):
        svc, repo = _make_service()
        env = _make_env_mock(env_type="docker")
        env.connection_config = "encrypted"
        repo.find.return_value = env

        result = await svc.test_connection(env.id, env.project_id)

        assert result.ok is False
        assert "not implemented" in (result.message or "").lower()


# ── EnvironmentService.list_resources ────────────────────────────────────


class TestListResources:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.list_resources(uuid.uuid4(), uuid.uuid4(), "default", "Pod")

    @pytest.mark.asyncio
    async def test_no_connection_config_returns_empty(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        env.connection_config = None
        repo.find.return_value = env

        result = await svc.list_resources(env.id, env.project_id, "default", "pods")
        assert result == []

    @pytest.mark.asyncio
    async def test_docker_type_returns_empty(self):
        svc, repo = _make_service()
        env = _make_env_mock(env_type="docker")
        env.connection_config = None
        repo.find.return_value = env

        result = await svc.list_resources(env.id, env.project_id, "default", "pods")
        assert result == []

    @pytest.mark.asyncio
    @patch("telaios.modules.environments.service.KubernetesClient")
    @patch(
        "telaios.modules.environments.service.decrypt",
        return_value='{"kubeconfig": "kcfg"}',
    )
    async def test_kubernetes_type_delegates_to_client(self, mock_decrypt, mock_k8s_cls):
        svc, repo = _make_service()
        env = _make_env_mock(env_type="kubernetes")
        env.connection_config = "encrypted"
        repo.find.return_value = env

        mock_instance = AsyncMock()
        mock_instance.list_resources.return_value = [{"name": "my-pod", "kind": "pods"}]
        mock_k8s_cls.return_value = mock_instance

        result = await svc.list_resources(env.id, env.project_id, "default", "pods")

        mock_instance.list_resources.assert_awaited_once()
        assert len(result) == 1
        assert result[0]["name"] == "my-pod"


# ── EnvironmentService.get_resource ──────────────────────────────────────


class TestGetResource:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get_resource(uuid.uuid4(), uuid.uuid4(), "default", "pods", "mypod")

    @pytest.mark.asyncio
    async def test_no_connection_config_returns_none(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        env.connection_config = None
        repo.find.return_value = env

        result = await svc.get_resource(env.id, env.project_id, "default", "pods", "mypod")
        assert result is None

    @pytest.mark.asyncio
    @patch("telaios.modules.environments.service.KubernetesClient")
    @patch(
        "telaios.modules.environments.service.decrypt",
        return_value='{"kubeconfig": "kcfg"}',
    )
    async def test_kubernetes_type_delegates_to_client(self, mock_decrypt, mock_k8s_cls):
        svc, repo = _make_service()
        env = _make_env_mock(env_type="kubernetes")
        env.connection_config = "encrypted"
        repo.find.return_value = env

        pod_dict = {"metadata": {"name": "mypod"}}
        mock_instance = AsyncMock()
        mock_instance.get_resource.return_value = pod_dict
        mock_k8s_cls.return_value = mock_instance

        result = await svc.get_resource(env.id, env.project_id, "default", "pods", "mypod")

        mock_instance.get_resource.assert_awaited_once()
        assert result == pod_dict


# ── EnvironmentService.get_resource_logs ─────────────────────────────────


class TestGetResourceLogs:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get_resource_logs(uuid.uuid4(), uuid.uuid4(), "default", "mypod")

    @pytest.mark.asyncio
    async def test_no_connection_config_returns_empty(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        env.connection_config = None
        repo.find.return_value = env

        result = await svc.get_resource_logs(env.id, env.project_id, "default", "mypod")
        assert result == ""

    @pytest.mark.asyncio
    @patch("telaios.modules.environments.service.KubernetesClient")
    @patch(
        "telaios.modules.environments.service.decrypt",
        return_value='{"kubeconfig": "kcfg"}',
    )
    async def test_kubernetes_type_delegates_to_client(self, mock_decrypt, mock_k8s_cls):
        svc, repo = _make_service()
        env = _make_env_mock(env_type="kubernetes")
        env.connection_config = "encrypted"
        repo.find.return_value = env

        mock_instance = AsyncMock()
        mock_instance.get_pod_logs.return_value = "line1\nline2\n"
        mock_k8s_cls.return_value = mock_instance

        result = await svc.get_resource_logs(
            env.id, env.project_id, "default", "mypod", container="app"
        )

        mock_instance.get_pod_logs.assert_awaited_once()
        assert "line1" in result


# ── EnvironmentService.install_helm_chart ────────────────────────────────


class TestInstallHelmChart:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.install_helm_chart(
                uuid.uuid4(),
                uuid.uuid4(),
                InstallHelmChartDto(release_name="r", chart_name="nginx"),
            )

    @pytest.mark.asyncio
    @patch("telaios.modules.environments.service.HelmClient")
    async def test_creates_deployed_release_on_success(self, mock_helm_cls):
        svc, repo = _make_service()
        env = _make_env_mock()
        release = _make_release_mock(env_id=env.id)
        release.status = "deployed"
        repo.find.return_value = env
        repo.create_release.return_value = release

        mock_helm = AsyncMock()
        mock_helm.install.return_value = ""
        mock_helm_cls.return_value = mock_helm

        dto = InstallHelmChartDto(release_name="r", chart_name="nginx")
        result = await svc.install_helm_chart(env.id, env.project_id, dto)

        mock_helm.install.assert_awaited_once()
        call_kwargs = repo.create_release.call_args[1]
        assert call_kwargs["status"] == "deployed"
        assert call_kwargs["release_notes"] is None
        assert result.status == "deployed"

    @pytest.mark.asyncio
    @patch("telaios.modules.environments.service.HelmClient")
    async def test_creates_failed_release_on_helm_error(self, mock_helm_cls):
        svc, repo = _make_service()
        env = _make_env_mock()
        release = _make_release_mock(env_id=env.id)
        release.status = "failed"
        repo.find.return_value = env
        repo.create_release.return_value = release

        mock_helm = AsyncMock()
        mock_helm.install.side_effect = RuntimeError("chart not found")
        mock_helm_cls.return_value = mock_helm

        dto = InstallHelmChartDto(release_name="r", chart_name="nginx")
        result = await svc.install_helm_chart(env.id, env.project_id, dto)

        call_kwargs = repo.create_release.call_args[1]
        assert call_kwargs["status"] == "failed"
        assert "chart not found" in (call_kwargs.get("release_notes") or "")
        assert result.status == "failed"

    @pytest.mark.asyncio
    @patch("telaios.modules.environments.service.HelmClient")
    async def test_namespace_falls_back_to_env_namespace(self, mock_helm_cls):
        svc, repo = _make_service()
        env = _make_env_mock()
        env.namespace = "my-ns"
        release = _make_release_mock(env_id=env.id)
        repo.find.return_value = env
        repo.create_release.return_value = release

        mock_helm = AsyncMock()
        mock_helm.install.return_value = ""
        mock_helm_cls.return_value = mock_helm

        dto = InstallHelmChartDto(release_name="r", chart_name="nginx")  # no namespace
        await svc.install_helm_chart(env.id, env.project_id, dto)

        call_kwargs = repo.create_release.call_args[1]
        assert call_kwargs["namespace"] == "my-ns"


# ── EnvironmentService.list_helm_releases ────────────────────────────────


class TestListHelmReleases:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.list_helm_releases(uuid.uuid4(), uuid.uuid4())

    @pytest.mark.asyncio
    async def test_returns_release_list(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        release = _make_release_mock(env_id=env.id)
        repo.find.return_value = env
        repo.list_releases.return_value = [release]

        result = await svc.list_helm_releases(env.id, env.project_id)

        repo.list_releases.assert_awaited_once_with(env.id)
        assert len(result) == 1


# ── EnvironmentService.upgrade_helm_release ───────────────────────────────


class TestUpgradeHelmRelease:
    @pytest.mark.asyncio
    async def test_env_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.upgrade_helm_release(uuid.uuid4(), uuid.uuid4(), "r", UpgradeHelmChartDto())

    @pytest.mark.asyncio
    async def test_release_not_found_raises(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        repo.find.return_value = env
        repo.find_release.return_value = None

        with pytest.raises(NotFoundError, match="Helm release"):
            await svc.upgrade_helm_release(env.id, env.project_id, "missing", UpgradeHelmChartDto())

    @pytest.mark.asyncio
    @patch("telaios.modules.environments.service.HelmClient")
    async def test_updates_chart_version_on_success(self, mock_helm_cls):
        svc, repo = _make_service()
        env = _make_env_mock()
        release = _make_release_mock(env_id=env.id)
        release.chart_version = "1.0.0"
        repo.find.return_value = env
        repo.find_release.return_value = release
        repo.save_release.return_value = release

        mock_helm = AsyncMock()
        mock_helm.upgrade.return_value = ""
        mock_helm_cls.return_value = mock_helm

        dto = UpgradeHelmChartDto(chart_version="2.0.0")
        await svc.upgrade_helm_release(env.id, env.project_id, "test-release", dto)

        assert release.chart_version == "2.0.0"
        assert release.status == "deployed"

    @pytest.mark.asyncio
    @patch("telaios.modules.environments.service.HelmClient")
    async def test_updates_chart_version_on_helm_error(self, mock_helm_cls):
        svc, repo = _make_service()
        env = _make_env_mock()
        release = _make_release_mock(env_id=env.id)
        release.chart_version = "1.0.0"
        repo.find.return_value = env
        repo.find_release.return_value = release
        repo.save_release.return_value = release

        mock_helm = AsyncMock()
        mock_helm.upgrade.side_effect = RuntimeError("upgrade failed")
        mock_helm_cls.return_value = mock_helm

        dto = UpgradeHelmChartDto(chart_version="2.0.0")
        await svc.upgrade_helm_release(env.id, env.project_id, "test-release", dto)

        assert release.chart_version == "2.0.0"
        assert release.status == "failed"


# ── EnvironmentService.uninstall_helm_release ────────────────────────────


class TestUninstallHelmRelease:
    @pytest.mark.asyncio
    async def test_env_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.uninstall_helm_release(uuid.uuid4(), uuid.uuid4(), "r")

    @pytest.mark.asyncio
    async def test_release_not_found_raises(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        repo.find.return_value = env
        repo.find_release.return_value = None

        with pytest.raises(NotFoundError, match="Helm release"):
            await svc.uninstall_helm_release(env.id, env.project_id, "missing")

    @pytest.mark.asyncio
    async def test_sets_status_uninstalled(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        release = _make_release_mock(env_id=env.id)
        repo.find.return_value = env
        repo.find_release.return_value = release
        repo.save_release.return_value = release

        await svc.uninstall_helm_release(env.id, env.project_id, "test-release")

        assert release.status == "uninstalled"
        repo.save_release.assert_awaited_once_with(release)


# ── EnvironmentService.scan_project_charts ───────────────────────────────


class TestScanProjectCharts:
    @pytest.mark.asyncio
    async def test_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.scan_project_charts(uuid.uuid4(), uuid.uuid4())

    @pytest.mark.asyncio
    async def test_returns_empty_when_workspace_missing(self):
        svc, repo = _make_service()
        env = _make_env_mock()
        repo.find.return_value = env

        # WORKSPACES_ROOT/project_id/ does not exist → returns []
        result = await svc.scan_project_charts(env.id, env.project_id)
        assert result == []

    @pytest.mark.asyncio
    @patch("telaios.modules.environments.service.HelmClient")
    @patch("telaios.modules.environments.service.Path")
    async def test_delegates_to_helm_client_when_dir_exists(self, mock_path_cls, mock_helm_cls):
        svc, repo = _make_service()
        env = _make_env_mock()
        repo.find.return_value = env

        # Mock the Path to appear as an existing directory with one subdirectory
        mock_base = MagicMock()
        mock_base.is_dir.return_value = True
        sub = MagicMock()
        sub.name = "my-repo"
        sub.is_dir.return_value = True
        mock_base.iterdir.return_value = [sub]
        mock_path_cls.return_value = mock_base

        mock_helm = AsyncMock()
        mock_helm.scan_project_charts.return_value = [{"name": "my-chart"}]
        mock_helm_cls.return_value = mock_helm

        result = await svc.scan_project_charts(env.id, env.project_id)

        mock_helm.scan_project_charts.assert_awaited_once()
        assert len(result) == 1
        assert result[0]["name"] == "my-chart"
