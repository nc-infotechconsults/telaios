"""
domain/planning/session.py  (ported into modules/plans/)
--------------------------
Plan session lifecycle management.
"""

from __future__ import annotations

import logging
from typing import Any

from telaios.core.types import LLMConfig, Message, MessageRole
from telaios.modules.plans.parser import (
    ParsedPlan,
    parse_plan,
    parse_plan_from_json,
    parse_planner_response,
)
from telaios.modules.plans.persistence import PlanPersistence
from telaios.modules.plans.prompts import compose_greeting, compose_planning_prompt

logger = logging.getLogger(__name__)


class PlanSession:
    """Manages a planning session from creation to execution."""

    def __init__(
        self,
        thread_id: str,
        llm_config: LLMConfig,
        persistence: PlanPersistence,
    ) -> None:
        self.thread_id = thread_id
        self._llm_config = llm_config
        self._persistence = persistence
        self._plan: ParsedPlan | None = None
        self._phase: str = "interview"
        self._llm: Any = None

    async def _get_llm(self) -> Any:
        if self._llm is None:
            from telaios.core.factory import create_llm

            self._llm = create_llm(self._llm_config)
        return self._llm

    async def start(self) -> str:
        phase = await self._persistence.load_session_state(self.thread_id, "phase")
        if phase:
            self._phase = str(phase)
        await self._persistence.save_session_state(self.thread_id, "phase", self._phase)
        return compose_greeting()

    async def create_plan(
        self,
        user_request: str,
        context: dict[str, Any] | None = None,
    ) -> ParsedPlan:
        llm = await self._get_llm()
        prompt = compose_planning_prompt(
            user_request=user_request,
            context=context,
            phase=self._phase,
        )
        response = await llm.invoke(
            [
                Message(role=MessageRole.SYSTEM, content=prompt),
                Message(role=MessageRole.HUMAN, content=user_request),
            ]
        )
        plan_text = response.content if hasattr(response, "content") else str(response)
        self._plan = await parse_plan(plan_text, llm)
        await self._persistence.save_plan(self.thread_id, self._plan.model_dump())
        return self._plan

    async def continue_conversation(
        self,
        user_message: str,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        llm = await self._get_llm()
        prompt = compose_planning_prompt(
            user_request=user_message,
            context=context,
            phase=self._phase,
        )
        response = await llm.invoke(
            [
                Message(role=MessageRole.SYSTEM, content=prompt),
                Message(role=MessageRole.HUMAN, content=user_message),
            ]
        )
        text = response.content if hasattr(response, "content") else str(response)
        parsed = parse_planner_response(text)

        if parsed and parsed.get("ready_for_plan") and parsed.get("plan"):
            self._plan = parse_plan_from_json(parsed["plan"])
            await self._persistence.save_plan(self.thread_id, self._plan.model_dump())
            self._phase = "review"
            await self._persistence.save_session_state(self.thread_id, "phase", self._phase)

        return parsed or {"message": text, "ready_for_plan": False, "plan": None}

    async def refine_plan(
        self,
        user_feedback: str,
        context: dict[str, Any] | None = None,
    ) -> ParsedPlan | None:
        if self._plan is None:
            await self.load_plan()
        if self._plan is None:
            return None

        llm = await self._get_llm()
        prompt = compose_planning_prompt(
            user_request=user_feedback,
            context=context,
            phase="review",
            plan_draft=self._plan.model_dump(),
        )
        response = await llm.invoke(
            [
                Message(role=MessageRole.SYSTEM, content=prompt),
                Message(role=MessageRole.HUMAN, content=user_feedback),
            ]
        )
        text = response.content if hasattr(response, "content") else str(response)
        parsed = parse_planner_response(text)

        if parsed and parsed.get("plan"):
            self._plan = parse_plan_from_json(parsed["plan"])
            await self._persistence.save_plan(self.thread_id, self._plan.model_dump())
            return self._plan

        return None

    async def load_plan(self) -> ParsedPlan | None:
        data = await self._persistence.load_plan(self.thread_id)
        if data is None:
            return None
        self._plan = ParsedPlan(**data)
        return self._plan

    async def get_plan(self) -> ParsedPlan | None:
        if self._plan is not None:
            return self._plan
        return await self.load_plan()

    @property
    def phase(self) -> str:
        return self._phase

    @phase.setter
    def phase(self, value: str) -> None:
        self._phase = value
