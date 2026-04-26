from __future__ import annotations

from typing import Any, Dict, Optional

from agent_service.core.llm import build_chat_model


def _build_llm(settings: Dict[str, Any], planner_agent: Optional[Dict[str, Any]]) -> Any:
    if planner_agent and planner_agent.get("llm_provider"):
        from agent_service.crypto import decrypt as _decrypt

        raw_key = planner_agent.get("llm_api_key", "")
        api_key = _decrypt(raw_key) if raw_key else (settings.get("llm_api_key_raw") or "")
        return build_chat_model(
            provider=planner_agent["llm_provider"],
            model=planner_agent.get("llm_model") or settings["llm_model"],
            api_key=api_key,
            base_url=planner_agent.get("llm_base_url") or settings.get("llm_base_url"),
            temperature=planner_agent.get("llm_temperature"),
            max_tokens=planner_agent.get("llm_max_tokens"),
            top_p=planner_agent.get("llm_top_p"),
            frequency_penalty=planner_agent.get("llm_frequency_penalty"),
            presence_penalty=planner_agent.get("llm_presence_penalty"),
        )
    return build_chat_model(
        provider=settings["llm_provider"],
        model=settings["llm_model"],
        api_key=settings.get("llm_api_key_raw") or "",
        base_url=settings.get("llm_base_url"),
    )
