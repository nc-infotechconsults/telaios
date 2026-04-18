from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel


# ── JSON Schema primitives ────────────────────────────────────────────────────

JsonSchemaType = Literal["string", "number", "integer", "boolean", "array", "object", "null"]


class JsonSchemaProperty(BaseModel):
    type: Union[JsonSchemaType, List[JsonSchemaType]]
    description: Optional[str] = None
    enum: Optional[List[Union[str, int, bool]]] = None
    items: Optional["JsonSchemaProperty"] = None
    properties: Optional[Dict[str, "JsonSchemaProperty"]] = None
    required: Optional[List[str]] = None
    default: Optional[Any] = None


class JsonSchema(BaseModel):
    type: Literal["object"] = "object"
    properties: Optional[Dict[str, JsonSchemaProperty]] = None
    required: Optional[List[str]] = None


# ── MCP Tool annotations ──────────────────────────────────────────────────────

class McpToolAnnotations(BaseModel):
    title: Optional[str] = None
    readOnlyHint: Optional[bool] = None
    destructiveHint: Optional[bool] = None
    idempotentHint: Optional[bool] = None
    openWorldHint: Optional[bool] = None


# ── MCP Content ───────────────────────────────────────────────────────────────

class McpTextContent(BaseModel):
    type: Literal["text"] = "text"
    text: str


class McpImageContent(BaseModel):
    type: Literal["image"] = "image"
    data: str
    mimeType: str


class McpAudioContent(BaseModel):
    type: Literal["audio"] = "audio"
    data: str
    mimeType: str


McpContent = Union[McpTextContent, McpImageContent, McpAudioContent]


class McpToolResult(BaseModel):
    content: List[McpContent]
    structuredContent: Optional[Dict[str, Any]] = None
    isError: bool


# ── MCP Server configuration ──────────────────────────────────────────────────

class McpServer(BaseModel):
    name: str
    transport: Literal["stdio", "streamable-http"]
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None
    url: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    selected_tools: Optional[List[str]] = None


# ── Skill ─────────────────────────────────────────────────────────────────────

class Skill(BaseModel):
    name: str
    title: Optional[str] = None
    description: str
    inputSchema: JsonSchema
    outputSchema: Optional[JsonSchema] = None
    annotations: Optional[McpToolAnnotations] = None
    instructions: str
