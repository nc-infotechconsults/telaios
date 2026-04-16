from __future__ import annotations

from agent_service.core.agent_framework.registry import AgentRegistry
from agent_service.agents.review.review_agent import ReviewAgent, ReviewAgentConfig
from agent_service.agents.testing.testing_agent import TestingAgent, TestingAgentConfig
from agent_service.agents.knowledge.knowledge_agent import KnowledgeAgent, KnowledgeAgentConfig
from agent_service.agents.infra.infra_agent import InfraAgent, InfraAgentConfig

# Map from role string (from data-api) to registry type string.
ROLE_TO_AGENT_TYPE: dict[str, str] = {
    "reviewer": "reviewer",
    "tester": "tester",
    "knowledge": "knowledge",
    "infra": "infra",
    # "planner" and "coder" are handled by CodingAgentDriver (LangGraph / OpenCode / Copilot)
}


def register_all_agents() -> None:
    """
    Register all concrete agent types with the AgentRegistry singleton.

    This is idempotent — safe to call multiple times.
    Must be called before any agents are instantiated.
    """
    registry = AgentRegistry.get_instance()

    registry.register(
        "reviewer",
        lambda id, cfg: ReviewAgent(id, ReviewAgentConfig(**(cfg or {}))),
    )
    registry.register(
        "tester",
        lambda id, cfg: TestingAgent(id, TestingAgentConfig(**(cfg or {}))),
    )
    registry.register(
        "knowledge",
        lambda id, cfg: KnowledgeAgent(id, KnowledgeAgentConfig(**(cfg or {}))),
    )
    registry.register(
        "infra",
        lambda id, cfg: InfraAgent(id, InfraAgentConfig(**(cfg or {}))),
    )
