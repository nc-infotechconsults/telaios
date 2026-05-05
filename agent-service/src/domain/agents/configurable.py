from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, create_model

from core.types import ToolInputSchema, ToolParameter
from tools.types import ExecutableTool

_DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful AI assistant completing software engineering tasks. "
    "Use the tools available to you to answer questions or perform actions. "
    "When finished, summarise what you did."
)


class ConfigurableAgentConfig(BaseModel):
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
    systemPromptMode: str = "override"
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


def build_pydantic_model_from_schema(schema: Dict[str, Any], model_name: str = "DynamicModel"):
    type_map = {
        "string": str,
        "number": float,
        "integer": int,
        "boolean": bool,
        "array": list,
        "object": dict,
    }
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    required = set(schema.get("required", [])) if isinstance(schema, dict) else set()
    fields: dict[str, Any] = {}
    for name, spec in properties.items():
        annotation = type_map.get(spec.get("type", "string"), str)
        fields[name] = (annotation, ... if name in required else None)
    return create_model(model_name, **fields)


def _tool_parameter_from_schema(schema: dict[str, Any]) -> ToolParameter:
    raw_type = schema.get("type", "string")
    param_type = raw_type if raw_type in {"string", "number", "integer", "boolean", "array", "object"} else "string"
    return ToolParameter(
        type=param_type,
        description=schema.get("description"),
        enum=schema.get("enum"),
        default=schema.get("default"),
    )


def _tool_input_schema_from_dict(schema: dict[str, Any]) -> ToolInputSchema:
    properties = {
        name: _tool_parameter_from_schema(value if isinstance(value, dict) else {})
        for name, value in (schema.get("properties") or {}).items()
    }
    return ToolInputSchema(properties=properties, required=schema.get("required"))


class ConfigurableAgent:
    def __init__(self, id: str, config: ConfigurableAgentConfig) -> None:
        self.id = id
        self.type = "custom"
        self._config = config
        self._llm = None

    def _format_structured_output(self, raw_output: str) -> str:
        schema = self._config.structuredOutput
        if not schema or not raw_output:
            return raw_output
        try:
            parsed = json.loads(raw_output)
            if isinstance(parsed, dict):
                return json.dumps(parsed)
        except (json.JSONDecodeError, TypeError):
            pass
        return raw_output

    @staticmethod
    def _build_pydantic_model_from_schema(schema: Dict[str, Any], model_name: str = "DynamicModel"):
        return build_pydantic_model_from_schema(schema, model_name)

    def _build_skill_tools(self) -> List[ExecutableTool]:
        tools: list[ExecutableTool] = []
        for skill in self._config.skills:
            name = skill.get("name", "")
            description = skill.get("description", "")
            instructions = skill.get("instructions", "")
            input_schema = skill.get("inputSchema") or {}
            full_desc = f"{description}\n\nInstructions:\n{instructions}" if instructions else description

            async def _skill_call(_name: str = name, **kwargs: Any) -> str:
                return f"Skill '{_name}' invoked with args: {json.dumps(kwargs)}"

            tools.append(
                ExecutableTool(
                    name=name,
                    description=full_desc,
                    input_schema=_tool_input_schema_from_dict(input_schema),
                    coroutine=_skill_call,
                )
            )
        return tools


def _build_finish_tool() -> ExecutableTool:
    async def finish(summary: str) -> str:
        return summary

    return ExecutableTool(
        name="finish",
        description="Signal that the task is complete and provide a final summary.",
        input_schema=ToolInputSchema(
            properties={"summary": ToolParameter(type="string", description="Final summary")},
            required=["summary"],
        ),
        coroutine=finish,
    )
