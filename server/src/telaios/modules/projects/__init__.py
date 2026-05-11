"""Projects module public facade."""

from telaios.modules.projects.agents.router import agents_router
from telaios.modules.projects.members.router import members_router
from telaios.modules.projects.router import projects_router
from telaios.modules.projects.service import ProjectService

__all__ = ["ProjectService", "agents_router", "members_router", "projects_router"]
