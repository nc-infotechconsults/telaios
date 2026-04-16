from __future__ import annotations

import json
import os
from typing import List

from agent_service.agents.coordinator.drivers.base import AgentArtifact, AgentResult, AgentStatus, AgentTask
from agent_service.core.types import McpServer, Skill


class OpenCodeDriver:
    """Driver that uses the opencode-ai CLI/SDK for task execution."""

    def __init__(
        self,
        llm_provider: str,
        llm_model: str,
        llm_api_key: str,
        llm_base_url: str | None,
        skills: List[Skill],
        mcp_servers: List[McpServer],
    ) -> None:
        self._llm_provider = llm_provider
        self._llm_model = llm_model
        self._llm_api_key = llm_api_key
        self._llm_base_url = llm_base_url
        self._skills = skills
        self._mcp_servers = mcp_servers
        self._status: AgentStatus = "idle"

    async def get_status(self) -> AgentStatus:
        return self._status

    async def execute(self, task: AgentTask, workspaces: dict[str, str]) -> AgentResult:
        self._status = "busy"
        primary_workspace = next(iter(workspaces.values()), "/tmp")

        try:
            await self._materialize_skills(primary_workspace)
            await self._write_opencode_config(primary_workspace)

            # opencode-ai Python package — installed separately: pip install opencode-ai
            import importlib
            opencode = importlib.import_module("opencode")
            result = await opencode.run(
                prompt=f"{task.title}\n\n{task.description}",
                cwd=primary_workspace,
            )

            self._status = "idle"
            return AgentResult(success=True, output=getattr(result, "output", None) or "Done")
        except Exception as exc:
            self._status = "error"
            return AgentResult(success=False, output="", error=str(exc))

    async def _materialize_skills(self, workspace_root: str) -> None:
        for skill in self._skills:
            skill_dir = os.path.join(workspace_root, ".skills", skill.name)
            os.makedirs(skill_dir, exist_ok=True)

            props = skill.inputSchema.properties or {}
            outputs = (skill.outputSchema.properties or {}) if skill.outputSchema else {}

            lines = ["---", f"name: {skill.name}", f"description: {skill.description}"]
            if props:
                lines.append("inputSchema:")
                for k, v in props.items():
                    t = v.type if isinstance(v.type, str) else "|".join(v.type)
                    desc = f"  # {v.description}" if v.description else ""
                    lines.append(f"  {k}: {t}{desc}")
            if outputs:
                lines.append("outputSchema:")
                for k, v in outputs.items():
                    t = v.type if isinstance(v.type, str) else "|".join(v.type)
                    desc = f"  # {v.description}" if v.description else ""
                    lines.append(f"  {k}: {t}{desc}")
            lines.append("---")
            front = "\n".join(lines)

            with open(os.path.join(skill_dir, "SKILL.md"), "w", encoding="utf-8") as fh:
                fh.write(f"{front}\n\n{skill.instructions}")

    async def _write_opencode_config(self, workspace_root: str) -> None:
        cfg: dict = {
            "provider": {
                "name": self._llm_provider,
                "model": self._llm_model,
                **({"baseURL": self._llm_base_url} if self._llm_base_url else {}),
            },
            "mcp": {
                s.name: {
                    "transport": s.transport,
                    **({"url": s.url} if s.url else {}),
                    **({"command": s.command, "args": s.args or []} if s.command else {}),
                    **({"env": s.env} if s.env else {}),
                }
                for s in self._mcp_servers
            },
        }
        with open(os.path.join(workspace_root, "opencode.json"), "w", encoding="utf-8") as fh:
            json.dump(cfg, fh, indent=2)
