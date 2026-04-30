from __future__ import annotations

import json
from typing import List, Optional

from pydantic import BaseModel

from agent_service.core.agent_framework.base_agent import BaseAgent, AgentResult as BaseAgentResult
from agent_service.core.agent_framework.context import AgentContext
from agent_service.core.agent_framework.event_bus import get_agent_event_bus
from agent_service.core.llm import build_chat_model
from agent_service.agents.testing.tools import build_testing_tools
from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.prebuilt import create_react_agent


class TestingAgentConfig(BaseModel):
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
    generateTests: bool = True


def _compose_prompt(builtin: str, custom: Optional[str], mode: str) -> str:
    """Return the effective system prompt based on mode and user-supplied prompt."""
    if not custom:
        return builtin
    if mode == "override":
        return custom
    return f"{builtin}\n\n{custom}"


TEST_SYSTEM_PROMPT = """\
You are an expert software engineer specialising in test-driven development and quality assurance.

Your workflow:
1. **Detect the test framework** — read `package.json`, `pyproject.toml`, `go.mod`, or similar to identify the language and test runner (jest, pytest, go test, etc.)
2. **Inspect the source code** — use `read_file` to understand what has been implemented
3. **Write tests** — use `write_file` to create comprehensive test files covering:
   - Happy paths
   - Edge cases and boundary conditions
   - Error conditions and failure modes
4. **Run the tests** — use `run_shell` to execute the test suite and capture results
5. **Iterate if needed** — if tests fail due to test file issues (not implementation bugs), fix them and re-run
6. **Finish** — call `finish` with the final results

When calling `finish`:
- `passed`: true only if the test suite exits with a 0 exit code
- `summary`: brief description of what was tested and the outcome
- `tests_run`: total number of test cases executed
- `failures`: list of failing test names or error messages (empty if all passed)"""


class TestingAgent(BaseAgent):
    def __init__(self, id: str, config: TestingAgentConfig) -> None:
        super().__init__(id, "tester")
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
        await bus.publish("tests.started", {"agentId": self.id, "executionId": ctx.executionId})

        task_desc = ctx.task.description if ctx.task else "Test the implemented code."
        task_title = ctx.task.title if ctx.task else "Testing"

        effective_system = _compose_prompt(
            TEST_SYSTEM_PROMPT, self._config.systemPrompt, self._config.systemPromptMode
        )

        tools = build_testing_tools(ctx.workspaces or {})
        graph = create_react_agent(self._llm, tools, prompt=effective_system)

        human_content = (
            f"Task: {task_title}\n{task_desc}\n\n"
            f"Please detect the test framework, write comprehensive tests for the implemented code, "
            f"run them, and call finish() with the results."
        )

        result = await graph.ainvoke(
            {"messages": [HumanMessage(content=human_content)]},
            {"recursion_limit": 60},
        )

        summary = _extract_finish_result(result.get("messages", []))

        overall_success = summary.get("passed", False)
        tests_run = summary.get("tests_run", 0)
        failures = summary.get("failures", [])

        self._result = BaseAgentResult(
            success=overall_success,
            output=json.dumps(summary),
            artifacts=[{
                "type": "test_result",
                "title": (
                    f"Test Results — {tests_run - len(failures)} passed, {len(failures)} failed"
                    if tests_run
                    else ("Tests Passed" if overall_success else "Tests Failed")
                ),
                "content": json.dumps(summary),
                "content_type": "application/json",
                "metadata": {
                    "passed": tests_run - len(failures),
                    "failed": len(failures),
                    "skipped": 0,
                    "total": tests_run,
                    "duration_ms": 0,
                },
            }],
        )

        event_topic = "tests.passed" if overall_success else "tests.failed"
        await bus.publish(event_topic, {
            "agentId": self.id,
            "executionId": ctx.executionId,
            "testsRun": tests_run,
            "failures": len(failures),
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
                if isinstance(data, dict) and "passed" in data:
                    return data
            except (json.JSONDecodeError, TypeError):
                pass

    return {
        "passed": False,
        "summary": "Testing agent did not call finish(). Manual inspection required.",
        "tests_run": 0,
        "failures": [],
    }
