"""Containers module — HTTP wrapper around DockerClient.

All endpoints are under ``/environments/{env_id}/...`` and delegate to
``telaios.infra.docker.DockerClient``.
"""

from telaios.modules.containers.router import containers_router

__all__ = ["containers_router"]
