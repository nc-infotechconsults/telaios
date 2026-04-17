from __future__ import annotations

import json
import os
import re
from typing import List, Optional

from pydantic import BaseModel

from agent_service.core.agent_framework.base_agent import BaseAgent, AgentResult as BaseAgentResult
from agent_service.core.agent_framework.context import AgentContext
from agent_service.core.agent_framework.event_bus import get_agent_event_bus
from agent_service.core.llm import build_chat_model
from agent_service.agents.testing.test_runner import detect_framework, run_tests
from langchain_core.messages import HumanMessage, SystemMessage


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


TEST_GEN_SYSTEM_PROMPT = """\
You are an expert software engineer specializing in test-driven development.

Given a task description and source code files, generate comprehensive tests that:
1. Cover happy paths, edge cases, and error conditions
2. Follow the detected test framework conventions
3. Are self-contained and runnable without mocks unless necessary

Respond with a JSON array of files to create:
[
  {
    "path": "tests/unit/example.test.ts",
    "content": "// full file content here"
  }
]

Respond with ONLY valid JSON. No markdown fences."""


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

        all_results = []
        generated_files: list[str] = []

        for repo_name, local_path in (ctx.workspaces or {}).items():
            framework = await detect_framework(local_path)

            if framework is None:
                if self._config.generateTests:
                    gen = await self._generate_tests(ctx, local_path, "jest")
                    generated_files.extend(f"{repo_name}/{f}" for f in gen)
                continue

            result = await run_tests(local_path, framework)
            all_results.append(result)

            if not result.success and self._config.generateTests:
                gen = await self._generate_tests(ctx, local_path, framework.name)
                generated_files.extend(f"{repo_name}/{f}" for f in gen)

        total_passed = sum(r.passed for r in all_results)
        total_failed = sum(r.failed for r in all_results)
        total_duration = sum(r.duration_ms for r in all_results)
        overall_success = all(r.success for r in all_results) and len(all_results) > 0

        summary = {
            "passed": total_passed,
            "failed": total_failed,
            "durationMs": total_duration,
            "results": [
                {"framework": r.framework, "passed": r.passed, "failed": r.failed, "success": r.success, "output": r.output}
                for r in all_results
            ],
            "generatedFiles": generated_files,
        }

        self._result = BaseAgentResult(
            success=overall_success or bool(generated_files),
            output=json.dumps(summary),
            artifacts=[{
                "type": "test_result",
                "title": f"Test Results — {total_passed} passed, {total_failed} failed",
                "content": json.dumps(summary),
                "content_type": "application/json",
                "metadata": {
                    "passed": total_passed,
                    "failed": total_failed,
                    "skipped": 0,
                    "total": total_passed + total_failed,
                    "duration_ms": total_duration,
                },
            }],
        )

        event_topic = "tests.passed" if overall_success else "tests.failed"
        await bus.publish(event_topic, {
            "agentId": self.id,
            "executionId": ctx.executionId,
            "passed": total_passed,
            "failed": total_failed,
            "durationMs": total_duration,
        })

        if generated_files:
            await bus.publish("tests.generated", {
                "agentId": self.id,
                "executionId": ctx.executionId,
                "filesGenerated": len(generated_files),
            })

    async def on_cleanup(self) -> None:
        pass

    async def _generate_tests(
        self, ctx: AgentContext, workspace_path: str, framework_hint: str
    ) -> List[str]:
        task_desc = ctx.task.description if ctx.task else "Generate tests for the codebase."
        src_files = await self._collect_source_files(workspace_path, 5)
        src_context = "\n\n".join(
            f"### {path}\n```\n{content[:2000]}\n```" for path, content in src_files
        )
        response = await self._llm.ainvoke([
            SystemMessage(content=_compose_prompt(TEST_GEN_SYSTEM_PROMPT, self._config.systemPrompt, self._config.systemPromptMode)),
            HumanMessage(content=f"Task: {task_desc}\n\nTest framework: {framework_hint}\n\nSource files:\n{src_context}"),
        ])
        content = response.content if isinstance(response.content, str) else json.dumps(response.content)

        try:
            json_match = re.search(r"\[[\s\S]*\]", content)
            files = json.loads(json_match.group(0) if json_match else content)
            written: list[str] = []
            for file in files:
                abs_path = os.path.join(workspace_path, file["path"])
                os.makedirs(os.path.dirname(abs_path), exist_ok=True)
                with open(abs_path, "w", encoding="utf-8") as fh:
                    fh.write(file["content"])
                written.append(file["path"])
            return written
        except Exception:
            return []

    async def _collect_source_files(
        self, directory: str, max_files: int
    ) -> List[tuple[str, str]]:
        IGNORE = frozenset(["node_modules", ".git", "dist", "build", ".next", "coverage"])
        SRC_EXTS = frozenset([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"])
        results: list[tuple[str, str]] = []

        def walk(current: str) -> None:
            if len(results) >= max_files:
                return
            try:
                entries = list(os.scandir(current))
            except Exception:
                return
            for entry in entries:
                if len(results) >= max_files:
                    return
                if entry.is_dir() and entry.name not in IGNORE:
                    walk(entry.path)
                elif entry.is_file() and os.path.splitext(entry.name)[1] in SRC_EXTS:
                    try:
                        with open(entry.path, "r", encoding="utf-8", errors="replace") as fh:
                            results.append((os.path.relpath(entry.path, directory), fh.read()))
                    except Exception:
                        pass

        walk(directory)
        return results
