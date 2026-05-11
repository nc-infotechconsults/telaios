"""Docker host operations.

Full async wrapper around the synchronous ``docker`` SDK (via
``asyncio.to_thread``).  Ported from
``data-api/src/services/docker.service.ts``.
"""

from __future__ import annotations

import asyncio
import contextlib
import io
import logging
import os
import struct
import tarfile
import tempfile
import time
from dataclasses import dataclass, field
from typing import Any, cast

import docker
import docker.errors
from docker.tls import TLSConfig

__all__ = ["DockerClient", "DockerConnectionConfig"]

logger = logging.getLogger(__name__)

# Max file size accepted by get_volume_file_content (1 MB)
_MAX_FILE_SIZE = 1024 * 1024


# ── Config ────────────────────────────────────────────────────────────────────


@dataclass
class DockerConnectionConfig:
    host: str | None = None
    tls_cert: str | None = None
    tls_key: str | None = None
    tls_ca: str | None = None
    type: str = field(default="docker")  # kept for parity with TS interface


# ── Internal helpers ──────────────────────────────────────────────────────────


def _build_client(cfg: DockerConnectionConfig) -> docker.DockerClient:
    """Build a synchronous docker SDK client from *cfg*."""
    if not cfg.host:
        return docker.from_env()

    if cfg.host.startswith("unix://"):
        raw = cfg.host[len("unix://") :]
        socket_path = "/var/run/docker.sock" if raw.endswith("docker-cli.sock") else raw
        return docker.DockerClient(base_url=f"unix://{socket_path}")

    # tcp:// or https:// — optionally TLS
    tls_config: TLSConfig | None = None
    _tmp_files: list[str] = []

    if cfg.tls_cert and cfg.tls_key and cfg.tls_ca:
        # docker SDK needs file paths, not string content
        def _write_tmp(content: str) -> str:
            fd, path = tempfile.mkstemp()
            try:
                with os.fdopen(fd, "w") as f:
                    f.write(content)
            except Exception:
                os.close(fd)
                raise
            _tmp_files.append(path)
            return path

        cert_path = _write_tmp(cfg.tls_cert)
        key_path = _write_tmp(cfg.tls_key)
        ca_path = _write_tmp(cfg.tls_ca)
        tls_config = TLSConfig(
            client_cert=(cert_path, key_path),
            ca_cert=ca_path,
            verify=True,
        )

    try:
        client = docker.DockerClient(base_url=cfg.host, tls=tls_config)
    finally:
        for p in _tmp_files:
            with contextlib.suppress(OSError):
                os.unlink(p)

    return client


def _parse_muxed(data: bytes) -> str:
    """Parse Docker multiplexed stream → combined utf-8 string."""
    chunks: list[bytes] = []
    offset = 0
    while offset + 8 <= len(data):
        size = struct.unpack_from(">I", data, offset + 4)[0]
        offset += 8
        if offset + size > len(data):
            break
        chunks.append(data[offset : offset + size])
        offset += size
    return b"".join(chunks).decode("utf-8", errors="replace")


def _parse_muxed_split(data: bytes) -> tuple[str, str]:
    """Parse Docker multiplexed stream → (stdout, stderr)."""
    stdout: list[bytes] = []
    stderr: list[bytes] = []
    offset = 0
    while offset + 8 <= len(data):
        stream_type = data[offset]
        size = struct.unpack_from(">I", data, offset + 4)[0]
        offset += 8
        if offset + size > len(data):
            break
        chunk = data[offset : offset + size]
        if stream_type == 1:
            stdout.append(chunk)
        elif stream_type == 2:
            stderr.append(chunk)
        offset += size
    return (
        b"".join(stdout).decode("utf-8", errors="replace"),
        b"".join(stderr).decode("utf-8", errors="replace"),
    )


def _create_tar_bytes(file_name: str, content: bytes) -> bytes:
    """Build a minimal ustar tar archive containing a single file."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        info = tarfile.TarInfo(name=file_name)
        info.size = len(content)
        info.mtime = int(time.time())
        info.mode = 0o644
        tar.addfile(info, io.BytesIO(content))
    return buf.getvalue()


def _parse_ls_la(raw: str, dir_path: str) -> list[dict[str, Any]]:
    """Parse ``ls -la`` output into a list of file-entry dicts (≤ 500)."""
    import re

    entries: list[dict[str, Any]] = []
    pattern = re.compile(
        r"^([d\-lcrwxst]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\S+\s+\S+\s+\S+)\s+(.+)$"
    )
    for line in raw.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("total "):
            continue
        m = pattern.match(trimmed)
        if not m:
            continue
        perms, size_str, date_str, name_part = m.groups()
        name = name_part.split(" -> ")[0].strip()
        if name in (".", ".."):
            continue
        is_dir = perms.startswith("d")
        entry_path = f"/{name}" if dir_path == "/" else f"{dir_path}/{name}"
        entries.append(
            {
                "name": name,
                "type": "directory" if is_dir else "file",
                "size": int(size_str),
                "modified": date_str.strip(),
                "path": entry_path,
            }
        )
    return entries[:500]


def _ensure_image_sync(client: docker.DockerClient, image: str) -> None:
    """Pull *image* if not present locally (synchronous)."""
    try:
        images = client.images.list(filters={"reference": image})
        if images:
            return
    except docker.errors.DockerException:
        pass
    logger.info("Image %s not found locally — pulling", image)
    client.images.pull(image)
    logger.info("Image %s pull complete", image)


# ── Main class ────────────────────────────────────────────────────────────────


class DockerClient:
    """Async Docker client.

    Every method wraps the synchronous ``docker`` SDK via
    ``asyncio.to_thread`` so it is safe to call from FastAPI route handlers.
    """

    # ── Containers ────────────────────────────────────────────────────────────

    @staticmethod
    async def list_containers(cfg: DockerConnectionConfig) -> list[dict[str, Any]]:
        def _sync() -> list[dict[str, Any]]:
            client = _build_client(cfg)
            containers = client.containers.list(all=True)
            result = []
            for c in containers:
                attrs = c.attrs or {}
                network_settings = attrs.get("NetworkSettings", {})
                ports_raw: list[dict[str, Any]] = []
                for container_port, bindings in (network_settings.get("Ports") or {}).items():
                    try:
                        cp_num, proto = container_port.split("/")
                    except ValueError:
                        cp_num, proto = container_port, "tcp"
                    if bindings:
                        for b in bindings:
                            hp = int(b["HostPort"]) if b.get("HostPort") else None
                            ports_raw.append(
                                {"host": hp, "container": int(cp_num), "protocol": proto}
                            )
                    else:
                        ports_raw.append(
                            {"host": None, "container": int(cp_num), "protocol": proto}
                        )
                names = attrs.get("Name") or (attrs.get("Names") or [None])[0] or ""
                if isinstance(names, list):
                    names = names[0] if names else ""
                result.append(
                    {
                        "id": c.short_id,
                        "name": names.lstrip("/"),
                        "image": c.image.tags[0]
                        if c.image and c.image.tags
                        else c.image.id
                        if c.image
                        else "",
                        "status": c.status,
                        "state": (attrs.get("State") or {}).get("Status", c.status),
                        "created": attrs.get("Created", ""),
                        "ports": ports_raw,
                    }
                )
            return result

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def get_container(cfg: DockerConnectionConfig, container_id: str) -> dict[str, Any]:
        def _sync() -> dict[str, Any]:
            return cast(dict[str, Any], _build_client(cfg).containers.get(container_id).attrs)

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def get_container_logs(
        cfg: DockerConnectionConfig, container_id: str, tail: int = 200
    ) -> str:
        def _sync() -> str:
            raw = (
                _build_client(cfg)
                .containers.get(container_id)
                .logs(stdout=True, stderr=True, tail=tail)
            )
            if isinstance(raw, bytes):
                return raw.decode("utf-8", errors="replace")
            return str(raw)

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def start_container(cfg: DockerConnectionConfig, container_id: str) -> None:
        await asyncio.to_thread(lambda: _build_client(cfg).containers.get(container_id).start())

    @staticmethod
    async def stop_container(cfg: DockerConnectionConfig, container_id: str) -> None:
        await asyncio.to_thread(lambda: _build_client(cfg).containers.get(container_id).stop())

    @staticmethod
    async def restart_container(cfg: DockerConnectionConfig, container_id: str) -> None:
        await asyncio.to_thread(lambda: _build_client(cfg).containers.get(container_id).restart())

    @staticmethod
    async def remove_container(
        cfg: DockerConnectionConfig, container_id: str, force: bool = False
    ) -> None:
        await asyncio.to_thread(
            lambda: _build_client(cfg).containers.get(container_id).remove(force=force)
        )

    @staticmethod
    async def create_container(
        cfg: DockerConnectionConfig,
        image: str,
        name: str | None = None,
        cmd: list[str] | None = None,
        env: dict[str, str] | None = None,
        ports: list[dict[str, Any]] | None = None,
        volumes: list[dict[str, Any]] | None = None,
        network: str | None = None,
        auto_remove: bool = False,
        start: bool = False,
    ) -> dict[str, str]:
        def _sync() -> dict[str, str]:
            client = _build_client(cfg)
            env_list = [f"{k}={v}" for k, v in (env or {}).items()] or None

            exposed: dict[str, dict[str, str]] = {}
            port_bindings: dict[str, list[dict[str, str]]] = {}
            for p in ports or []:
                proto = p.get("protocol", "tcp")
                key = f"{p['container']}/{proto}"
                exposed[key] = {}
                port_bindings[key] = [{"HostPort": str(p["host"])}]

            binds: list[str] = []
            for v in volumes or []:
                src = v.get("source", "")
                ro = ":ro" if v.get("read_only") else ""
                binds.append(f"{src}:{v['container_path']}{ro}")

            container = client.containers.create(
                image=image,
                name=name,
                command=cmd,
                environment=env_list,
                ports=exposed if exposed else None,
                host_config=client.api.create_host_config(
                    port_bindings=port_bindings if port_bindings else None,
                    binds=binds if binds else None,
                    network_mode=network,
                    auto_remove=auto_remove,
                ),
            )
            if start:
                container.start()
            return {"id": container.short_id}

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def exec_container(
        cfg: DockerConnectionConfig,
        container_id: str,
        cmd: list[str],
        working_dir: str | None = None,
        user: str | None = None,
        timeout_ms: int = 30_000,
    ) -> dict[str, Any]:
        def _sync() -> dict[str, Any]:
            client = _build_client(cfg)
            container = client.containers.get(container_id)
            kwargs: dict[str, Any] = {
                "stdout": True,
                "stderr": True,
                "demux": True,
            }
            if working_dir:
                kwargs["workdir"] = working_dir
            if user:
                kwargs["user"] = user
            result = container.exec_run(cmd, **kwargs)
            stdout_b, stderr_b = result.output or (b"", b"")
            return {
                "stdout": (stdout_b or b"").decode("utf-8", errors="replace"),
                "stderr": (stderr_b or b"").decode("utf-8", errors="replace"),
                "exit_code": result.exit_code or 0,
            }

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def container_stats(cfg: DockerConnectionConfig, container_id: str) -> dict[str, Any]:
        def _sync() -> dict[str, Any]:
            raw: dict[str, Any] = (
                _build_client(cfg).containers.get(container_id).stats(stream=False)
            )
            cpu_stats = raw.get("cpu_stats", {})
            pre_cpu = raw.get("precpu_stats", {})
            cpu_delta = cpu_stats.get("cpu_usage", {}).get("total_usage", 0) - pre_cpu.get(
                "cpu_usage", {}
            ).get("total_usage", 0)
            sys_delta = cpu_stats.get("system_cpu_usage", 0) - pre_cpu.get("system_cpu_usage", 0)
            num_cpus = cpu_stats.get("online_cpus") or len(
                cpu_stats.get("cpu_usage", {}).get("percpu_usage") or [1]
            )
            cpu_pct = 0.0
            if sys_delta > 0 and cpu_delta > 0:
                cpu_pct = round((cpu_delta / sys_delta) * num_cpus * 100.0, 2)

            mem = raw.get("memory_stats", {})
            mem_usage = mem.get("usage", 0)
            mem_limit = mem.get("limit", 0)
            mem_pct = round((mem_usage / mem_limit) * 100.0, 2) if mem_limit > 0 else 0.0

            nets = raw.get("networks", {})
            rx = sum(v.get("rx_bytes", 0) for v in nets.values())
            tx = sum(v.get("tx_bytes", 0) for v in nets.values())

            blkio = raw.get("blkio_stats", {}).get("io_service_bytes_recursive") or []
            blk_r = sum(e.get("value", 0) for e in blkio if e.get("op") == "Read")
            blk_w = sum(e.get("value", 0) for e in blkio if e.get("op") == "Write")

            pids = raw.get("pids_stats", {}).get("current", 0)
            return {
                "container_id": container_id,
                "cpu_percent": cpu_pct,
                "memory_usage": mem_usage,
                "memory_limit": mem_limit,
                "memory_percent": mem_pct,
                "network_rx": rx,
                "network_tx": tx,
                "block_read": blk_r,
                "block_write": blk_w,
                "pids": pids,
            }

        return await asyncio.to_thread(_sync)

    # ── Images ────────────────────────────────────────────────────────────────

    @staticmethod
    async def list_images(cfg: DockerConnectionConfig) -> list[dict[str, Any]]:
        def _sync() -> list[dict[str, Any]]:
            imgs = _build_client(cfg).images.list(all=False)
            result = []
            for img in imgs:
                tags = [t for t in (img.tags or []) if t != "<none>:<none>"]
                first = next((t for t in tags), None)
                repo = first.split(":")[0] if first else None
                result.append(
                    {
                        "id": img.id,
                        "tags": tags,
                        "size": img.attrs.get("Size", 0),
                        "created": img.attrs.get("Created", ""),
                        "repository": repo,
                    }
                )
            return result

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def remove_image(cfg: DockerConnectionConfig, image_id: str, force: bool = False) -> None:
        await asyncio.to_thread(lambda: _build_client(cfg).images.remove(image_id, force=force))

    @staticmethod
    async def inspect_image(cfg: DockerConnectionConfig, image_id: str) -> dict[str, Any]:
        def _sync() -> dict[str, Any]:
            return cast(dict[str, Any], _build_client(cfg).images.get(image_id).attrs)

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def pull_image(
        cfg: DockerConnectionConfig,
        image: str,
        tag: str = "latest",
        username: str | None = None,
        password: str | None = None,
    ) -> None:
        def _sync() -> None:
            client = _build_client(cfg)
            ref = f"{image}:{tag}" if tag else image
            auth_config = {"username": username, "password": password or ""} if username else None
            client.images.pull(ref, auth_config=auth_config)

        await asyncio.to_thread(_sync)

    @staticmethod
    async def tag_image(cfg: DockerConnectionConfig, image_id: str, repo: str, tag: str) -> None:
        await asyncio.to_thread(lambda: _build_client(cfg).images.get(image_id).tag(repo, tag))

    @staticmethod
    async def prune_images(cfg: DockerConnectionConfig) -> dict[str, Any]:
        def _sync() -> dict[str, Any]:
            r = _build_client(cfg).images.prune()
            deleted = r.get("ImagesDeleted") or []
            removed = [d.get("Deleted") or d.get("Untagged") or "" for d in deleted if d]
            return {
                "removed": [x for x in removed if x],
                "reclaimed_bytes": r.get("SpaceReclaimed", 0),
            }

        return await asyncio.to_thread(_sync)

    # ── Volumes ───────────────────────────────────────────────────────────────

    @staticmethod
    async def list_volumes(cfg: DockerConnectionConfig) -> list[dict[str, Any]]:
        def _sync() -> list[dict[str, Any]]:
            vols = _build_client(cfg).volumes.list()
            return [
                {
                    "name": v.name,
                    "driver": v.attrs.get("Driver", ""),
                    "mountpoint": v.attrs.get("Mountpoint", ""),
                    "created": v.attrs.get("CreatedAt", ""),
                    "scope": v.attrs.get("Scope", "local"),
                    "labels": v.attrs.get("Labels") or {},
                }
                for v in vols
            ]

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def remove_volume(cfg: DockerConnectionConfig, name: str) -> None:
        await asyncio.to_thread(lambda: _build_client(cfg).volumes.get(name).remove())

    @staticmethod
    async def inspect_volume(cfg: DockerConnectionConfig, name: str) -> dict[str, Any]:
        def _sync() -> dict[str, Any]:
            return cast(dict[str, Any], _build_client(cfg).volumes.get(name).attrs)

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def create_volume(
        cfg: DockerConnectionConfig,
        name: str,
        driver: str = "local",
        driver_opts: dict[str, str] | None = None,
    ) -> dict[str, str]:
        def _sync() -> dict[str, str]:
            v = _build_client(cfg).volumes.create(
                name=name, driver=driver, driver_opts=driver_opts or {}
            )
            return {"name": v.name}

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def prune_volumes(cfg: DockerConnectionConfig) -> dict[str, Any]:
        def _sync() -> dict[str, Any]:
            r = _build_client(cfg).volumes.prune()
            return {
                "removed": r.get("VolumesDeleted") or [],
                "reclaimed_bytes": r.get("SpaceReclaimed", 0),
            }

        return await asyncio.to_thread(_sync)

    # ── Volume file browser ───────────────────────────────────────────────────

    @staticmethod
    async def list_volume_files(
        cfg: DockerConnectionConfig, volume_name: str, dir_path: str
    ) -> list[dict[str, Any]]:
        def _sync() -> list[dict[str, Any]]:
            client = _build_client(cfg)
            _ensure_image_sync(client, "busybox:latest")
            container = client.containers.create(
                image="busybox:latest",
                command=["sleep", "infinity"],
                host_config=client.api.create_host_config(binds=[f"{volume_name}:/vol:ro"]),
                labels={"swe-temp": "true"},
            )
            try:
                container.start()
                result = container.exec_run(
                    ["ls", "-la", f"/vol{dir_path}"],
                    stdout=True,
                    stderr=False,
                )
                raw_output = (result.output or b"").decode("utf-8", errors="replace")
                return _parse_ls_la(raw_output, dir_path)
            finally:
                with contextlib.suppress(Exception):
                    container.stop(timeout=0)
                with contextlib.suppress(Exception):
                    container.remove(force=True)

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def get_volume_file_content(
        cfg: DockerConnectionConfig, volume_name: str, file_path: str
    ) -> dict[str, Any]:
        def _sync() -> dict[str, Any]:
            import base64

            client = _build_client(cfg)
            _ensure_image_sync(client, "busybox:latest")
            container = client.containers.create(
                image="busybox:latest",
                command=["sleep", "infinity"],
                host_config=client.api.create_host_config(binds=[f"{volume_name}:/vol:ro"]),
                labels={"swe-temp": "true"},
            )
            try:
                container.start()
                # check size
                size_result = container.exec_run(
                    ["wc", "-c", f"/vol{file_path}"], stdout=True, stderr=True
                )
                size_str = (size_result.output or b"").decode("utf-8", errors="replace").strip()
                size = int(size_str.split()[0]) if size_str else 0
                if size > _MAX_FILE_SIZE:
                    raise ValueError(f"File too large ({size} bytes); max is {_MAX_FILE_SIZE}")
                # read via base64
                b64_result = container.exec_run(
                    ["base64", f"/vol{file_path}"], stdout=True, stderr=False
                )
                b64_str = (b64_result.output or b"").decode("utf-8", errors="replace")
                content_bytes = base64.b64decode(b64_str.replace("\n", "").replace(" ", ""))
                # detect binary
                encoding = "text"
                sample = content_bytes[:8192]
                if b"\x00" in sample:
                    encoding = "binary"
                content_str = (
                    base64.b64encode(content_bytes).decode("ascii")
                    if encoding == "binary"
                    else content_bytes.decode("utf-8", errors="replace")
                )
                return {
                    "content": content_str,
                    "encoding": encoding,
                    "size": len(content_bytes),
                    "path": file_path,
                }
            finally:
                with contextlib.suppress(Exception):
                    container.stop(timeout=0)
                with contextlib.suppress(Exception):
                    container.remove(force=True)

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def update_volume_file_content(
        cfg: DockerConnectionConfig,
        volume_name: str,
        file_path: str,
        content: str,
    ) -> None:
        def _sync() -> None:
            client = _build_client(cfg)
            _ensure_image_sync(client, "busybox:latest")
            container = client.containers.create(
                image="busybox:latest",
                command=["sleep", "infinity"],
                host_config=client.api.create_host_config(binds=[f"{volume_name}:/vol"]),
                labels={"swe-temp": "true"},
            )
            try:
                container.start()
                parts = [p for p in file_path.split("/") if p]
                file_name = parts[-1] if parts else "file"
                dir_path = "/" + "/".join(parts[:-1]) if len(parts) > 1 else "/"
                tar_bytes = _create_tar_bytes(file_name, content.encode("utf-8"))
                container.put_archive(f"/vol{dir_path}", tar_bytes)
            finally:
                with contextlib.suppress(Exception):
                    container.stop(timeout=0)
                with contextlib.suppress(Exception):
                    container.remove(force=True)

        await asyncio.to_thread(_sync)

    # ── Networks ──────────────────────────────────────────────────────────────

    @staticmethod
    async def list_networks(cfg: DockerConnectionConfig) -> list[dict[str, Any]]:
        def _sync() -> list[dict[str, Any]]:
            nets = _build_client(cfg).networks.list()
            result = []
            for n in nets:
                attrs = n.attrs or {}
                ipam_cfg = (attrs.get("IPAM") or {}).get("Config") or []
                ipam = None
                if ipam_cfg:
                    first = ipam_cfg[0]
                    if first.get("Subnet"):
                        ipam = {
                            "subnet": first["Subnet"],
                            "gateway": first.get("Gateway", ""),
                        }
                containers_count = len(attrs.get("Containers") or {})
                result.append(
                    {
                        "id": n.id,
                        "name": n.name,
                        "driver": attrs.get("Driver", ""),
                        "scope": attrs.get("Scope", ""),
                        "ipam": ipam,
                        "containers": containers_count,
                        "created": attrs.get("Created", ""),
                    }
                )
            return result

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def inspect_network(cfg: DockerConnectionConfig, network_id: str) -> dict[str, Any]:
        def _sync() -> dict[str, Any]:
            return cast(dict[str, Any], _build_client(cfg).networks.get(network_id).attrs)

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def create_network(
        cfg: DockerConnectionConfig,
        name: str,
        driver: str = "bridge",
        subnet: str | None = None,
        gateway: str | None = None,
        internal: bool = False,
    ) -> dict[str, str]:
        def _sync() -> dict[str, str]:
            ipam: dict[str, Any] | None = None
            if subnet:
                pool: dict[str, str] = {"Subnet": subnet}
                if gateway:
                    pool["Gateway"] = gateway
                ipam = {"Config": [pool]}
            n = _build_client(cfg).networks.create(
                name=name,
                driver=driver,
                internal=internal,
                ipam=ipam,
            )
            return {"id": n.id}

        return await asyncio.to_thread(_sync)

    @staticmethod
    async def remove_network(cfg: DockerConnectionConfig, network_id: str) -> None:
        await asyncio.to_thread(lambda: _build_client(cfg).networks.get(network_id).remove())

    @staticmethod
    async def prune_networks(cfg: DockerConnectionConfig) -> dict[str, Any]:
        def _sync() -> dict[str, Any]:
            r = _build_client(cfg).networks.prune()
            return {
                "removed": r.get("NetworksDeleted") or [],
                "reclaimed_bytes": 0,
            }

        return await asyncio.to_thread(_sync)

    # ── Connection test ───────────────────────────────────────────────────────

    @staticmethod
    async def test_connection(cfg: DockerConnectionConfig) -> dict[str, Any]:
        def _sync() -> dict[str, Any]:
            try:
                info = _build_client(cfg).version()
                return {"ok": True, "version": info.get("Version")}
            except Exception as exc:
                logger.error("Docker connection test failed: %s", exc)
                return {"ok": False}

        return await asyncio.to_thread(_sync)

    # ── Shell exec helpers (used by docker_shell router) ──────────────────────

    @staticmethod
    def build_client_sync(cfg: DockerConnectionConfig) -> docker.DockerClient:
        """Return a synchronous DockerClient (for use in threads)."""
        return _build_client(cfg)
