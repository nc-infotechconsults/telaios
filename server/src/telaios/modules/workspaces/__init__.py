"""Workspaces module public API."""

from telaios.modules.workspaces.router import project_workspaces_router, workspace_router
from telaios.modules.workspaces.service import WorkspaceService

__all__ = ["WorkspaceService", "project_workspaces_router", "workspace_router"]
