"""Docker host operations (Phase 8 stub).

Full port of ``data-api/src/services/docker-actions.service.ts`` (255 lines:
container lifecycle, exec, logs, stats, image pull, dockerShell WebSocket)
is deferred to **Phase 8 (containers module)** since no Phase 1-7 module calls
docker. This file exists so import-linter contracts and lifespan hooks can
reference a stable module path.
"""

from __future__ import annotations

__all__ = ["DockerClient"]


class DockerClient:
    """Placeholder. Implementation lands in Phase 8."""

    def __init__(self) -> None:
        raise NotImplementedError("DockerClient is implemented in Phase 8")
