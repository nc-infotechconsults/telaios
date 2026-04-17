from __future__ import annotations

import asyncio
import json
import re
from typing import List, Optional

from pydantic import BaseModel

from agent_service.core.agent_framework.base_agent import BaseAgent, AgentResult as BaseAgentResult
from agent_service.core.agent_framework.context import AgentContext
from agent_service.core.agent_framework.event_bus import get_agent_event_bus
from agent_service.core.llm import build_chat_model
from agent_service.agents.review.diff_parser import format_diff_for_llm, parse_diff
from langchain_core.messages import HumanMessage, SystemMessage


class ReviewAgentConfig(BaseModel):
    llmProvider: str = "openai"
    llmModel: str = "gpt-4o"
    llmApiKey: str = ""
    llmBaseUrl: Optional[str] = None
    llmTemperature: Optional[float] = None
    llmMaxTokens: Optional[int] = None
    llmTopP: Optional[float] = None
    llmFrequencyPenalty: Optional[float] = None
    llmPresencePenalty: Optional[float] = None
    systemPrompt: Optional[str] = None
    systemPromptMode: str = "override"  # "override" | "extend"
    mcpServers: List[dict] = []
    skills: List[dict] = []
    subAgentIds: List[str] = []


def _compose_prompt(builtin: str, custom: Optional[str], mode: str) -> str:
    """Return the effective system prompt based on mode and user-supplied prompt."""
    if not custom:
        return builtin
    if mode == "override":
        return custom
    # "extend": append user prompt after the built-in one
    return f"{builtin}\n\n{custom}"


REVIEW_SYSTEM_PROMPT = """\
You are an expert senior software engineer performing a thorough code review.

Your review must be:
- **Objective**: Focus on correctness, security, performance, and maintainability
- **Specific**: Reference exact file names and line numbers when possible
- **Actionable**: Every comment should explain what to change and why
- **Balanced**: Acknowledge good patterns as well as problems

Respond with a JSON object matching this schema:
{
  "approved": boolean,
  "summary": "string",
  "comments": [
    {
      "file": "path/to/file",
      "line": 42,
      "severity": "error|warning|suggestion|praise",
      "message": "string"
    }
  ]
}

Respond with ONLY valid JSON. No markdown fences."""


class ReviewAgent(BaseAgent):
    def __init__(self, id: str, config: ReviewAgentConfig) -> None:
        super().__init__(id, "reviewer")
        self._config = config
        self._llm = None

    async def on_init(self, ctx: AgentContext) -> None:
        self._llm = build_chat_model(
            provider=self._config.llmProvider,
            model=self._config.llmModel,
            api_key=self._config.llmApiKey,
            base_url=self._config.llmBaseUrl,
            temperature=self._config.llmTemperature,
            max_tokens=self._config.llmMaxTokens,
            top_p=self._config.llmTopP,
            frequency_penalty=self._config.llmFrequencyPenalty,
            presence_penalty=self._config.llmPresencePenalty,
        )

    async def on_execute(self, ctx: AgentContext) -> None:
        bus = get_agent_event_bus()
        await bus.publish("review.started", {"agentId": self.id, "executionId": ctx.executionId})

        diff_parts: list[str] = []
        for repo_name, local_path in (ctx.workspaces or {}).items():
            try:
                proc = await asyncio.create_subprocess_shell(
                    "git diff HEAD~1 HEAD 2>/dev/null || git diff HEAD",
                    cwd=local_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                stdout, _ = await proc.communicate()
                text = stdout.decode(errors="replace").strip()
                if text:
                    diff_parts.append(f"## Repository: {repo_name}\n{text}")
            except Exception:
                try:
                    proc2 = await asyncio.create_subprocess_shell(
                        "git diff",
                        cwd=local_path,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    stdout2, _ = await proc2.communicate()
                    text2 = stdout2.decode(errors="replace").strip()
                    if text2:
                        diff_parts.append(f"## Repository: {repo_name}\n{text2}")
                except Exception:
                    pass

        raw_diff = "\n\n".join(diff_parts)

        if not raw_diff.strip():
            review = {"approved": True, "summary": "No code changes detected. Nothing to review.", "comments": []}
            self._result = BaseAgentResult(
                success=True,
                output=json.dumps(review),
                artifacts=[{
                    "type": "review",
                    "title": "Code Review — No Changes",
                    "content": json.dumps(review),
                    "content_type": "application/json",
                    "metadata": {"approved": True, "comment_count": 0, "summary": review["summary"]},
                }],
            )
            return

        parsed_diff = parse_diff(raw_diff)
        diff_for_llm = format_diff_for_llm(parsed_diff)
        task_desc = ctx.task.description if ctx.task else "Review the following code changes."

        response = await self._llm.ainvoke([
            SystemMessage(content=_compose_prompt(REVIEW_SYSTEM_PROMPT, self._config.systemPrompt, self._config.systemPromptMode)),
            HumanMessage(content=f"Task context: {task_desc}\n\nCode changes to review:\n\n{diff_for_llm}"),
        ])
        content = response.content if isinstance(response.content, str) else json.dumps(response.content)

        try:
            json_match = re.search(r"\{[\s\S]*\}", content)
            review = json.loads(json_match.group(0) if json_match else content)
        except Exception:
            review = {
                "approved": False,
                "summary": "Review parsing failed. Raw LLM output below.",
                "comments": [{"file": "unknown", "severity": "warning", "message": content}],
            }

        self._result = BaseAgentResult(
            success=True,
            output=json.dumps(review),
            artifacts=[{
                "type": "review",
                "title": "Code Review — Approved" if review.get("approved") else "Code Review — Changes Requested",
                "content": json.dumps(review),
                "content_type": "application/json",
                "metadata": {
                    "approved": review.get("approved", False),
                    "comment_count": len(review.get("comments", [])),
                    "summary": review.get("summary", ""),
                },
            }],
        )

        await bus.publish("review.complete", {
            "agentId": self.id,
            "executionId": ctx.executionId,
            "approved": review.get("approved", False),
            "summary": review.get("summary", ""),
        })
        if review.get("approved"):
            await bus.publish("review.approved", {"agentId": self.id, "executionId": ctx.executionId})
        else:
            await bus.publish("review.changes_requested", {
                "agentId": self.id,
                "executionId": ctx.executionId,
                "commentCount": len(review.get("comments", [])),
            })

    async def on_cleanup(self) -> None:
        pass
