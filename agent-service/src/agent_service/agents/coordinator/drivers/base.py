from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Literal, Optional, Protocol


ArtifactType = Literal["diff", "test_result", "review", "log", "file", "link"]


@dataclass
class AgentArtifact:
    type: ArtifactType
    title: str
    content: str
    content_type: Optional[str] = None
    metadata: Optional[dict] = None
    sort_order: int = 0


@dataclass
class AgentTask:
    id: str
    title: str
    description: str
    type: str
    agent_profile_id: Optional[str] = None


@dataclass
class AgentResult:
    success: bool
    output: str
    error: Optional[str] = None
    artifacts: List[AgentArtifact] = field(default_factory=list)


AgentStatus = Literal["idle", "busy", "error"]


class CodingAgentDriver(Protocol):
    async def execute(
        self, task: AgentTask, workspaces: dict[str, str]
    ) -> AgentResult:
        ...

    async def get_status(self) -> AgentStatus:
        ...
