"""Unit tests for telaios.infra.kubernetes helpers.

Tests cover the pure helper functions that require no Kubernetes cluster:
  - _status_from_pod
  - _age_from_timestamp
  - _parse_ls_la_output

KubernetesClient async methods are covered via mock-based tests that verify
delegation to the kubernetes SDK without touching a real cluster.
"""

from __future__ import annotations

import datetime
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from telaios.infra.kubernetes import (
    K8sConnectionConfig,
    K8sPVCFileEntry,
    KubernetesClient,
    _age_from_timestamp,
    _parse_ls_la_output,
    _status_from_pod,
)

# ── _status_from_pod ──────────────────────────────────────────────────────────


class TestStatusFromPod:
    def _make_pod(self, phase: str | None) -> Any:
        status = MagicMock()
        status.phase = phase
        pod = MagicMock()
        pod.status = status
        return pod

    def test_running_phase(self) -> None:
        assert _status_from_pod(self._make_pod("Running")) == "Running"

    def test_failed_phase(self) -> None:
        assert _status_from_pod(self._make_pod("Failed")) == "Failed"

    def test_pending_phase(self) -> None:
        assert _status_from_pod(self._make_pod("Pending")) == "Pending"

    def test_none_phase_returns_unknown(self) -> None:
        assert _status_from_pod(self._make_pod(None)) == "Unknown"

    def test_no_status_attribute_returns_unknown(self) -> None:
        pod = MagicMock(spec=[])  # no attributes
        assert _status_from_pod(pod) == "Unknown"


# ── _age_from_timestamp ───────────────────────────────────────────────────────


class TestAgeFromTimestamp:
    def test_none_returns_dash(self) -> None:
        assert _age_from_timestamp(None) == "\u2014"

    def test_empty_string_returns_dash(self) -> None:
        assert _age_from_timestamp("") == "\u2014"

    def test_recent_datetime_returns_hours(self) -> None:
        ts = datetime.datetime.now(datetime.UTC) - datetime.timedelta(hours=3)
        result = _age_from_timestamp(ts)
        assert result == "3h"

    def test_old_datetime_returns_days(self) -> None:
        ts = datetime.datetime.now(datetime.UTC) - datetime.timedelta(hours=50)
        result = _age_from_timestamp(ts)
        assert result == "2d"

    def test_iso_string_with_z_suffix(self) -> None:
        # 6 hours ago
        ts = datetime.datetime.now(datetime.UTC) - datetime.timedelta(hours=6)
        iso = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
        result = _age_from_timestamp(iso)
        assert result == "6h"

    def test_iso_string_with_offset(self) -> None:
        ts = datetime.datetime.now(datetime.UTC) - datetime.timedelta(hours=25)
        iso = ts.isoformat()
        result = _age_from_timestamp(iso)
        assert result == "1d"

    def test_invalid_string_returns_dash(self) -> None:
        assert _age_from_timestamp("not-a-date") == "\u2014"

    def test_zero_hours(self) -> None:
        # < 1 hour old → "0h"
        ts = datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=30)
        result = _age_from_timestamp(ts)
        assert result == "0h"

    def test_exactly_24h_returns_days(self) -> None:
        ts = datetime.datetime.now(datetime.UTC) - datetime.timedelta(hours=24)
        result = _age_from_timestamp(ts)
        assert result == "1d"


# ── _parse_ls_la_output ───────────────────────────────────────────────────────

_LS_SAMPLE = """\
total 20
drwxr-xr-x  2 root root 4096 Jan 15 10:00 .
drwxr-xr-x 10 root root 4096 Jan 14 08:00 ..
-rw-r--r--  1 root root  512 Jan 15 09:30 config.yaml
drwxr-xr-x  3 root root 4096 Jan 13 12:00 data
-rwxr-xr-x  1 user user 1024 Jan 12 07:00 run.sh
lrwxrwxrwx  1 root root   11 Jan 11 06:00 link -> config.yaml
"""


class TestParseLsLaOutput:
    def test_skips_total_line(self) -> None:
        entries = _parse_ls_la_output(_LS_SAMPLE, "/mnt")
        names = [e.name for e in entries]
        assert all(not n.startswith("total") for n in names)

    def test_skips_dot_and_dotdot(self) -> None:
        entries = _parse_ls_la_output(_LS_SAMPLE, "/mnt")
        names = [e.name for e in entries]
        assert "." not in names
        assert ".." not in names

    def test_parses_file_entry(self) -> None:
        entries = _parse_ls_la_output(_LS_SAMPLE, "/mnt")
        config = next(e for e in entries if e.name == "config.yaml")
        assert config.type == "file"
        assert config.size == 512
        assert config.path == "/mnt/config.yaml"

    def test_parses_directory_entry(self) -> None:
        entries = _parse_ls_la_output(_LS_SAMPLE, "/mnt")
        data = next(e for e in entries if e.name == "data")
        assert data.type == "directory"
        assert data.path == "/mnt/data"

    def test_symlink_name_strips_arrow(self) -> None:
        entries = _parse_ls_la_output(_LS_SAMPLE, "/mnt")
        link = next(e for e in entries if e.name == "link")
        assert link.name == "link"
        assert link.type == "file"  # lrwxrwxrwx doesn't start with 'd'

    def test_root_path_prefix(self) -> None:
        entries = _parse_ls_la_output(_LS_SAMPLE, "/")
        config = next(e for e in entries if e.name == "config.yaml")
        assert config.path == "/config.yaml"

    def test_empty_input_returns_empty_list(self) -> None:
        assert _parse_ls_la_output("", "/mnt") == []

    def test_total_entry_count(self) -> None:
        # total, ., .. skipped → 4 real entries (config.yaml, data, run.sh, link)
        entries = _parse_ls_la_output(_LS_SAMPLE, "/mnt")
        assert len(entries) == 4

    def test_caps_at_500_entries(self) -> None:
        # Generate 600 file lines
        lines = ["total 1"]
        for i in range(600):
            lines.append(f"-rw-r--r--  1 root root 100 Jan 01 00:00 file{i:04d}.txt")
        raw = "\n".join(lines)
        entries = _parse_ls_la_output(raw, "/data")
        assert len(entries) == 500

    def test_returns_k8s_pvc_file_entry_instances(self) -> None:
        entries = _parse_ls_la_output(_LS_SAMPLE, "/mnt")
        for e in entries:
            assert isinstance(e, K8sPVCFileEntry)


# ── KubernetesClient — delegation tests ──────────────────────────────────────


_FAKE_CFG = K8sConnectionConfig(cluster_url="https://k8s.example.com", token="fake-token")


class TestKubernetesClientTestConnection:
    @pytest.mark.asyncio
    async def test_returns_true_when_list_namespace_succeeds(self) -> None:
        with patch("telaios.infra.kubernetes._build_api_client") as mock_build:
            mock_core = MagicMock()
            mock_core.list_namespace.return_value = MagicMock(items=[])
            mock_build.return_value = MagicMock()
            with patch("telaios.infra.kubernetes.k8s_client.CoreV1Api", return_value=mock_core):
                result = await KubernetesClient().test_connection(_FAKE_CFG)
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_list_namespace_raises(self) -> None:
        with patch("telaios.infra.kubernetes._build_api_client") as mock_build:
            mock_core = MagicMock()
            mock_core.list_namespace.side_effect = Exception("connection refused")
            mock_build.return_value = MagicMock()
            with patch("telaios.infra.kubernetes.k8s_client.CoreV1Api", return_value=mock_core):
                result = await KubernetesClient().test_connection(_FAKE_CFG)
        assert result is False


class TestKubernetesClientListNamespaces:
    @pytest.mark.asyncio
    async def test_returns_namespace_names(self) -> None:
        ns1, ns2 = MagicMock(), MagicMock()
        ns1.metadata.name = "default"
        ns2.metadata.name = "kube-system"

        with patch("telaios.infra.kubernetes._build_api_client"):
            mock_core = MagicMock()
            mock_core.list_namespace.return_value = MagicMock(items=[ns1, ns2])
            with patch("telaios.infra.kubernetes.k8s_client.CoreV1Api", return_value=mock_core):
                result = await KubernetesClient().list_namespaces(_FAKE_CFG)

        assert result == ["default", "kube-system"]

    @pytest.mark.asyncio
    async def test_returns_empty_on_error(self) -> None:
        with patch("telaios.infra.kubernetes._build_api_client"):
            mock_core = MagicMock()
            mock_core.list_namespace.side_effect = Exception("error")
            with patch("telaios.infra.kubernetes.k8s_client.CoreV1Api", return_value=mock_core):
                result = await KubernetesClient().list_namespaces(_FAKE_CFG)
        assert result == []
