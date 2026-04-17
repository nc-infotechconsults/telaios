from __future__ import annotations

from agent_service.agents.coordinator.drivers.base import (
    AgentResult,
    AgentStatus,
    AgentTask,
    CodingAgentDriver,
)
from agent_service.core.agent_framework.base_agent import BaseAgent
from agent_service.core.agent_framework.context import (
    AgentContext,
    ProjectContext,
    RepositoryContext,
    TaskContext,
)


class BaseAgentDriver:
    """
    Adapter that wraps a ``BaseAgent`` into the ``CodingAgentDriver`` interface
    so it can be used transparently by the Scheduler and AgentPool.
    """

    def __init__(self, agent: BaseAgent, project_ctx: dict) -> None:
        self._agent = agent
        self._project_ctx = project_ctx

    async def execute(self, task: AgentTask, workspaces: dict[str, str]) -> AgentResult:
        task_ctx = TaskContext(
            id=task.id,
            title=task.title,
            description=task.description,
            type=task.type,  # type: ignore[arg-type]
        )
        ctx = AgentContext(
            executionId=task.id,
            project=ProjectContext(
                id=self._project_ctx["id"],
                name=self._project_ctx["name"],
                repositories=[
                    RepositoryContext(
                        id=name,
                        fullName=name,
                        defaultBranch="main",
                        localPath=local_path,
                    )
                    for name, local_path in workspaces.items()
                ],
            ),
            task=task_ctx,
            workspaces=workspaces,
        )

        try:
            await self._agent.init(ctx)
            await self._agent.execute(ctx)

            result = self._agent.get_result()
            if result is None:
                from agent_service.agents.coordinator.drivers.base import AgentResult as AR
                return AR(success=True, output="Agent completed successfully (no explicit result).")
            from agent_service.agents.coordinator.drivers.base import AgentArtifact, AgentResult as AR
            return AR(
                success=result.success,
                output=result.output,
                error=result.error,
                artifacts=[
                    AgentArtifact(
                        type=a["type"],
                        title=a["title"],
                        content=a["content"],
                        content_type=a.get("content_type"),
                        metadata=a.get("metadata"),
                    )
                    for a in (result.artifacts or [])
                ],
            )
        except Exception as exc:
            from agent_service.agents.coordinator.drivers.base import AgentResult as AR
            return AR(success=False, output="", error=str(exc))

    async def get_status(self) -> AgentStatus:
        s = self._agent.get_status()
        if s == "running":
            return "busy"
        if s == "error":
            return "error"
        return "idle"
