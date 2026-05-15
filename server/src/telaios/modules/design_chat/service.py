"""Service layer for conversational UI design sessions.

Delegates artifact generation to a Designer Agent Profile (LibraryAgent)
when one is configured for the session. Falls back to system LLM settings
and a built-in system prompt when no designer agent is assigned.
"""

from __future__ import annotations

import html
import json
import logging
import uuid
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.config.settings import get_settings
from telaios.core.factory import create_llm
from telaios.core.types import LLMConfig, Message, MessageRole
from telaios.infra import sse as sse_manager
from telaios.modules.design_chat.repository import (
    DesignArtifactRepository,
    DesignMessageRepository,
    DesignSessionRepository,
)
from telaios.modules.design_chat.schemas import (
    DesignArtifactRead,
    DesignMessageRead,
    DesignSessionCreate,
    DesignSessionPatch,
    DesignSessionRead,
)
from telaios.modules.library import LibraryAgentService
from telaios.utils.errors import NotFoundError

logger = logging.getLogger(__name__)

# ID of the system Designer agent seeded by Alembic migration.
_DEFAULT_DESIGNER_AGENT_ID: uuid.UUID = uuid.UUID("11111111-1111-1111-1111-111111111111")

# Fallback system prompt used when no designer agent is assigned.
_FALLBACK_SYSTEM_PROMPT = (
    "You are a UI design assistant. Return JSON only with keys "
    "assistant_message, title, description, html, css, js, rationale. "
    "Do not use markdown fences."
)


class _DesignArtifactLLMResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    assistant_message: str | None = Field(
        default=None,
        validation_alias=AliasChoices("assistant_message", "assistant", "message"),
    )
    title: str = Field(min_length=1, max_length=160)
    description: str | None = None
    html_content: str = Field(
        min_length=1,
        validation_alias=AliasChoices("html", "html_content"),
    )
    css_content: str | None = Field(
        default=None,
        validation_alias=AliasChoices("css", "css_content"),
    )
    js_content: str | None = Field(
        default=None,
        validation_alias=AliasChoices("js", "js_content"),
    )
    rationale: str | None = None


def _build_generation_prompt(prompt: str, revision: int) -> str:
    return (
        f"Create revision {revision} for this request: {prompt}\n\n"
        "Return a complete UI revision as JSON only.\n"
        "- html: semantic body markup only (no html/head/body tags)\n"
        "- css: optional plain CSS string\n"
        "- js: optional plain JavaScript string\n"
        "- assistant_message: brief explanation to the user (max 80 words)\n"
        "- rationale: short design reasoning\n"
        "Prioritize responsive layout and accessible, readable content."
    )


def _none_if_blank(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _extract_json_object(raw: str) -> dict[str, Any] | None:
    candidate = raw.strip()
    if not candidate:
        return None

    if candidate.startswith("```"):
        lines = candidate.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        candidate = "\n".join(lines).strip()

    parsed: Any
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            parsed = json.loads(candidate[start : end + 1])
        except json.JSONDecodeError:
            return None

    if not isinstance(parsed, dict):
        return None
    return parsed


def _artifact_from_llm_response(
    parsed: _DesignArtifactLLMResponse,
    *,
    revision: int,
    source_mode: str,
) -> tuple[str, dict[str, Any]]:
    title = parsed.title.strip() or f"Design Revision {revision}"
    html_content = parsed.html_content.strip()
    if not html_content:
        raise ValueError("Empty html_content")

    assistant_text = (
        _none_if_blank(parsed.assistant_message)
        or _none_if_blank(parsed.rationale)
        or f"I generated design revision {revision}. Review the preview and request updates."
    )

    return assistant_text, {
        "title": title,
        "description": _none_if_blank(parsed.description),
        "html_content": html_content,
        "css_content": _none_if_blank(parsed.css_content),
        "js_content": _none_if_blank(parsed.js_content),
        "rationale": _none_if_blank(parsed.rationale),
        "metadata": {"source": "llm", "mode": source_mode},
    }


def _try_parse_json_artifact(
    raw: str,
    *,
    revision: int,
) -> tuple[str, dict[str, Any]] | None:
    payload = _extract_json_object(raw)
    if payload is None:
        return None
    try:
        parsed = _DesignArtifactLLMResponse.model_validate(payload)
    except ValidationError:
        return None
    try:
        return _artifact_from_llm_response(parsed, revision=revision, source_mode="json")
    except ValueError:
        return None


def _normalize_llm_content(raw: Any) -> str:
    if isinstance(raw, str):
        return raw
    if raw is None:
        return ""
    if isinstance(raw, list):
        parts: list[str] = []
        for item in raw:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") if "text" in item else item.get("content")
                if isinstance(text, str):
                    parts.append(text)
        if parts:
            return "\n".join(parts)
    return str(raw)


def _fallback_assistant_text(prompt: str) -> str:
    return (
        "I drafted a UI revision from your request. "
        "Review the preview and ask for changes to layout, spacing, colors, or content hierarchy. "
        f"Captured request: {prompt}"
    )


def _fallback_artifact(
    *,
    prompt: str,
    revision: int,
    reason: str | None = None,
) -> dict[str, Any]:
    safe_prompt = html.escape(prompt)
    metadata: dict[str, Any] = {"source": "fallback"}
    if reason is not None:
        metadata["reason"] = reason
    return {
        "title": f"Design Revision {revision}",
        "description": "Auto-generated UI draft from conversation prompt.",
        "html_content": (
            '<main class="canvas">'
            '<section class="hero">'
            '<p class="eyebrow">Generated concept</p>'
            "<h1>Build faster with an AI design copilot</h1>"
            f'<p class="lead">{safe_prompt}</p>'
            '<div class="actions"><button>Get started</button><button class="ghost">View docs</button></div>'
            "</section>"
            '<section class="cards">'
            "<article><h3>Fast iteration</h3><p>Refine by chat in minutes.</p></article>"
            "<article><h3>Reusable patterns</h3><p>Capture revisions as artifacts.</p></article>"
            "<article><h3>Safe preview</h3><p>Render in isolated sandbox.</p></article>"
            "</section>"
            "</main>"
        ),
        "css_content": (
            ":root{color-scheme:light;}"
            "*{box-sizing:border-box;}"
            "body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f7f8;color:#111827;}"
            ".canvas{max-width:960px;margin:0 auto;padding:40px 24px 56px;display:grid;gap:28px;}"
            ".hero{background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;display:grid;gap:12px;}"
            ".eyebrow{margin:0;color:#4f46e5;font-weight:600;font-size:12px;letter-spacing:.06em;text-transform:uppercase;}"
            "h1{margin:0;font-size:clamp(1.6rem,3vw,2.4rem);line-height:1.1;}"
            ".lead{margin:0;color:#374151;line-height:1.6;}"
            ".actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;}"
            "button{border:0;border-radius:10px;padding:10px 16px;background:#111827;color:#fff;font-weight:600;cursor:pointer;}"
            "button.ghost{background:#eef2ff;color:#312e81;}"
            ".cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));}"
            "article{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px;}"
            "article h3{margin:0 0 6px;}article p{margin:0;color:#4b5563;line-height:1.5;}"
            "@media (max-width:640px){.canvas{padding:24px 14px 32px;}.hero{padding:20px;}}"
        ),
        "js_content": None,
        "rationale": "Structured as a marketing-style hero with three supporting value cards for quick iteration.",
        "metadata": metadata,
    }


def _build_llm_config_from_settings(settings: Any) -> LLMConfig:
    """Build LLMConfig from application settings."""
    return LLMConfig(
        provider=settings.LLM_PROVIDER,
        model=settings.LLM_MODEL,
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
    )


def _build_llm_config_from_agent(
    agent_profile: Any,
    settings: Any,
) -> LLMConfig:
    """Build LLMConfig from agent profile, falling back to system settings."""
    provider = getattr(agent_profile, "llm_provider", None) or settings.LLM_PROVIDER
    model = getattr(agent_profile, "llm_model", None) or settings.LLM_MODEL
    temperature = getattr(agent_profile, "llm_temperature", None)
    max_tokens = getattr(agent_profile, "llm_max_tokens", None)

    raw_key = getattr(agent_profile, "llm_api_key", None)
    api_key = ""
    if raw_key:
        from telaios.utils.crypto import decrypt

        decrypted = decrypt(raw_key)
        api_key = decrypted or ""

    return LLMConfig(
        provider=provider,
        model=model,
        api_key=api_key or settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
        temperature=temperature,
        max_tokens=max_tokens,
    )


async def _generate_assistant_and_artifact(
    *,
    prompt: str,
    revision: int,
    designer_agent: Any | None = None,
) -> tuple[str, dict[str, Any]]:
    settings = get_settings()
    cloud_provider_without_endpoint = (
        settings.LLM_PROVIDER in {"openai", "anthropic", "azure_openai"}
        and not settings.LLM_API_KEY
        and not settings.LLM_BASE_URL
    )
    if cloud_provider_without_endpoint:
        return _fallback_assistant_text(prompt), _fallback_artifact(
            prompt=prompt,
            revision=revision,
            reason="llm_not_configured",
        )

    system_prompt = _FALLBACK_SYSTEM_PROMPT
    if designer_agent is not None:
        agent_prompt = getattr(designer_agent, "system_prompt", None)
        if agent_prompt:
            system_prompt = agent_prompt

    llm_config = (
        _build_llm_config_from_agent(designer_agent, settings)
        if designer_agent is not None
        else _build_llm_config_from_settings(settings)
    )

    try:
        llm = create_llm(llm_config)
        messages = [
            Message(role=MessageRole.SYSTEM, content=system_prompt),
            Message(role=MessageRole.HUMAN, content=_build_generation_prompt(prompt, revision)),
        ]

        try:
            structured = await llm.invoke_structured(messages, _DesignArtifactLLMResponse)
            parsed_structured = _DesignArtifactLLMResponse.model_validate(structured)
            return _artifact_from_llm_response(
                parsed_structured,
                revision=revision,
                source_mode="structured",
            )
        except Exception as exc:
            logger.info("structured design generation unavailable, trying json parse: %s", exc)

        response = await llm.invoke(messages)
        raw_content = _normalize_llm_content(getattr(response, "content", response)).strip()

        parsed_json = _try_parse_json_artifact(raw_content, revision=revision)
        if parsed_json is not None:
            return parsed_json

        if raw_content:
            return raw_content, _fallback_artifact(
                prompt=prompt,
                revision=revision,
                reason="unstructured_llm_response",
            )

        return _fallback_assistant_text(prompt), _fallback_artifact(
            prompt=prompt,
            revision=revision,
            reason="empty_llm_response",
        )
    except Exception as exc:
        logger.warning("design llm invocation failed, using fallback: %s", exc)
        return _fallback_assistant_text(prompt), _fallback_artifact(
            prompt=prompt,
            revision=revision,
            reason="llm_error",
        )


class DesignChatService:
    def __init__(self, session: AsyncSession) -> None:
        self._session_repo = DesignSessionRepository(session)
        self._message_repo = DesignMessageRepository(session)
        self._artifact_repo = DesignArtifactRepository(session)
        self._session = session

    async def _resolve_designer_agent(
        self,
        session_row: Any,
    ) -> Any | None:
        """Return the LibraryAgent ORM instance for the session's designer."""
        agent_id: uuid.UUID | None = getattr(session_row, "designer_agent_id", None)
        if agent_id is None:
            # Fall back to the global default designer agent.
            agent_id = _DEFAULT_DESIGNER_AGENT_ID
        try:
            from sqlalchemy import select

            from telaios.db.models.library import LibraryAgent

            result = await self._session.execute(
                select(LibraryAgent).where(
                    LibraryAgent.id == agent_id,
                    LibraryAgent.deleted_at.is_(None),
                )
            )
            return result.scalar_one_or_none()
        except Exception as exc:
            logger.warning("failed to resolve designer agent %s: %s", agent_id, exc)
            return None

    async def list_sessions(self, project_id: uuid.UUID) -> list[DesignSessionRead]:
        sessions = await self._session_repo.list_by_project(project_id)
        return [DesignSessionRead.model_validate(s) for s in sessions]

    async def create_session(
        self,
        project_id: uuid.UUID,
        dto: DesignSessionCreate,
    ) -> DesignSessionRead:
        designer_agent_id = dto.designer_agent_id
        if designer_agent_id is None:
            # Verify the default designer agent exists before assigning it.
            svc = LibraryAgentService(self._session)
            try:
                await svc.get(_DEFAULT_DESIGNER_AGENT_ID)
                designer_agent_id = _DEFAULT_DESIGNER_AGENT_ID
            except NotFoundError:
                logger.warning("default designer agent not found; session will have no designer")
                designer_agent_id = None
        created = await self._session_repo.create(
            project_id=project_id,
            title=dto.title,
            designer_agent_id=designer_agent_id,
        )
        return DesignSessionRead.model_validate(created)

    async def get_session(self, session_id: uuid.UUID) -> DesignSessionRead:
        session = await self._session_repo.find(session_id)
        if session is None:
            raise NotFoundError("Design session not found")
        return DesignSessionRead.model_validate(session)

    async def patch_session(
        self,
        session_id: uuid.UUID,
        dto: DesignSessionPatch,
    ) -> DesignSessionRead:
        session = await self._session_repo.find(session_id)
        if session is None:
            raise NotFoundError("Design session not found")
        if dto.designer_agent_id is not None:
            session.designer_agent_id = dto.designer_agent_id
        elif (
            dto.designer_agent_id is None
            and dto.model_dump(exclude_unset=True).get("designer_agent_id") is not None
        ):
            # Explicitly unsetting designer_agent_id
            session.designer_agent_id = None
        await self._session_repo.save(session)
        return DesignSessionRead.model_validate(session)

    async def get_session_project_id(self, session_id: uuid.UUID) -> uuid.UUID:
        session = await self._session_repo.find(session_id)
        if session is None:
            raise NotFoundError("Design session not found")
        return session.project_id

    async def list_messages(self, session_id: uuid.UUID) -> list[DesignMessageRead]:
        rows = await self._message_repo.list_by_session(session_id)
        return [DesignMessageRead.model_validate(r) for r in rows]

    async def list_artifacts(self, session_id: uuid.UUID) -> list[DesignArtifactRead]:
        rows = await self._artifact_repo.list_by_session(session_id)
        return [DesignArtifactRead.model_validate(r) for r in rows]

    async def send_message(self, session_id: uuid.UUID, content: str) -> DesignMessageRead:
        session = await self._session_repo.find(session_id)
        if session is None:
            raise NotFoundError("Design session not found")

        user_msg = await self._message_repo.create(
            session_id=session_id, role="user", content=content
        )
        sse_manager.broadcast(
            str(session_id),
            {
                "type": "design_message",
                "data": DesignMessageRead.model_validate(user_msg).model_dump(mode="json"),
            },
        )
        sse_manager.broadcast(str(session_id), {"type": "design_chat_thinking"})

        designer_agent = await self._resolve_designer_agent(session)
        revision = await self._artifact_repo.next_revision(session_id)
        assistant_text, artifact_payload = await _generate_assistant_and_artifact(
            prompt=content,
            revision=revision,
            designer_agent=designer_agent,
        )

        for token in assistant_text.split():
            sse_manager.broadcast(
                str(session_id), {"type": "design_chat_token", "content": f"{token} "}
            )

        assistant_msg = await self._message_repo.create(
            session_id=session_id,
            role="assistant",
            content=assistant_text,
        )
        sse_manager.broadcast(
            str(session_id),
            {
                "type": "design_message",
                "data": DesignMessageRead.model_validate(assistant_msg).model_dump(mode="json"),
            },
        )

        artifact = await self._artifact_repo.create(
            session_id=session_id,
            revision=revision,
            title=str(artifact_payload["title"]),
            description=artifact_payload.get("description"),
            html_content=str(artifact_payload["html_content"]),
            css_content=artifact_payload.get("css_content"),
            js_content=artifact_payload.get("js_content"),
            prompt=content,
            rationale=artifact_payload.get("rationale"),
            artifact_metadata=artifact_payload.get("metadata"),
        )
        sse_manager.broadcast(
            str(session_id),
            {
                "type": "design_artifact",
                "artifact": DesignArtifactRead.model_validate(artifact).model_dump(mode="json"),
            },
        )
        sse_manager.broadcast(str(session_id), {"type": "design_chat_end"})

        return DesignMessageRead.model_validate(user_msg)


__all__ = ["DesignChatService"]
