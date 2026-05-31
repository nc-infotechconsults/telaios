"""Smoke test: ProjectMcpRead serialisation."""
import uuid
from datetime import datetime
from telaios.modules.projects.mcps.schemas import ProjectMcpRead


def test_project_mcp_read_fields():
    mcp = ProjectMcpRead(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        cloned_from_library_mcp_id=None,
        name="My MCP",
        slug="my-mcp",
        description=None,
        transport="stdio",
        command=None,
        args=[],
        env={},
        url=None,
        headers={},
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    assert mcp.slug == "my-mcp"
    assert mcp.transport == "stdio"
