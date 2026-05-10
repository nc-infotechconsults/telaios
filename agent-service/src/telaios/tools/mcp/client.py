"""
src/tools/mcp/client.py
------------------------
Load ``ExecutableTool`` objects from a remote MCP server.

Each call to ``McpToolLoader.load()`` opens a fresh transport connection,
fetches the tool list, wraps each remote tool call in an async coroutine,
and closes the connection.  There is no session cache — reconnect per
execution is intentional (keeps lifecycle simple, avoids stale sessions).

Supported transports
~~~~~~~~~~~~~~~~~~~~
- ``stdio``          — spawns a subprocess (``McpServer.command`` / ``args``)
- ``streamable-http`` — connects to an HTTP endpoint (``McpServer.url``)
"""

from __future__ import annotations

import logging
from typing import Any

from httpx import AsyncClient

from telaios.core.types import McpServer, ToolAnnotations
from telaios.tools.mcp.adapter import mcp_schema_to_input_schema
from telaios.tools.types import ExecutableTool

logger = logging.getLogger(__name__)


class McpToolLoader:
    """Load ``ExecutableTool`` objects from a single MCP server.

    Usage::

        loader = McpToolLoader()
        tools = await loader.load(mcp_server_config)
    """

    async def load(self, server: McpServer) -> list[ExecutableTool]:
        """Connect to *server*, fetch its tool list, and return ``ExecutableTool``s.

        If ``server.selected_tools`` is set, only tools whose names appear in
        that list are returned.

        Args:
            server: MCP server configuration from ``core.types.McpServer``.

        Returns:
            List of ``ExecutableTool`` objects ready for registration.

        Raises:
            ValueError: If the transport type is unsupported or required
                        connection parameters are missing.
        """
        from mcp import ClientSession  # noqa: PLC0415
        from mcp.client.stdio import StdioServerParameters, stdio_client  # noqa: PLC0415
        from mcp.client.streamable_http import streamable_http_client  # noqa: PLC0415

        if server.transport == "stdio":
            if not server.command:
                raise ValueError(
                    f"McpServer '{server.name}': 'command' is required for stdio transport."
                )
            params = StdioServerParameters(
                command=server.command,
                args=server.args or [],
                env=server.env,
            )
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    return await self._fetch_tools(session, server)

        elif server.transport == "streamable-http":
            if not server.url:
                raise ValueError(
                    f"McpServer '{server.name}': 'url' is required for streamable-http transport."
                )
            async with streamable_http_client(
                server.url,
                http_client=AsyncClient(headers=server.headers or None)
            ) as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    return await self._fetch_tools(session, server)

        else:
            raise ValueError(
                f"McpServer '{server.name}': unsupported transport '{server.transport}'."
            )

    async def _fetch_tools(self, session: Any, server: McpServer) -> list[ExecutableTool]:
        """Fetch the tool list from an initialised *session* and wrap each one."""
        response = await session.list_tools()
        mcp_tools = response.tools

        selected = set(server.selected_tools) if server.selected_tools else None
        results: list[ExecutableTool] = []

        for mcp_tool in mcp_tools:
            if selected is not None and mcp_tool.name not in selected:
                continue

            tool = self._wrap_tool(mcp_tool, session, server.name)
            results.append(tool)

        logger.debug(
            "McpToolLoader: loaded %d tools from '%s'", len(results), server.name
        )
        return results

    def _wrap_tool(self, mcp_tool: Any, session: Any, server_name: str) -> ExecutableTool:
        """Create an ``ExecutableTool`` that proxies calls to *mcp_tool* via *session*."""
        tool_name = mcp_tool.name
        input_schema = mcp_schema_to_input_schema(mcp_tool.inputSchema)

        annotations_hint = getattr(mcp_tool, "annotations", None)
        annotations = ToolAnnotations(
            read_only=bool(getattr(annotations_hint, "readOnlyHint", False)),
            destructive=bool(getattr(annotations_hint, "destructiveHint", False)),
            idempotent=bool(getattr(annotations_hint, "idempotentHint", False)),
        )

        async def _call(**kwargs: Any) -> str:
            result = await session.call_tool(tool_name, arguments=kwargs or None)
            if result.isError:
                raise RuntimeError(
                    f"MCP tool '{tool_name}' returned an error: "
                    + "\n".join(
                        c.text if hasattr(c, "text") else c.model_dump_json()
                        for c in result.content
                    )
                )
            text_parts: list[str] = []
            for content_item in result.content:
                if hasattr(content_item, "text"):
                    text_parts.append(content_item.text)
                else:
                    text_parts.append(content_item.model_dump_json())
            return "\n".join(text_parts) if text_parts else "(no output)"

        return ExecutableTool(
            name=tool_name,
            description=getattr(mcp_tool, "description", "") or "",
            input_schema=input_schema,
            annotations=annotations,
            coroutine=_call,
        )
