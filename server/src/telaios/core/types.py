"""
src/core/types.py
-----------------
All shared domain types for the core package.

No framework-specific imports — this module is intentionally dependency-free so
that callers, tests, and future implementations never need to install LangChain or
any other inference library just to work with the type system.

Python 3.14+ typing style is used throughout:
  - ``X | None``  instead of ``Optional[X]``
  - ``list[X]``   instead of ``List[X]``
  - ``type X = …`` (PEP 695) for simple type aliases
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

from telaios.domain.enums import (
    GraphStoreProvider,
    GuardrailAction,
    MessageRole,
    RagStrategy,
    StreamEventType,
)

# ── Type aliases ───────────────────────────────────────────────────────────────

type DocumentId = str
type ChunkId = str


# ── LLM ───────────────────────────────────────────────────────────────────────


class LLMConfig(BaseModel):
    """Configuration for an LLM provider and model."""

    provider: str
    model_name: str
    api_key: str = "change-me"
    base_url: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    timeout: int | None = None
    max_retries: int = 3


# ── Messages ──────────────────────────────────────────────────────────────────


class Message(BaseModel):
    """A single turn in a conversation, independent of any framework."""

    role: MessageRole
    content: str
    tool_call_id: str | None = None
    name: str | None = None


# ── Agent I/O ─────────────────────────────────────────────────────────────────


class AgentArtifact(BaseModel):
    """A named piece of output produced by an agent execution."""

    type: str
    title: str
    content: str
    content_type: str = "text/plain"
    metadata: dict[str, Any] = {}


class AgentInput(BaseModel):
    """Input passed to an agent invocation."""

    messages: list[Message]
    metadata: dict[str, Any] | None = None


class AgentOutput(BaseModel):
    """Final output from an agent invocation."""

    content: str
    messages: list[Message] = []
    structured_response: Any | None = None
    artifacts: list[AgentArtifact] = []


# ── Streaming ─────────────────────────────────────────────────────────────────


class StreamEvent(BaseModel):
    """A single streaming event emitted during agent execution."""

    type: StreamEventType
    data: Any
    run_id: str | None = None


# ── Tools (framework-agnostic) ────────────────────────────────────────────────


class ToolAnnotations(BaseModel):
    """Hints about a tool's side-effect behaviour."""

    read_only: bool = False
    destructive: bool = False
    idempotent: bool = False


class ToolParameter(BaseModel):
    """A single parameter in a tool's input schema (JSON Schema subset)."""

    type: Literal["string", "number", "integer", "boolean", "array", "object"]
    description: str | None = None
    enum: list[str | int | bool] | None = None
    items: ToolParameter | None = None  # for array types
    properties: dict[str, ToolParameter] | None = None  # for object types
    required: list[str] | None = None
    default: Any = None


class ToolInputSchema(BaseModel):
    """JSON-Schema-compatible input schema for a tool."""

    type: Literal["object"] = "object"
    properties: dict[str, ToolParameter] | None = None
    required: list[str] | None = None


class ToolDefinition(BaseModel):
    """
    Framework-agnostic description of a callable tool.

    Concrete implementations (e.g. LangChainAgent) convert this to their
    native tool type (StructuredTool, etc.) internally.
    """

    name: str
    description: str
    input_schema: ToolInputSchema
    output_schema: ToolInputSchema | None = None
    annotations: ToolAnnotations = ToolAnnotations()


# ── MCP ───────────────────────────────────────────────────────────────────────


class McpToolAnnotations(BaseModel):
    title: str | None = None
    readOnlyHint: bool | None = None  # noqa: N815
    destructiveHint: bool | None = None  # noqa: N815
    idempotentHint: bool | None = None  # noqa: N815
    openWorldHint: bool | None = None  # noqa: N815


class McpTextContent(BaseModel):
    type: Literal["text"] = "text"
    text: str


class McpImageContent(BaseModel):
    type: Literal["image"] = "image"
    data: str
    mimeType: str  # noqa: N815


class McpAudioContent(BaseModel):
    type: Literal["audio"] = "audio"
    data: str
    mimeType: str  # noqa: N815


type McpContent = McpTextContent | McpImageContent | McpAudioContent


class McpToolResult(BaseModel):
    content: list[McpTextContent | McpImageContent | McpAudioContent]
    structuredContent: dict[str, Any] | None = None  # noqa: N815
    isError: bool  # noqa: N815


class McpServer(BaseModel):
    """Connection configuration for a single MCP server."""

    name: str
    transport: Literal["stdio", "streamable-http"]
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    selected_tools: list[str] | None = None


# ── Skills ────────────────────────────────────────────────────────────────────


class Skill(BaseModel):
    """
    A higher-level capability exposed to an agent.

    Skills are similar to tools but include explicit instruction text that
    guides the agent on *how* to invoke them, not just *what* they do.
    """

    name: str
    title: str | None = None
    description: str
    inputSchema: ToolInputSchema  # noqa: N815
    outputSchema: ToolInputSchema | None = None  # noqa: N815
    annotations: McpToolAnnotations | None = None
    instructions: str


# ── Guardrails ────────────────────────────────────────────────────────────────


class GuardrailRule(BaseModel):
    """A named content-policy rule with an associated enforcement action."""

    name: str
    description: str
    action: GuardrailAction = GuardrailAction.BLOCK


class InputGuardrailConfig(BaseModel):
    """Guards applied to the agent input before it reaches the LLM."""

    rules: list[GuardrailRule] = []
    max_prompt_length: int | None = None
    block_prompt_injection: bool = True


class OutputGuardrailConfig(BaseModel):
    """Guards applied to the agent output before it is returned to the caller."""

    rules: list[GuardrailRule] = []
    max_response_length: int | None = None
    redact_pii: bool = False


class GuardrailConfig(BaseModel):
    input: InputGuardrailConfig = InputGuardrailConfig()
    output: OutputGuardrailConfig = OutputGuardrailConfig()


# ── RAG ───────────────────────────────────────────────────────────────────────


class DocumentMetadata(BaseModel):
    source: str | None = None
    title: str | None = None
    author: str | None = None
    created_at: str | None = None
    extra: dict[str, Any] = {}


class Document(BaseModel):
    """The fundamental unit of content in a RAG pipeline."""

    id: DocumentId
    content: str
    metadata: DocumentMetadata = DocumentMetadata()


class Chunk(BaseModel):
    """A chunked segment of a Document, optionally enriched with an embedding."""

    id: ChunkId
    document_id: DocumentId
    content: str
    embedding: list[float] | None = None
    metadata: dict[str, Any] = {}


class RetrievalQuery(BaseModel):
    """A structured query issued to a Retriever."""

    text: str
    filters: dict[str, Any] = {}
    top_k: int = 5
    min_score: float | None = None


class RetrievalResult(BaseModel):
    """Chunks returned by a retrieval operation, with optional relevance scores."""

    chunks: list[Chunk]
    scores: list[float] = []  # parallel to chunks; empty if scores are unavailable


class EmbeddingConfig(BaseModel):
    """Configuration for generating text embeddings."""

    provider: str
    model: str
    api_key: str = ""
    dimensions: int | None = None


class VectorStoreConfig(BaseModel):
    """Connection and collection settings for a vector database (Qdrant)."""

    provider: str = "qdrant"
    connection_string: str | None = None
    collection: str = "default"
    extra: dict[str, Any] = {}


class GraphStoreConfig(BaseModel):
    """
    Connection settings for a graph database used in Graph RAG.

    Supported providers: neo4j (uri, username, password, database),
                         networkx (in-memory, no connection needed),
                         falkordb (uri, username, password),
                         memgraph (uri, username, password)

    Source: LangChain Graph RAG -
    https://python.langchain.com/docs/integrations/graphs/
    """

    provider: GraphStoreProvider | str = GraphStoreProvider.NEO4J
    uri: str | None = None
    username: str = ""
    password: str = ""
    database: str = "neo4j"
    extra: dict[str, Any] = {}


class ChunkingConfig(BaseModel):
    """Configuration for text chunking strategies."""

    strategy: str = "semantic"  # semantic | hierarchical | page | token | character
    chunk_size: int = 512
    chunk_overlap: int = 64
    max_chunks: int | None = None


class RagConfig(BaseModel):
    """Legacy RAG config — kept for backwards compatibility. Use KnowledgePipelineConfig."""

    strategy: RagStrategy = RagStrategy.HYBRID
    top_k: int = 5
    chunk_size: int = 512
    chunk_overlap: int = 64
    chunking: ChunkingConfig = ChunkingConfig()
    extra: dict[str, Any] = {}


# ── Agent configuration ───────────────────────────────────────────────────────


class AgentConfig(BaseModel):
    """
    Configuration for a LangChain/LangGraph agent instance.

    Passed to ``LangChainAgent`` (and ``create_agent()``/``create_agent_with_config()``).
    """

    framework: str = "langchain"  # kept for API compatibility
    llm: LLMConfig
    system_prompt: str | None = None
    system_prompt_mode: Literal["override", "extend"] = "override"
    tools: list[ToolDefinition] = []
    mcp_servers: list[McpServer] = []
    skills: list[Skill] = []
    structured_output: BaseModel | None = None
    guardrails: GuardrailConfig = GuardrailConfig()
    max_iterations: int = 50


__all__ = [
    "AgentArtifact",
    "AgentConfig",
    "AgentInput",
    "AgentOutput",
    "Chunk",
    "ChunkingConfig",
    "Document",
    "DocumentMetadata",
    "EmbeddingConfig",
    "GraphStoreConfig",
    "GraphStoreProvider",
    "GuardrailAction",
    "GuardrailConfig",
    "GuardrailRule",
    "InputGuardrailConfig",
    "LLMConfig",
    "McpAudioContent",
    "McpContent",
    "McpImageContent",
    "McpServer",
    "McpTextContent",
    "McpToolAnnotations",
    "McpToolResult",
    "Message",
    "MessageRole",
    "OutputGuardrailConfig",
    "RagConfig",
    "RagStrategy",
    "RetrievalQuery",
    "RetrievalResult",
    "Skill",
    "StreamEvent",
    "StreamEventType",
    "ToolAnnotations",
    "ToolDefinition",
    "ToolInputSchema",
    "ToolParameter",
    "VectorStoreConfig",
]
