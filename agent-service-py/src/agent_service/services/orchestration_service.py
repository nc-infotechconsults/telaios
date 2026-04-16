from __future__ import annotations

import asyncio
import logging
from typing import Dict, Optional, Set

logger = logging.getLogger(__name__)


class OrchestrationService:
    """
    Tracks plan execution state and auto-advances plans when tasks complete
    to produce a sequence of execution steps.
    """

    _instance: Optional["OrchestrationService"] = None

    def __init__(self) -> None:
        self._plan_listeners: Dict[str, list] = {}
        self._completed_per_plan: Dict[str, Set[str]] = {}

    @classmethod
    def get_instance(cls) -> "OrchestrationService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def notify_task_complete(self, plan_id: str, task_id: str, success: bool) -> None:
        self._completed_per_plan.setdefault(plan_id, set()).add(task_id)

        for listener in list(self._plan_listeners.get(plan_id, [])):
            try:
                listener(task_id, success)
            except Exception as exc:
                logger.error("[OrchestrationService] Listener error: %s", exc)

    def on_task_complete(self, plan_id: str, listener) -> None:
        self._plan_listeners.setdefault(plan_id, []).append(listener)

    def off_task_complete(self, plan_id: str, listener) -> None:
        self._plan_listeners.setdefault(plan_id, [])
        self._plan_listeners[plan_id] = [
            l for l in self._plan_listeners[plan_id] if l is not listener
        ]

    def get_completed_tasks(self, plan_id: str) -> Set[str]:
        return frozenset(self._completed_per_plan.get(plan_id, set()))
