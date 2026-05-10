"""Helm CLI wrapper (Phase 8 stub).

Full port of ``data-api/src/services/helm.service.ts`` (200 lines) is deferred
to **Phase 8 (containers module)**. Will shell out to the ``helm`` binary
(already installed in the server Dockerfile) using :mod:`asyncio.subprocess`.
"""

from __future__ import annotations

__all__ = ["HelmClient"]


class HelmClient:
    """Placeholder. Implementation lands in Phase 8."""

    def __init__(self) -> None:
        raise NotImplementedError("HelmClient is implemented in Phase 8")
