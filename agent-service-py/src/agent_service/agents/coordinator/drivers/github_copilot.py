from __future__ import annotations

from typing import List, Optional

from agent_service.agents.coordinator.drivers.base import AgentArtifact, AgentResult, AgentStatus, AgentTask
from agent_service.core.types import Skill


class GitHubCopilotDriver:
    """Driver that uses the GitHub Copilot SDK for task execution."""

    def __init__(
        self,
        github_token: Optional[str],
        llm_provider: Optional[str],
        llm_api_key: Optional[str],
        llm_base_url: Optional[str],
        skills: List[Skill],
    ) -> None:
        self._github_token = github_token
        self._llm_provider = llm_provider
        self._llm_api_key = llm_api_key
        self._llm_base_url = llm_base_url
        self._skills = skills
        self._status: AgentStatus = "idle"

    async def get_status(self) -> AgentStatus:
        return self._status

    async def execute(self, task: AgentTask, workspaces: dict[str, str]) -> AgentResult:
        self._status = "busy"
        primary_workspace = next(iter(workspaces.values()), ".")

        try:
            import importlib

            copilot = importlib.import_module("github_copilot_sdk")

            auth_options = (
                {"token": self._github_token}
                if self._github_token
                else {
                    "byok": {
                        "provider": self._llm_provider or "openai",
                        "apiKey": self._llm_api_key or "",
                        **({"baseURL": self._llm_base_url} if self._llm_base_url else {}),
                    }
                }
            )

            client = copilot.create_client(auth_options)

            skills_context = ""
            if self._skills:
                skills_context = "\n\nAvailable skills:\n" + "\n\n".join(
                    f"## {s.name}\n{s.description}\n{s.instructions}" for s in self._skills
                )

            result = await client.run(
                prompt=f"{task.title}\n\n{task.description}{skills_context}",
                cwd=primary_workspace,
                tools=["all"],
            )

            self._status = "idle"
            return AgentResult(success=True, output=getattr(result, "output", None) or "Done")
        except Exception as exc:
            self._status = "error"
            return AgentResult(success=False, output="", error=str(exc))
