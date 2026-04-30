from __future__ import annotations

import asyncio
import json
from typing import List, Optional

from pydantic import BaseModel

from agent_service.core.agent_framework.base_agent import BaseAgent, AgentResult as BaseAgentResult
from agent_service.core.agent_framework.context import AgentContext
from agent_service.core.agent_framework.event_bus import get_agent_event_bus
from agent_service.core.llm import build_chat_model
from agent_service.agents.review.diff_parser import format_diff_for_llm, parse_diff
from agent_service.agents.review.tools import build_review_tools
from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.prebuilt import create_react_agent


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
    return f"{builtin}\n\n{custom}"


REVIEW_SYSTEM_PROMPT = """\
You are an expert senior software engineer performing a thorough code review.

Your review must be:
- **Objective**: Focus on correctness, security, performance, and maintainability
- **Specific**: Reference exact file names and line numbers when possible
- **Actionable**: Every comment should explain what to change and why
- **Balanced**: Acknowledge good patterns as well as problems

You have access to tools to inspect the workspace:
- Use `read_file` to examine specific source files in detail
- Use `run_shell` to run git commands (git diff, git log, git show, git status, git blame)

When you have completed your review, call `finish` with:
- `approved`: true if the implementation meets quality standards, false if changes are required
- `summary`: a concise overall assessment
- `required_changes`: list of specific changes that MUST be made before approval (empty if approved)"""


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

        # Gather initial diff context to orient the LLM upfront.
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
                pass

        raw_diff = "\n\n".join(diff_parts)

        if not raw_diff.strip():
            review = {"approved": True, "summary": "No code changes detected. Nothing to review.", "required_changes": []}
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
        task_title = ctx.task.title if ctx.task else "Code Review"

        effective_system = _compose_prompt(
            REVIEW_SYSTEM_PROMPT, self._config.systemPrompt, self._config.systemPromptMode
        )

        tools = build_review_tools(ctx.workspaces or {})
        graph = create_react_agent(self._llm, tools, prompt=effective_system)

        human_content = (
            f"Task specification: {task_title}\n{task_desc}\n\n"
            f"Please evaluate what has been implemented against the above specification.\n\n"
            f"Here is a summary of the code changes:\n\n{diff_for_llm}\n\n"
            f"Use the available tools to inspect specific files or run git commands for deeper analysis, "
            f"then call finish() with your verdict."
        )

        result = await graph.ainvoke(
            {"messages": [HumanMessage(content=human_content)]},
            {"recursion_limit": 40},
        )

        # Parse review result from the finish ToolMessage.
        review = _extract_finish_result(result.get("messages", []))

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
                    "comment_count": len(review.get("required_changes", [])),
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
                "requiredChanges": review.get("required_changes", []),
            })

    async def on_cleanup(self) -> None:
        pass


def _extract_finish_result(messages: list) -> dict:
    """
    Find the last ToolMessage from the 'finish' tool and parse its JSON.
    Falls back to a safe default if not found.
    """
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None) == "finish":
            try:
                data = json.loads(msg.content)
                if isinstance(data, dict) and "approved" in data:
                    return data
            except (json.JSONDecodeError, TypeError):
                pass

    # Fallback: the LLM may not have called finish — treat as not approved.
    return {
        "approved": False,
        "summary": "Review agent did not call finish(). Manual inspection required.",
        "required_changes": [],
    }
