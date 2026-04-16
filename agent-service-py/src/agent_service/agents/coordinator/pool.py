from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from agent_service.agents.coordinator.drivers.base import CodingAgentDriver
from agent_service.agents.coordinator.drivers.langgraph import LangGraphDriver
from agent_service.agents.coordinator.drivers.opencode import OpenCodeDriver
from agent_service.agents.coordinator.drivers.github_copilot import GitHubCopilotDriver
from agent_service.agents.coordinator.drivers.base_agent_driver import BaseAgentDriver
from agent_service.agents.register import ROLE_TO_AGENT_TYPE
from agent_service.core.agent_framework.registry import AgentRegistry
from agent_service.core.llm import build_chat_model
from agent_service.core.types import McpServer, Skill
from agent_service.crypto import decrypt


@dataclass
class AgentProfileConfig:
    id: str
    agent_type: str  # "langgraph" | "opencode" | "github-copilot"
    llm_provider: str
    llm_model: str
    llm_api_key: str
    llm_base_url: Optional[str] = None
    github_token: Optional[str] = None
    mcp_servers: List[McpServer] = field(default_factory=list)
    skills: List[Skill] = field(default_factory=list)


class AgentPool:
    """Manages a pool of ``CodingAgentDriver`` instances keyed by profile ID or role."""

    def __init__(self) -> None:
        # Drivers keyed by agent profile ID (LangGraph / OpenCode / Copilot path)
        self._drivers: Dict[str, CodingAgentDriver] = {}
        # Drivers keyed by role string (reviewer / tester / knowledge / infra)
        self._role_drivers: Dict[str, CodingAgentDriver] = {}

    def initialize(self, profiles: List[Dict]) -> None:
        for profile in profiles:
            api_key = decrypt(profile.get("llm_api_key", ""))
            github_token_raw = profile.get("github_token")
            github_token = decrypt(github_token_raw) if github_token_raw else None

            mcp_servers = [McpServer(**s) for s in (profile.get("mcp_servers") or [])]
            skills = [Skill(**s) for s in (profile.get("skills") or [])]

            p = AgentProfileConfig(
                id=profile["id"],
                agent_type=profile.get("agent_type", "langgraph"),
                llm_provider=profile.get("llm_provider", "openai"),
                llm_model=profile.get("llm_model", "gpt-4o"),
                llm_api_key=api_key,
                llm_base_url=profile.get("llm_base_url"),
                github_token=github_token,
                mcp_servers=mcp_servers,
                skills=skills,
            )
            driver = self._build_driver(p)
            self._drivers[p.id] = driver

    def register_role_drivers(
        self,
        project_agents: List[Dict],
        project_ctx: Dict,
    ) -> None:
        """
        Create BaseAgentDriver-wrapped drivers for specialist roles and index them by role.
        Must be called after ``register_all_agents()``.
        """
        registry = AgentRegistry.get_instance()

        for pa in project_agents:
            role = pa.get("role", "")
            agent_type = ROLE_TO_AGENT_TYPE.get(role)
            if not agent_type:
                continue
            if not registry.has(agent_type):
                continue

            instance_id = f"{role}-{str(uuid.uuid4())[:8]}"
            agent = registry.create(agent_type, instance_id)
            driver = BaseAgentDriver(agent, project_ctx)
            self._role_drivers[role] = driver
            self._drivers[pa.get("agent_profile_id", "")] = driver

    def get_driver(self, profile_id: str) -> Optional[CodingAgentDriver]:
        return self._drivers.get(profile_id)

    def get_driver_by_role(self, role: str) -> Optional[CodingAgentDriver]:
        return self._role_drivers.get(role)

    def _build_driver(self, profile: AgentProfileConfig) -> CodingAgentDriver:
        if profile.agent_type == "opencode":
            return OpenCodeDriver(
                llm_provider=profile.llm_provider,
                llm_model=profile.llm_model,
                llm_api_key=profile.llm_api_key,
                llm_base_url=profile.llm_base_url,
                skills=profile.skills,
                mcp_servers=profile.mcp_servers,
            )

        if profile.agent_type == "github-copilot":
            return GitHubCopilotDriver(
                github_token=profile.github_token,
                llm_provider=profile.llm_provider,
                llm_api_key=profile.llm_api_key,
                llm_base_url=profile.llm_base_url,
                skills=profile.skills,
            )

        # LangGraph (default)
        llm = build_chat_model(
            provider=profile.llm_provider,
            model=profile.llm_model,
            api_key=profile.llm_api_key,
            base_url=profile.llm_base_url,
        )
        return LangGraphDriver(llm=llm, skills=profile.skills)
