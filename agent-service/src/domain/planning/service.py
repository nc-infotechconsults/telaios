from __future__ import annotations

import asyncio
import logging
from typing import Any

from core.checkpoint import Checkpointer
from core.types import LLMConfig
from domain.planning.persistence import PlanPersistence
from domain.planning.session import PlanSession
from infra.settings import config

logger = logging.getLogger(__name__)

_checkpointer: Checkpointer | None = None
_sessions: dict[str, PlanSession] = {}


def set_checkpointer(checkpointer: Checkpointer) -> None:
    global _checkpointer
    _checkpointer = checkpointer
    logger.info("Planning service: checkpointer set.")


def _default_llm_config() -> LLMConfig:
    return LLMConfig(
        provider=config.LLM_PROVIDER,
        model=config.LLM_MODEL,
        api_key=config.LLM_API_KEY,
        base_url=config.LLM_BASE_URL,
    )


def _get_session(plan_id: str) -> PlanSession | None:
    if _checkpointer is None:
        logger.warning("Planning service not ready for plan %s", plan_id)
        return None
    session = _sessions.get(plan_id)
    if session is None:
        session = PlanSession(
            thread_id=plan_id,
            llm_config=_default_llm_config(),
            persistence=PlanPersistence(_checkpointer),
        )
        _sessions[plan_id] = session
    return session


async def init_session(plan_id: str) -> None:
    session = _get_session(plan_id)
    if session is None:
        _sessions.setdefault(plan_id, None)  # type: ignore[arg-type]
        return
    await session.start()


async def handle_user_message(plan_id: str, content: str) -> None:
    session = _get_session(plan_id)
    if session is None:
        return
    try:
        await session.continue_conversation(content)
    except Exception as exc:
        logger.exception("Planning message handling failed for plan %s: %s", plan_id, exc)


async def start_execution(project_id: str, plan_id: str) -> None:
    logger.info("Starting execution for plan %s (project %s)", plan_id, project_id)
    if _checkpointer is not None:
        state = await _checkpointer.get(plan_id) or {}
        state.update({"project_id": project_id, "execution_status": "started"})
        await _checkpointer.put(plan_id, state)
    await asyncio.sleep(0)
