"""Kubernetes client.

Port of ``data-api/src/services/kubernetes.service.ts`` (617 lines).
Uses the official Python ``kubernetes`` library (v35).
All blocking SDK calls are offloaded to a thread via :func:`asyncio.to_thread`.

The Python kubernetes SDK is synchronous.  Each public method delegates to an
inner ``_run()`` closure that executes in a thread pool so the FastAPI event
loop is never blocked.
"""

from __future__ import annotations

import asyncio
import contextlib
import re
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

import yaml
from kubernetes import client as k8s_client  # type: ignore[import-untyped]
from kubernetes import config as k8s_config
from kubernetes import stream as k8s_stream

from telaios.domain.enums import K8sResourceKind

__all__ = [
    "K8sConnectionConfig",
    "K8sPVCFileEntry",
    "K8sResourceKind",
    "K8sResourceSummary",
    "KubernetesClient",
]

MAX_FILE_CONTENT_SIZE = 1024 * 1024  # 1 MB
_POLL_INTERVAL = 0.5  # seconds between pod-ready polls
_POD_TIMEOUT = 30.0  # seconds until temp-pod timeout


# ── Data classes ──────────────────────────────────────────────────────────────


@dataclass
class K8sConnectionConfig:
    """Connection parameters for a Kubernetes cluster.

    Mirrors ``K8sConnectionConfig`` from the TypeScript service.
    """

    kubeconfig: str | None = None
    cluster_url: str | None = None
    token: str | None = None
    ca_cert: str | None = None
    context_name: str | None = None


@dataclass
class K8sResourceSummary:
    """Minimal resource descriptor returned to callers."""

    name: str
    namespace: str
    kind: str
    status: str
    age: str
    labels: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "namespace": self.namespace,
            "kind": self.kind,
            "status": self.status,
            "age": self.age,
            "labels": self.labels,
        }


@dataclass
class K8sPVCFileEntry:
    """Single entry from a PVC directory listing."""

    name: str
    type: Literal["file", "directory"]
    size: int
    modified: str
    path: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "type": self.type,
            "size": self.size,
            "modified": self.modified,
            "path": self.path,
        }


# ── Internal helpers ──────────────────────────────────────────────────────────


def _build_api_client(cfg: K8sConnectionConfig) -> k8s_client.ApiClient:
    """Build a :class:`kubernetes.client.ApiClient` from *cfg*.

    Three paths, matching the TypeScript ``buildKubeConfig``:

    1. ``kubeconfig`` string → parse YAML, load from dict.
    2. ``cluster_url + token`` → construct :class:`Configuration` directly.
    3. Neither → fallback to in-cluster or local ``~/.kube/config``.
    """
    if cfg.kubeconfig:
        config_dict: dict[str, Any] = yaml.safe_load(cfg.kubeconfig)
        return k8s_config.new_client_from_config_dict(
            config_dict,
            context=cfg.context_name,
        )

    if cfg.cluster_url and cfg.token:
        configuration = k8s_client.Configuration()
        configuration.host = cfg.cluster_url
        configuration.api_key_prefix["authorization"] = "Bearer"
        configuration.api_key["authorization"] = cfg.token
        if cfg.ca_cert:
            # The SDK expects ssl_ca_cert to be a *file path*, not raw PEM.
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".crt",
                prefix="k8s-ca-",
                delete=False,
            ) as tmp:
                tmp.write(cfg.ca_cert)
            configuration.ssl_ca_cert = tmp.name
        return k8s_client.ApiClient(configuration)

    # Fallback: in-cluster service-account or local kubeconfig.
    try:
        k8s_config.load_incluster_config()
    except Exception:
        k8s_config.load_kube_config()
    return k8s_client.ApiClient()


def _status_from_pod(pod: Any) -> str:
    phase: str | None = getattr(getattr(pod, "status", None), "phase", None)
    return str(phase) if phase else "Unknown"


def _age_from_timestamp(ts: Any) -> str:
    if not ts:
        return "\u2014"
    try:
        import datetime

        if isinstance(ts, datetime.datetime):
            diff_s = time.time() - ts.timestamp()
        else:
            dt = datetime.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            diff_s = time.time() - dt.timestamp()
        hours = int(diff_s / 3600)
        return f"{hours}h" if hours < 24 else f"{hours // 24}d"
    except Exception:
        return "\u2014"


def _parse_ls_la_output(raw: str, dir_path: str) -> list[K8sPVCFileEntry]:
    """Parse ``ls -la`` output into :class:`K8sPVCFileEntry` list (max 500).

    Mirrors ``parseLsLaK8sOutput`` from the TypeScript service.
    """
    entries: list[K8sPVCFileEntry] = []
    for line in raw.split("\n"):
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("total "):
            continue
        m = re.match(
            r"^([d\-lcrwxst]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\S+\s+\S+\s+\S+)\s+(.+)$",
            trimmed,
        )
        if not m:
            continue
        perms, size_str, date_str, name_part = m.groups()
        name = name_part.split(" -> ")[0].strip()
        if name in (".", ".."):
            continue
        is_dir = perms.startswith("d")
        entry_path = f"/{name}" if dir_path == "/" else f"{dir_path}/{name}"
        entries.append(
            K8sPVCFileEntry(
                name=name,
                type="directory" if is_dir else "file",
                size=int(size_str),
                modified=date_str.strip(),
                path=entry_path,
            )
        )
    return entries[:500]


def _make_pvc_pod_body(
    pod_name: str,
    namespace: str,
    pvc_name: str,
) -> k8s_client.V1Pod:
    """Build a minimal busybox pod spec that mounts the target PVC at /data."""
    return k8s_client.V1Pod(
        metadata=k8s_client.V1ObjectMeta(name=pod_name, namespace=namespace),
        spec=k8s_client.V1PodSpec(
            restart_policy="Never",
            containers=[
                k8s_client.V1Container(
                    name="browser",
                    image="busybox:latest",
                    command=["sh", "-c", "sleep 60"],
                    volume_mounts=[
                        k8s_client.V1VolumeMount(name="data", mount_path="/data"),
                    ],
                )
            ],
            volumes=[
                k8s_client.V1Volume(
                    name="data",
                    persistent_volume_claim=k8s_client.V1PersistentVolumeClaimVolumeSource(
                        claim_name=pvc_name
                    ),
                )
            ],
        ),
    )


def _wait_for_pod_running(core_api: Any, pod_name: str, namespace: str) -> None:
    """Synchronously poll until the pod phase is *Running*.

    Raises :class:`RuntimeError` if the pod enters a terminal phase, or
    :class:`TimeoutError` after :data:`_POD_TIMEOUT` seconds.
    """
    deadline = time.monotonic() + _POD_TIMEOUT
    while True:
        pod = core_api.read_namespaced_pod(pod_name, namespace)
        phase: str = getattr(getattr(pod, "status", None), "phase", None) or ""
        if phase == "Running":
            return
        if phase in ("Failed", "Succeeded"):
            raise RuntimeError(f"Pod {pod_name} entered phase {phase} before Running")
        if time.monotonic() > deadline:
            raise TimeoutError(f"Timed out waiting for pod {pod_name} to be Running")
        time.sleep(_POLL_INTERVAL)


def _exec_in_temp_pod_sync(
    cfg: K8sConnectionConfig,
    namespace: str,
    pvc_name: str,
    command: list[str],
) -> str:
    """Synchronous helper that creates a temp pod, runs *command*, and cleans up.

    Must be called via :func:`asyncio.to_thread`.

    Mirrors ``execInTempPod`` from the TypeScript service.
    """
    api_client = _build_api_client(cfg)
    core_api = k8s_client.CoreV1Api(api_client)
    pod_name = f"pvc-browser-{uuid.uuid4().hex[:8]}"

    core_api.create_namespaced_pod(namespace, _make_pvc_pod_body(pod_name, namespace, pvc_name))

    try:
        _wait_for_pod_running(core_api, pod_name, namespace)

        output: str = k8s_stream.stream(
            core_api.connect_get_namespaced_pod_exec,
            pod_name,
            namespace,
            command=command,
            container="browser",
            stderr=False,
            stdin=False,
            stdout=True,
            tty=False,
        )
        return output
    finally:
        with contextlib.suppress(Exception):
            core_api.delete_namespaced_pod(
                pod_name,
                namespace,
                grace_period_seconds=0,
            )


# ── Client class ──────────────────────────────────────────────────────────────


class KubernetesClient:
    """Async wrapper around the Python ``kubernetes`` SDK.

    Each method delegates a synchronous closure to :func:`asyncio.to_thread` so
    the FastAPI event loop is never blocked.  The interface mirrors
    ``KubernetesClient`` from the TypeScript service.
    """

    # ── Cluster connectivity ──────────────────────────────────────────────────

    async def test_connection(self, cfg: K8sConnectionConfig) -> bool:
        """Return ``True`` if the cluster is reachable (lists namespaces)."""

        def _run() -> bool:
            try:
                api_client = _build_api_client(cfg)
                core_api = k8s_client.CoreV1Api(api_client)
                core_api.list_namespace(_request_timeout=5)
                return True
            except Exception:
                return False

        return await asyncio.to_thread(_run)

    # ── Resource listing / retrieval ──────────────────────────────────────────

    async def list_resources(
        self,
        cfg: K8sConnectionConfig,
        namespace: str,
        kind: str,
    ) -> list[dict[str, Any]]:
        """List resources of *kind* in *namespace* (``"all"`` for cluster-wide)."""

        def _run() -> list[dict[str, Any]]:
            api_client = _build_api_client(cfg)
            core_api = k8s_client.CoreV1Api(api_client)
            apps_api = k8s_client.AppsV1Api(api_client)
            network_api = k8s_client.NetworkingV1Api(api_client)
            batch_api = k8s_client.BatchV1Api(api_client)
            all_ns = namespace == "all"
            items: list[Any] = []

            try:
                if kind == "pods":
                    r = (
                        core_api.list_pod_for_all_namespaces()
                        if all_ns
                        else core_api.list_namespaced_pod(namespace)
                    )
                    items = r.items or []
                elif kind == "services":
                    r = (
                        core_api.list_service_for_all_namespaces()
                        if all_ns
                        else core_api.list_namespaced_service(namespace)
                    )
                    items = r.items or []
                elif kind == "configmaps":
                    r = (
                        core_api.list_config_map_for_all_namespaces()
                        if all_ns
                        else core_api.list_namespaced_config_map(namespace)
                    )
                    items = r.items or []
                elif kind == "secrets":
                    r = (
                        core_api.list_secret_for_all_namespaces()
                        if all_ns
                        else core_api.list_namespaced_secret(namespace)
                    )
                    items = r.items or []
                elif kind == "persistentvolumeclaims":
                    r = (
                        core_api.list_persistent_volume_claim_for_all_namespaces()
                        if all_ns
                        else core_api.list_namespaced_persistent_volume_claim(namespace)
                    )
                    items = r.items or []
                elif kind == "namespaces":
                    items = (core_api.list_namespace().items) or []
                elif kind == "deployments":
                    r = (
                        apps_api.list_deployment_for_all_namespaces()
                        if all_ns
                        else apps_api.list_namespaced_deployment(namespace)
                    )
                    items = r.items or []
                elif kind == "replicasets":
                    r = (
                        apps_api.list_replica_set_for_all_namespaces()
                        if all_ns
                        else apps_api.list_namespaced_replica_set(namespace)
                    )
                    items = r.items or []
                elif kind == "statefulsets":
                    r = (
                        apps_api.list_stateful_set_for_all_namespaces()
                        if all_ns
                        else apps_api.list_namespaced_stateful_set(namespace)
                    )
                    items = r.items or []
                elif kind == "daemonsets":
                    r = (
                        apps_api.list_daemon_set_for_all_namespaces()
                        if all_ns
                        else apps_api.list_namespaced_daemon_set(namespace)
                    )
                    items = r.items or []
                elif kind == "ingresses":
                    r = (
                        network_api.list_ingress_for_all_namespaces()
                        if all_ns
                        else network_api.list_namespaced_ingress(namespace)
                    )
                    items = r.items or []
                elif kind == "jobs":
                    r = (
                        batch_api.list_job_for_all_namespaces()
                        if all_ns
                        else batch_api.list_namespaced_job(namespace)
                    )
                    items = r.items or []
                elif kind == "cronjobs":
                    r = (
                        batch_api.list_cron_job_for_all_namespaces()
                        if all_ns
                        else batch_api.list_namespaced_cron_job(namespace)
                    )
                    items = r.items or []
            except Exception:
                return []

            return [
                K8sResourceSummary(
                    name=getattr(getattr(item, "metadata", None), "name", None) or "unknown",
                    namespace=getattr(getattr(item, "metadata", None), "namespace", None)
                    or namespace,
                    kind=kind,
                    status=_status_from_pod(item) if kind == "pods" else "\u2014",
                    age=_age_from_timestamp(
                        getattr(getattr(item, "metadata", None), "creation_timestamp", None)
                    ),
                    labels=getattr(getattr(item, "metadata", None), "labels", None) or {},
                ).as_dict()
                for item in items
            ]

        return await asyncio.to_thread(_run)

    async def get_resource(
        self,
        cfg: K8sConnectionConfig,
        namespace: str,
        kind: str,
        name: str,
    ) -> Any:
        """Read a single named resource; returns ``None`` for unknown kinds or errors."""

        def _run() -> Any:
            api_client = _build_api_client(cfg)
            core_api = k8s_client.CoreV1Api(api_client)
            apps_api = k8s_client.AppsV1Api(api_client)
            try:
                if kind == "pods":
                    return core_api.read_namespaced_pod(name, namespace).to_dict()
                if kind == "services":
                    return core_api.read_namespaced_service(name, namespace).to_dict()
                if kind == "configmaps":
                    return core_api.read_namespaced_config_map(name, namespace).to_dict()
                if kind == "secrets":
                    return core_api.read_namespaced_secret(name, namespace).to_dict()
                if kind == "deployments":
                    return apps_api.read_namespaced_deployment(name, namespace).to_dict()
            except Exception:
                return None
            return None

        return await asyncio.to_thread(_run)

    async def get_pod_logs(
        self,
        cfg: K8sConnectionConfig,
        namespace: str,
        pod_name: str,
        container: str | None = None,
        tail_lines: int = 200,
    ) -> str:
        """Fetch the last *tail_lines* lines from a pod's log."""

        def _run() -> str:
            api_client = _build_api_client(cfg)
            core_api = k8s_client.CoreV1Api(api_client)
            kwargs: dict[str, Any] = {"tail_lines": tail_lines}
            if container:
                kwargs["container"] = container
            result = core_api.read_namespaced_pod_log(pod_name, namespace, **kwargs)
            return str(result)

        return await asyncio.to_thread(_run)

    async def list_namespaces(self, cfg: K8sConnectionConfig) -> list[str]:
        """Return all namespace names in the cluster."""

        def _run() -> list[str]:
            try:
                api_client = _build_api_client(cfg)
                core_api = k8s_client.CoreV1Api(api_client)
                result = core_api.list_namespace()
                return [
                    item.metadata.name
                    for item in (result.items or [])
                    if item.metadata and item.metadata.name
                ]
            except Exception:
                return []

        return await asyncio.to_thread(_run)

    # ── PVC file browser ──────────────────────────────────────────────────────

    async def list_pvc_files(
        self,
        cfg: K8sConnectionConfig,
        namespace: str,
        pvc_name: str,
        dir_path: str,
    ) -> list[dict[str, Any]]:
        """List files/directories inside a PVC at *dir_path*.

        Mirrors ``listPVCFiles`` from the TypeScript service.
        """
        raw = await asyncio.to_thread(
            _exec_in_temp_pod_sync,
            cfg,
            namespace,
            pvc_name,
            ["sh", "-c", f"ls -la /data{dir_path}"],
        )
        return [e.as_dict() for e in _parse_ls_la_output(raw, dir_path)]

    async def get_pvc_file_content(
        self,
        cfg: K8sConnectionConfig,
        namespace: str,
        pvc_name: str,
        file_path: str,
    ) -> dict[str, Any]:
        """Read a file from a PVC.

        Returns ``{"content": str, "encoding": "text"|"binary", "size": int}``.
        Raises :class:`ValueError` if the file exceeds :data:`MAX_FILE_CONTENT_SIZE`.

        Mirrors ``getPVCFileContent`` from the TypeScript service.
        """
        import base64 as b64mod

        size_out = await asyncio.to_thread(
            _exec_in_temp_pod_sync,
            cfg,
            namespace,
            pvc_name,
            ["sh", "-c", f"wc -c < /data{file_path}"],
        )
        size = int(size_out.strip()) if size_out.strip().isdigit() else 0
        if size > MAX_FILE_CONTENT_SIZE:
            raise ValueError(
                f"File too large to read ({size} bytes); max is {MAX_FILE_CONTENT_SIZE}"
            )

        b64_out = await asyncio.to_thread(
            _exec_in_temp_pod_sync,
            cfg,
            namespace,
            pvc_name,
            ["base64", f"/data{file_path}"],
        )
        content_bytes = b64mod.b64decode(b64_out.replace("\n", "").replace(" ", ""))

        encoding: Literal["text", "binary"] = "text"
        for byte in content_bytes[:8192]:
            if byte == 0:
                encoding = "binary"
                break

        content = (
            content_bytes.decode("utf-8")
            if encoding == "text"
            else b64mod.b64encode(content_bytes).decode("ascii")
        )
        return {"content": content, "encoding": encoding, "size": len(content_bytes)}

    async def update_pvc_file_content(
        self,
        cfg: K8sConnectionConfig,
        namespace: str,
        pvc_name: str,
        file_path: str,
        content: str,
    ) -> None:
        """Overwrite a file inside a PVC with *content* (UTF-8).

        Mirrors ``updatePVCFileContent`` from the TypeScript service.
        """
        import base64 as b64mod

        b64 = b64mod.b64encode(content.encode("utf-8")).decode("ascii")
        await asyncio.to_thread(
            _exec_in_temp_pod_sync,
            cfg,
            namespace,
            pvc_name,
            ["sh", "-c", f"echo '{b64}' | base64 -d > /data{file_path}"],
        )
