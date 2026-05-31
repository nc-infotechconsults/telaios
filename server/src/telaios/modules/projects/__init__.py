"""Projects module public facade."""

from telaios.modules.projects.agents.router import agents_router
from telaios.modules.projects.conversation.router import conversation_router
from telaios.modules.projects.mcps.router import project_mcps_router
from telaios.modules.projects.members.router import members_router
from telaios.modules.projects.router import projects_router
from telaios.modules.projects.service import ProjectService
from telaios.modules.projects.skills.router import project_skills_router

__all__ = [
    "ProjectService",
    "agents_router",
    "conversation_router",
    "members_router",
    "project_mcps_router",
    "project_skills_router",
    "projects_router",
]
