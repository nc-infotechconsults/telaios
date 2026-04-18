from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from agent_service.core.agent_framework.base_agent import BaseAgent, AgentResult as BaseAgentResult
from agent_service.core.agent_framework.context import AgentContext
from agent_service.core.agent_framework.event_bus import get_agent_event_bus
from agent_service.core.llm import build_chat_model
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool


_DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful AI assistant completing software engineering tasks. "
    "Use the tools available to you to answer questions or perform actions. "
    "When finished, summarise what you did."
)

_MAX_ROUNDS = 10


class ConfigurableAgentConfig(BaseModel):
    """Fully profile-driven agent — no hardcoded domain logic."""

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
    structuredOutput: Optional[Dict[str, Any]] = None


def _compose_prompt(builtin: str, custom: Optional[str], mode: str) -> str:
    if not custom:
        return builtin
    if mode == "override":
        return custom
    return f"{builtin}\n\n{custom}"


class ConfigurableAgent(BaseAgent):
    """
    A generic, fully configurable agent that is entirely driven by the profile
    stored in the database.  Unlike the specialist agents (reviewer, tester,
    knowledge, infra), this agent has no hardcoded domain logic — it relies on
    the user-supplied system prompt, LLM settings, skills, and MCP server
    configuration to define its behaviour.

    Registered under the type ``"custom"`` in the AgentRegistry.
    """

    def __init__(self, id: str, config: ConfigurableAgentConfig) -> None:
        super().__init__(id, "custom")
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
        await bus.publish("custom.started", {"agentId": self.id, "executionId": ctx.executionId})

        task_desc = (ctx.task.description if ctx.task else None) or ""
        task_title = (ctx.task.title if ctx.task else None) or "Custom task"

        # Build skill tools
        lc_tools = self._build_skill_tools()

        effective_system = _compose_prompt(
            _DEFAULT_SYSTEM_PROMPT, self._config.systemPrompt, self._config.systemPromptMode
        )
        system_content = f"{effective_system}\n\nTask: {task_title}\n{task_desc}"

        llm = self._llm.bind_tools(lc_tools) if lc_tools and hasattr(self._llm, "bind_tools") else self._llm

        messages: list = [SystemMessage(content=system_content), HumanMessage(content="Begin the task.")]
        tool_map = {t.name: t for t in lc_tools}
        output = ""

        for _ in range(_MAX_ROUNDS):
            response = await llm.ainvoke(messages)
            ai_msg = response
            tool_calls = getattr(ai_msg, "tool_calls", []) or []

            if not tool_calls:
                content = ai_msg.content
                output = content if isinstance(content, str) else json.dumps(content)
                messages.append(ai_msg)
                break

            messages.append(ai_msg)
            tool_results: list = []
            for tc in tool_calls:
                tool = tool_map.get(tc["name"])
                try:
                    result = str(await tool.ainvoke(tc["args"])) if tool else f"Unknown tool: {tc['name']}"
                except Exception as exc:
                    result = f"Tool error: {exc}"
                tool_results.append(ToolMessage(content=result, tool_call_id=tc["id"]))
            messages.extend(tool_results)
        else:
            # Exhausted rounds — ask for a final summary
            final = await self._llm.ainvoke(messages)
            content = final.content
            output = content if isinstance(content, str) else json.dumps(content)

        # Apply structured output formatting if configured
        output = self._format_structured_output(output)

        self._result = BaseAgentResult(
            success=True,
            output=output,
            artifacts=[{
                "type": "log",
                "title": f"Configurable Agent Output — {task_title}",
                "content": output,
                "content_type": "text/plain",
                "metadata": {},
            }],
        )

        await bus.publish("custom.complete", {"agentId": self.id, "executionId": ctx.executionId})

    async def on_cleanup(self) -> None:
        pass

    def _format_structured_output(self, raw_output: str) -> str:
        """If a structured output schema is configured, format the output accordingly."""
        schema = self._config.structuredOutput
        if not schema or not raw_output:
            return raw_output

        # Try to parse raw_output as JSON first — it might already match
        try:
            parsed = json.loads(raw_output)
            if isinstance(parsed, dict):
                return json.dumps(parsed)
        except (json.JSONDecodeError, TypeError):
            pass

        # Build a Pydantic model from the schema and use with_structured_output
        try:
            model = self._build_pydantic_model_from_schema(schema, "AgentOutput")
            structured_llm = self._llm.with_structured_output(model)
            result = structured_llm.invoke(
                f"Extract structured data from the following text. "
                f"Return ONLY a JSON object matching the schema.\n\n{raw_output}"
            )
            if hasattr(result, "model_dump"):
                return json.dumps(result.model_dump())
            return json.dumps(result) if result else raw_output
        except Exception:
            return raw_output

    @staticmethod
    def _build_pydantic_model_from_schema(schema: Dict[str, Any], model_name: str = "DynamicModel"):
        """Build a Pydantic model dynamically from a JSON Schema dict."""
        from pydantic import create_model
        from pydantic import Field as PydanticField

        properties = schema.get("properties") or {}
        required_fields = set(schema.get("required") or [])
        type_map = {"string": str, "number": float, "integer": int, "boolean": bool}

        field_defs: Dict[str, Any] = {}
        for field_name, prop in properties.items():
            type_str = prop.get("type", "string")
            if isinstance(type_str, list):
                type_str = type_str[0]
            annotation = type_map.get(type_str, str)
            default = ... if field_name in required_fields else None
            field_defs[field_name] = (
                Optional[annotation] if default is None else annotation,
                PydanticField(default, description=prop.get("description", "")),
            )

        return create_model(model_name, **field_defs) if field_defs else create_model(model_name)

    def _build_skill_tools(self) -> List[StructuredTool]:
        """Convert the profile's skills list into LangChain StructuredTools."""
        from pydantic import create_model
        from pydantic import Field as PydanticField

        tools: list[StructuredTool] = []
        for skill in self._config.skills:
            name = skill.get("name", "")
            description = skill.get("description", "")
            instructions = skill.get("instructions", "")
            input_schema = skill.get("inputSchema") or {}
            properties = input_schema.get("properties") or {}
            required_fields = set(input_schema.get("required") or [])

            # Build a pydantic model from the inputSchema properties
            field_defs: Dict[str, Any] = {}
            for field_name, prop in properties.items():
                annotation = str  # default
                type_str = prop.get("type", "string")
                if isinstance(type_str, list):
                    type_str = type_str[0]
                type_map = {"string": str, "number": float, "integer": int, "boolean": bool}
                annotation = type_map.get(type_str, str)
                default = ... if field_name in required_fields else None
                field_defs[field_name] = (Optional[annotation] if default is None else annotation, PydanticField(default, description=prop.get("description", "")))

            if field_defs:
                input_model = create_model(f"{name}_input", **field_defs)
            else:
                input_model = create_model(f"{name}_input")

            full_desc = f"{description}\n\nInstructions:\n{instructions}" if instructions else description

            # The skill doesn't implement real execution — it records that the
            # tool was called and returns a placeholder result that the LLM can
            # use to reason about what happened.
            # Capture `name` by default argument to avoid closure-over-loop bug.
            async def _skill_call(_name: str = name, **kwargs: Any) -> str:
                return f"Skill '{_name}' invoked with args: {json.dumps(kwargs)}"

            tools.append(
                StructuredTool.from_function(
                    coroutine=_skill_call,
                    name=name,
                    description=full_desc,
                    args_schema=input_model,
                )
            )
        return tools
