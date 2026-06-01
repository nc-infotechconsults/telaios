"""ConversationAgent: keyword-based specialist routing + LLM streaming."""
from __future__ import annotations

import re
import uuid
from collections.abc import AsyncIterator

from telaios.config.settings import get_settings
from telaios.core.llm import build_llm
from telaios.core.types import LLMConfig, Message, MessageRole


_SPECIALIST_SYSTEM_PREFIXES: dict[str, str] = {
    "qa": (
        "You are TEOS Q&A specialist. You answer questions grounded strictly in the "
        "project's documents and codebase. If you don't know, say so."
    ),
    "explorer": (
        "You are TEOS Explorer specialist. You help navigate codebases: finding files, "
        "classes, functions, and patterns. Be concise and precise."
    ),
    "reverse": (
        "You are TEOS Reverse-engineer specialist. You trace code flows and produce "
        "Mermaid sequence diagrams when asked."
    ),
    "planner": (
        "You are TEOS Planner specialist. You create detailed, actionable implementation "
        "plans for software features, broken into tasks with clear dependencies."
    ),
    "coder": (
        "You are TEOS Coder specialist. You write, refactor, and fix code. "
        "Always include file paths and complete code blocks."
    ),
    "designer": (
        "You are TEOS Designer specialist. You design UIs and describe wireframes. "
        "When producing designs, output them as Tailwind-compatible HTML/CSS descriptions."
    ),
    "reviewer": (
        "You are TEOS Reviewer specialist. You review code for correctness, security, "
        "and performance. Provide actionable, numbered feedback."
    ),
}

_SPECIALIST_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'\b(design|mock|wireframe|ui|ux|interface|layout|redesign)\b'), "designer"),
    (re.compile(r'\b(plan|roadmap|rollout|migration|architect|feature|spec|phases)\b'), "planner"),
    (re.compile(r'\b(review|critique|risks?|feedback|pr |diff|audit)\b'), "reviewer"),
    (re.compile(r'\b(refactor|implement|write code|fix the bug|stub|patch)\b'), "coder"),
    (re.compile(r'\b(reverse.engineer|sequence diagram|how does|trace|map the flow)\b'), "reverse"),
    (re.compile(r'\b(find|locate|where|search|grep|navigate)\b'), "explorer"),
]


class ConversationAgent:
    @staticmethod
    def detect_specialist(text: str) -> str:
        t = " " + text.lower() + " "
        for pattern, specialist in _SPECIALIST_PATTERNS:
            if pattern.search(t):
                return specialist
        return "qa"

    async def stream(
        self,
        project_id: uuid.UUID,
        user_message: str,
        history: list[dict[str, str]],
        specialist: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream LLM response tokens for the given message."""
        if specialist is None:
            specialist = self.detect_specialist(user_message)

        settings = get_settings()
        config = LLMConfig(
            provider=settings.LLM_PROVIDER,
            model=settings.LLM_MODEL,
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
        )
        llm = build_llm(config)

        prefix = _SPECIALIST_SYSTEM_PREFIXES.get(specialist, _SPECIALIST_SYSTEM_PREFIXES["qa"])

        # For knowledge-intensive specialists, retrieve relevant context first
        kb_context = ""
        if specialist in ("qa", "explorer", "reverse", "coder"):
            try:
                from telaios.core.knowledge.factory import KnowledgePipelineFactory
                pipeline = await KnowledgePipelineFactory.get()
                result = await pipeline.query(
                    project_id=str(project_id),
                    text=user_message,
                    source="all",
                    top_k=5,
                )
                if result.chunks:
                    snippets = "\n\n".join(
                        f"[{c.metadata.get('source', 'doc')}]\n{c.content[:800]}"
                        for c in result.chunks[:5]
                    )
                    kb_context = f"\n\n<knowledge_base_context>\n{snippets}\n</knowledge_base_context>"
            except Exception:
                pass

        system_content = (
            f"{prefix}\n\n"
            f"You are operating within project {project_id}. "
            "Answer clearly and concisely."
            f"{kb_context}"
        )

        messages: list[Message] = [
            Message(role=MessageRole.SYSTEM, content=system_content)
        ]
        for entry in history[-10:]:
            role = MessageRole.HUMAN if entry["sender_type"] == "user" else MessageRole.AI
            messages.append(Message(role=role, content=entry["content"]))
        messages.append(Message(role=MessageRole.HUMAN, content=user_message))

        async for token in llm.astream(messages):
            yield token
