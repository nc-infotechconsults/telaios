from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from agent_service.core.agent_framework.base_agent import BaseAgent

AgentFactory = Callable[[str, Optional[Dict[str, Any]]], BaseAgent]


class AgentRegistry:
    """
    Singleton registry that maps agent type strings to factory functions.

    Usage::

        AgentRegistry.get_instance().register("reviewer", lambda id, cfg: ReviewAgent(id))
        agent = AgentRegistry.get_instance().create("reviewer", "uuid-1")
    """

    _instance: Optional["AgentRegistry"] = None

    def __init__(self) -> None:
        self._factories: Dict[str, AgentFactory] = {}

    @classmethod
    def get_instance(cls) -> "AgentRegistry":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def register(self, type_: str, factory: AgentFactory) -> None:
        self._factories[type_] = factory

    def create(self, type_: str, id: str, config: Optional[Dict[str, Any]] = None) -> BaseAgent:
        factory = self._factories.get(type_)
        if factory is None:
            registered = ", ".join(self._factories.keys()) or "(none)"
            raise ValueError(
                f'AgentRegistry: unknown type "{type_}". Registered types: {registered}'
            )
        return factory(id, config)

    def has(self, type_: str) -> bool:
        return type_ in self._factories

    def get_registered_types(self) -> List[str]:
        return list(self._factories.keys())
