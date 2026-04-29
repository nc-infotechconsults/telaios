from __future__ import annotations

import json
import os
from typing import List, Literal, Optional

from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel

from agent_service.core.agent_framework.base_agent import BaseAgent, AgentResult as BaseAgentResult
from agent_service.core.agent_framework.context import AgentContext
from agent_service.core.agent_framework.event_bus import get_agent_event_bus
from agent_service.core.llm import build_chat_model
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


def _build_workspace_tools(workspace_path: str) -> List[StructuredTool]:
    """Build write_file and read_file tools scoped to workspace_path."""
    safe_root = os.path.realpath(workspace_path)

    class WriteFileInput(BaseModel):
        path: str
        content: str

    class ReadFileInput(BaseModel):
        path: str

    async def write_file(path: str, content: str) -> str:
        requested = os.path.realpath(os.path.join(safe_root, path))
        if not requested.startswith(safe_root + os.sep):
            return "Error: path is outside the workspace."
        os.makedirs(os.path.dirname(requested), exist_ok=True)
        with open(requested, "w", encoding="utf-8") as fh:
            fh.write(content)
        return f"Written: {path}"

    async def read_file(path: str) -> str:
        requested = os.path.realpath(os.path.join(safe_root, path))
        if not requested.startswith(safe_root + os.sep):
            return "Error: path is outside the workspace."
        with open(requested, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()

    return [
        StructuredTool.from_function(
            coroutine=write_file,
            name="write_file",
            description="Write (or overwrite) a file in the workspace.",
            args_schema=WriteFileInput,
        ),
        StructuredTool.from_function(
            coroutine=read_file,
            name="read_file",
            description="Read the contents of a workspace file.",
            args_schema=ReadFileInput,
        ),
    ]


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

            tools = _build_workspace_tools(local_path)
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
                msg.content[len("Written: "):]
                for msg in result.get("messages", [])
                if isinstance(msg, ToolMessage)
                and getattr(msg, "name", None) == "write_file"
                and isinstance(msg.content, str)
                and msg.content.startswith("Written: ")
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
