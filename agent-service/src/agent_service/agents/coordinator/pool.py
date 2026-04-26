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


def _normalize_prompt_mode(raw: str | None) -> str:
    """Normalize data-api 'append'/'override' to agent-service 'extend'/'override'.
    Entity default is 'append', which maps to 'extend' in agent-service terminology.
    """
    if raw == "append":
        return "extend"
    return raw or "extend"


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
    # ── Configurable agent fields ─────────────────────────────────────────────
    system_prompt: Optional[str] = None
    system_prompt_mode: str = "extend"  # "extend" (=entity "append") | "override"
    llm_temperature: Optional[float] = None
    llm_max_tokens: Optional[int] = None
    llm_top_p: Optional[float] = None
    llm_frequency_penalty: Optional[float] = None
    llm_presence_penalty: Optional[float] = None
    sub_agents: List[Dict] = field(default_factory=list)
    structured_output: Optional[Dict] = None


class AgentPool:
    """Manages a pool of ``CodingAgentDriver`` instances keyed by profile ID or role."""

    def __init__(self) -> None:
        # Drivers keyed by agent profile ID (LangGraph / OpenCode / Copilot path)
        self._drivers: Dict[str, CodingAgentDriver] = {}
        # Drivers keyed by role string (reviewer / tester / knowledge / infra)
        self._role_drivers: Dict[str, CodingAgentDriver] = {}

    def initialize(self, project_agents: List[Dict]) -> None:
        for pa in project_agents:
            api_key_raw = pa.get("llm_api_key", "")
            api_key = decrypt(api_key_raw) if api_key_raw else ""

            mcp_servers = [McpServer(**s) for s in (pa.get("mcp_servers") or [])]
            skills = [Skill(**s) for s in (pa.get("skills") or [])]

            p = AgentProfileConfig(
                id=pa["id"],
                agent_type=pa.get("agent_type", "langgraph"),
                llm_provider=pa.get("llm_provider", "openai"),
                llm_model=pa.get("llm_model", "gpt-4o"),
                llm_api_key=api_key,
                llm_base_url=pa.get("llm_base_url"),
                mcp_servers=mcp_servers,
                skills=skills,
                system_prompt=pa.get("system_prompt"),
                system_prompt_mode=_normalize_prompt_mode(pa.get("system_prompt_mode")),
                llm_temperature=pa.get("llm_temperature"),
                llm_max_tokens=pa.get("llm_max_tokens"),
                llm_top_p=pa.get("llm_top_p"),
                llm_frequency_penalty=pa.get("llm_frequency_penalty"),
                llm_presence_penalty=pa.get("llm_presence_penalty"),
                sub_agents=pa.get("sub_agents") or [],
                structured_output=pa.get("structured_output"),
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

            # Build per-agent config directly from the flat project agent dict.
            api_key_raw = pa.get("llm_api_key", "")
            api_key = decrypt(api_key_raw) if api_key_raw else ""
            mcp_servers = [McpServer(**s) for s in (pa.get("mcp_servers") or [])]
            skills = [Skill(**s) for s in (pa.get("skills") or [])]

            agent_cfg = {
                "llmProvider": pa.get("llm_provider", "openai"),
                "llmModel": pa.get("llm_model", "gpt-4o"),
                "llmApiKey": api_key,
                "llmBaseUrl": pa.get("llm_base_url"),
                "systemPrompt": pa.get("system_prompt"),
                "systemPromptMode": _normalize_prompt_mode(pa.get("system_prompt_mode")),
                "llmTemperature": pa.get("llm_temperature"),
                "llmMaxTokens": pa.get("llm_max_tokens"),
                "mcpServers": [s.model_dump() for s in mcp_servers],
                "skills": [s.model_dump() for s in skills],
                "subAgents": pa.get("sub_agents") or [],
                "structuredOutput": pa.get("structured_output"),
            }

            instance_id = f"{role}-{str(uuid.uuid4())[:8]}"
            agent = registry.create(agent_type, instance_id, agent_cfg)
            driver = BaseAgentDriver(agent, project_ctx)
            self._role_drivers[role] = driver
            self._drivers[pa.get("id", "")] = driver

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
            temperature=profile.llm_temperature,
            max_tokens=profile.llm_max_tokens,
            top_p=profile.llm_top_p,
            frequency_penalty=profile.llm_frequency_penalty,
            presence_penalty=profile.llm_presence_penalty,
        )
        return LangGraphDriver(
            llm=llm,
            skills=profile.skills,
            system_prompt=profile.system_prompt,
            system_prompt_mode=profile.system_prompt_mode,
            structured_output=profile.structured_output,
            sub_agents=profile.sub_agents,
        )

    def finalize_sub_agent_tools(self) -> None:
        """Compile sub-agent tools for all LangGraphDrivers that reference other agents.

        Must be called after both ``initialize()`` and ``register_role_drivers()``
        so that every referenced sub-agent driver is already present in self._drivers.
        """
        from agent_service.agents.coordinator.drivers.langgraph.sub_agent_tools import (
            build_sub_agent_tools,
        )

        for driver in self._drivers.values():
            if not isinstance(driver, LangGraphDriver):
                continue
            if not driver._sub_agents:
                continue
            tool_defs, handlers = build_sub_agent_tools(driver._sub_agents, self)
            driver.set_sub_agent_tools(tool_defs, handlers)
