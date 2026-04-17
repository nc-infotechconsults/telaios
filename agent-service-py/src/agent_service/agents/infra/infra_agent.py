from __future__ import annotations

import json
import re
from typing import List, Literal, Optional

from pydantic import BaseModel

from agent_service.core.agent_framework.base_agent import BaseAgent, AgentResult as BaseAgentResult
from agent_service.core.agent_framework.context import AgentContext
from agent_service.core.agent_framework.event_bus import get_agent_event_bus
from agent_service.core.llm import build_chat_model
from agent_service.agents.infra.template_gen import (
    InfraTemplate,
    InfraTemplateRequest,
    build_infra_prompt,
    detect_stack,
    write_templates,
)
from langchain_core.messages import HumanMessage, SystemMessage


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

            req = InfraTemplateRequest(
                stack=stack,
                target=self._config.target,
                port=self._config.port,
                context=ctx.task.description if ctx.task else None,
            )
            prompt = build_infra_prompt(req)

            templates: list[InfraTemplate] = []
            try:
                response = await self._llm.ainvoke([
                    SystemMessage(content=_compose_prompt(prompt, self._config.systemPrompt, self._config.systemPromptMode)),
                    HumanMessage(
                        content=(
                            f"Generate infrastructure files for the {stack} project in repository: {repo_name}. "
                            f"Task context: {ctx.task.description if ctx.task else 'Standard web application deployment.'}"
                        )
                    ),
                ])
                content = response.content if isinstance(response.content, str) else json.dumps(response.content)
                json_match = re.search(r"\[[\s\S]*\]", content)
                raw_templates = json.loads(json_match.group(0) if json_match else content)
                templates = [
                    InfraTemplate(
                        path=t["path"],
                        content=t["content"],
                        description=t.get("description"),
                    )
                    for t in raw_templates
                ]
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

            written = await write_templates(local_path, templates)
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
