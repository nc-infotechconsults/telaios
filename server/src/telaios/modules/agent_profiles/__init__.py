"""Agent profiles module public facade."""

from telaios.modules.agent_profiles.router import agent_profiles_router
from telaios.modules.agent_profiles.service import AgentProfileService

__all__ = ["AgentProfileService", "agent_profiles_router"]
