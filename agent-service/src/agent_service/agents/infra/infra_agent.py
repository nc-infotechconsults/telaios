from __future__ import annotations

import json
from typing import List, Literal, Optional

from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel

from agent_service.core.agent_framework.base_agent import BaseAgent, AgentResult as BaseAgentResult
from agent_service.core.agent_framework.context import AgentContext
from agent_service.core.agent_framework.event_bus import get_agent_event_bus
from agent_service.core.llm import build_chat_model
from agent_service.core.tools import make_read_file_tool, make_write_file_tool
from agent_service.agents.infra.template_gen import detect_stack


class InfraAgentConfig(BaseModel):
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
    target: Literal["docker", "docker-compose", "kubernetes", "ci-github-actions", "ci-gitlab", "all"] = "all"
    port: int = 3000


_BUILTIN_SYSTEM = """\
You are an expert DevOps engineer and infrastructure architect.

Generate production-ready infrastructure-as-code files for the following:
- Technology stack: {stack}
- Target(s): {target_list}
- Application port: {port}
- Additional context: {context}

Requirements:
- Follow best practices for each target (multi-stage Dockerfile, resource limits in k8s, etc.)
- Include security best practices (non-root user in Docker, readiness probes in k8s, etc.)
- Add helpful comments explaining key configuration choices

Use the `write_file` tool to write each file to the workspace.
Use the `read_file` tool if you need to inspect existing files first.
Write all required files, then stop."""


def _compose_prompt(builtin: str, custom: Optional[str], mode: str) -> str:
    """Return the effective system prompt based on mode and user-supplied prompt."""
    if not custom:
        return builtin
    if mode == "override":
        return custom
    return f"{builtin}\n\n{custom}"


class InfraAgent(BaseAgent):
    def __init__(self, id: str, config: InfraAgentConfig) -> None:
        super().__init__(id, "infra")
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
        await bus.publish("infra.started", {"agentId": self.id, "executionId": ctx.executionId})

        all_written: list[str] = []

        for repo_name, local_path in (ctx.workspaces or {}).items():
            stack = await detect_stack(local_path)

            targets = (
                ["docker", "docker-compose", "kubernetes", "ci-github-actions"]
                if self._config.target == "all"
                else [self._config.target]
            )
            builtin_prompt = _BUILTIN_SYSTEM.format(
                stack=stack,
                target_list=", ".join(targets),
                port=self._config.port,
                context=ctx.task.description if ctx.task else "standard web application",
            )
            system_prompt = _compose_prompt(
                builtin_prompt,
                self._config.systemPrompt,
                self._config.systemPromptMode,
            )

            tools = [make_write_file_tool(local_path), make_read_file_tool(local_path)]
            graph = create_react_agent(self._llm, tools, prompt=system_prompt)

            user_msg = (
                f"Generate infrastructure files for the {stack} project in repository: {repo_name}. "
                f"Task context: {ctx.task.description if ctx.task else 'Standard web application deployment.'}"
            )

            try:
                result = await graph.ainvoke(
                    {"messages": [HumanMessage(content=user_msg)]},
                    {"recursion_limit": 50},
                )
            except Exception as err:
                await bus.publish("infra.failed", {
                    "agentId": self.id,
                    "executionId": ctx.executionId,
                    "error": str(err),
                })
                self._result = BaseAgentResult(
                    success=False,
                    output="",
                    error=f"Failed to generate infra templates: {err}",
                )
                return

            # Collect paths written via write_file ToolMessages.
            written = [
                msg.content[len("File written: "):]
                for msg in result.get("messages", [])
                if isinstance(msg, ToolMessage)
                and getattr(msg, "name", None) == "write_file"
                and isinstance(msg.content, str)
                and msg.content.startswith("File written: ")
            ]
            all_written.extend(f"{repo_name}/{f}" for f in written)

        self._result = BaseAgentResult(
            success=True,
            output=json.dumps({"filesGenerated": len(all_written), "files": all_written}),
        )

        await bus.publish("infra.generated", {
            "agentId": self.id,
            "executionId": ctx.executionId,
            "filesGenerated": len(all_written),
            "files": all_written,
        })

    async def on_cleanup(self) -> None:
        pass
