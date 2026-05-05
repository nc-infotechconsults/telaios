"""
domain/planning/session.py
--------------------------
Plan session lifecycle management.

Orchestrates the planning workflow: generate plan → parse → persist → execute.
Uses ``core.factory.create_llm`` for LLM creation and ``infra.crypto.decrypt``
for API key decryption.

Usage::

    from core.types import LLMConfig
    from domain.planning.session import PlanSession

    session = PlanSession(
        thread_id="plan-123",
        llm_config=LLMConfig(provider="openai", model="gpt-4o"),
        persistence=persistence,
    )
    plan = await session.create_plan("Build a REST API")
"""

from __future__ import annotations

import logging
from typing import Any

from core.types import LLMConfig, Message, MessageRole
from domain.planning.parser import ParsedPlan, parse_plan, parse_planner_response
from domain.planning.persistence import PlanPersistence
from domain.planning.prompts import compose_greeting, compose_planning_prompt

logger = logging.getLogger(__name__)


class PlanSession:
    """
    Manages a planning session from creation to execution.

    Lifecycle:
    1. Create session with user request
    2. Generate plan using LLM
    3. Parse plan into structured format
    4. Persist plan
    5. Execute tasks via orchestrator
    """

    def __init__(
        self,
        thread_id: str,
        llm_config: LLMConfig,
        persistence: PlanPersistence,
    ):
        self.thread_id = thread_id
        self._llm_config = llm_config
        self._persistence = persistence
        self._plan: ParsedPlan | None = None
        self._phase: str = "interview"
        self._llm: Any = None

    async def _get_llm(self) -> Any:
        """Lazy-create the LLM instance."""
        if self._llm is None:
            from core.factory import create_llm

            self._llm = create_llm(self._llm_config)
        return self._llm

    async def start(self) -> str:
        """
        Start a planning session.

        Returns the greeting message.
        """
        # Load existing session state if any
        phase = await self._persistence.load_session_state(self.thread_id, "phase")
        if phase:
            self._phase = str(phase)

        # Save initial state
        await self._persistence.save_session_state(self.thread_id, "phase", self._phase)

        return compose_greeting()

    async def create_plan(
        self,
        user_request: str,
        context: dict[str, Any] | None = None,
    ) -> ParsedPlan:
        """
        Generate and persist a plan from a user request.

        Args:
            user_request: The user's planning request.
            context: Optional project context.

        Returns:
            The parsed plan.
        """
        llm = await self._get_llm()
        prompt = compose_planning_prompt(
            user_request=user_request,
            context=context,
            phase=self._phase,
        )

        response = await llm.invoke([
            Message(role=MessageRole.SYSTEM, content=prompt),
            Message(role=MessageRole.HUMAN, content=user_request),
        ])

        plan_text = response.content if hasattr(response, "content") else str(response)
        self._plan = await parse_plan(plan_text, llm)
        await self._persistence.save_plan(self.thread_id, self._plan.model_dump())
        return self._plan

    async def continue_conversation(
        self,
        user_message: str,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Continue the planning conversation with a user message.

        Returns:
            A dict with ``message``, ``ready_for_plan``, ``plan`` keys.
        """
        llm = await self._get_llm()
        prompt = compose_planning_prompt(
            user_request=user_message,
            context=context,
            phase=self._phase,
        )

        response = await llm.invoke([
            Message(role=MessageRole.SYSTEM, content=prompt),
            Message(role=MessageRole.HUMAN, content=user_message),
        ])

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
        """
        Refine the existing plan based on user feedback.

        Returns:
            The updated plan, or None if refinement fails.
        """
        if self._plan is None:
            # Load from persistence
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

        response = await llm.invoke([
            Message(role=MessageRole.SYSTEM, content=prompt),
            Message(role=MessageRole.HUMAN, content=user_feedback),
        ])

        text = response.content if hasattr(response, "content") else str(response)
        parsed = parse_planner_response(text)

        if parsed and parsed.get("plan"):
            self._plan = parse_plan_from_json(parsed["plan"])
            await self._persistence.save_plan(self.thread_id, self._plan.model_dump())
            return self._plan

        return None

    async def load_plan(self) -> ParsedPlan | None:
        """Load an existing plan from persistence."""
        data = await self._persistence.load_plan(self.thread_id)
        if data is None:
            return None
        self._plan = ParsedPlan(**data)
        return self._plan

    async def get_plan(self) -> ParsedPlan | None:
        """Get the current plan (in-memory or from persistence)."""
        if self._plan is not None:
            return self._plan
        return await self.load_plan()

    @property
    def phase(self) -> str:
        """Current session phase."""
        return self._phase

    @phase.setter
    def phase(self, value: str) -> None:
        self._phase = value


def parse_plan_from_json(plan_data: dict[str, Any]) -> ParsedPlan:
    """Convenience re-export from parser module."""
    from domain.planning.parser import parse_plan_from_json as _parse

    return _parse(plan_data)
