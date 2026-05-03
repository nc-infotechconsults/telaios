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

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel


# ── Type aliases ───────────────────────────────────────────────────────────────

type DocumentId = str
type ChunkId = str


# ── LLM ───────────────────────────────────────────────────────────────────────


class LLMConfig(BaseModel):
    """Configuration for an LLM provider and model."""

    provider: str
    model: str
    api_key: str = ""
    base_url: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    top_p: float | None = None
    frequency_penalty: float | None = None
    presence_penalty: float | None = None
    timeout: int = 30


# ── Messages ──────────────────────────────────────────────────────────────────


class MessageRole(str, Enum):
    SYSTEM = "system"
    HUMAN = "human"
    AI = "ai"
    TOOL = "tool"


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


class StreamEventType(str, Enum):
    TEXT_CHUNK = "text_chunk"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    AGENT_START = "agent_start"
    AGENT_END = "agent_end"
    ERROR = "error"


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
    readOnlyHint: bool | None = None
    destructiveHint: bool | None = None
    idempotentHint: bool | None = None
    openWorldHint: bool | None = None


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


type McpContent = McpTextContent | McpImageContent | McpAudioContent


class McpToolResult(BaseModel):
    content: list[McpTextContent | McpImageContent | McpAudioContent]
    structuredContent: dict[str, Any] | None = None
    isError: bool


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
    inputSchema: ToolInputSchema
    outputSchema: ToolInputSchema | None = None
    annotations: McpToolAnnotations | None = None
    instructions: str


# ── Guardrails ────────────────────────────────────────────────────────────────


class GuardrailAction(str, Enum):
    ALLOW = "allow"
    BLOCK = "block"
    REDACT = "redact"
    WARN = "warn"


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


# ── Sandbox ───────────────────────────────────────────────────────────────────


class SandboxProvider(str, Enum):
    """Execution environments available for code-execution tools."""

    DOCKER = "docker"
    SUBPROCESS = "subprocess"
    E2B = "e2b"
    MODAL = "modal"
    NONE = "none"


class SandboxNetworkPolicy(str, Enum):
    NONE = "none"
    RESTRICTED = "restricted"
    FULL = "full"


class SandboxResourceLimits(BaseModel):
    memory_mb: int | None = None
    cpu_shares: int | None = None
    timeout_seconds: int = 30


class SandboxConfig(BaseModel):
    """
    Configuration for the sandbox that runs code-execution tools.

    The actual sandbox integration lives in the tool layer; this config is
    carried through AgentConfig so every tool in a run shares the same policy.
    """

    provider: SandboxProvider = SandboxProvider.NONE
    image: str | None = None  # docker image when provider=DOCKER
    allowed_commands: list[str] = []  # empty = all commands allowed
    network: SandboxNetworkPolicy = SandboxNetworkPolicy.NONE
    resources: SandboxResourceLimits = SandboxResourceLimits()
    env: dict[str, str] = {}
    working_dir: str | None = None


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
    """
    Connection and collection settings for a vector database.

    Supported providers: pgvector, chroma, qdrant, pinecone, weaviate, …
    """

    provider: str
    connection_string: str | None = None
    collection: str = "default"
    extra: dict[str, Any] = {}


class GraphStoreConfig(BaseModel):
    """
    Connection settings for a graph database used in Graph RAG.

    Supported providers: neo4j, memgraph, falkordb, …
    """

    provider: str
    uri: str
    username: str = ""
    password: str = ""
    database: str = "neo4j"


class RagStrategy(str, Enum):
    """
    High-level RAG strategy that determines how retrieval interacts with generation.

    SIMPLE   — one-shot retrieve → prepend context → LLM answer
    GRAPH    — knowledge-graph traversal to build a structured context
    AGENTIC  — the agent loop decides when and what to retrieve (multi-hop)
    HYBRID   — vector similarity + graph traversal combined
    """

    SIMPLE = "simple"
    GRAPH = "graph"
    AGENTIC = "agentic"
    HYBRID = "hybrid"


class RagConfig(BaseModel):
    """Full configuration for a RAG pipeline."""

    strategy: RagStrategy = RagStrategy.SIMPLE
    llm: LLMConfig | None = None  # LLM used for the generation step
    embedding: EmbeddingConfig
    vector_store: VectorStoreConfig | None = None
    graph_store: GraphStoreConfig | None = None
    top_k: int = 5
    chunk_size: int = 512
    chunk_overlap: int = 64
    framework: str = "langchain"


# ── Sub-agent reference ───────────────────────────────────────────────────────


class SubAgentConfig(BaseModel):
    """
    A sub-agent exposed as a callable tool to an orchestrator.

    ``name`` is the tool name the LLM calls; ``description`` is the tool
    description shown to the LLM.  ``agent_config`` is the full configuration
    used to build the sub-agent instance — it may use a *different* framework
    than the orchestrator.  If ``agent_config`` is ``None``, the caller must
    inject the live ``Agent`` instance at runtime via
    ``Orchestrator.add_sub_agent()``.
    """

    name: str
    description: str
    agent_config: AgentConfig | None = None


# ── Agent configuration ───────────────────────────────────────────────────────


class AgentConfig(BaseModel):
    """
    Complete, framework-agnostic configuration for an Agent instance.

    Passed to ``LangChainAgent`` (or any future concrete implementation).
    All domain concerns — LLM choice, tools, guardrails, sandbox, RAG — are
    expressed here using the types defined in this module.

    Sub-agents
    ~~~~~~~~~~
    Set ``sub_agents`` to expose other agents as callable tools.  Each entry
    carries its own ``agent_config`` (and its own ``framework``), so an
    orchestrator built with ``framework="langchain"`` can have sub-agents that
    use ``framework="openai"`` or any other registered provider.
    """

    framework: str = "langchain"
    llm: LLMConfig
    system_prompt: str | None = None
    system_prompt_mode: Literal["override", "extend"] = "override"
    tools: list[ToolDefinition] = []
    mcp_servers: list[McpServer] = []
    skills: list[Skill] = []
    structured_output: BaseModel | None = None
    guardrails: GuardrailConfig = GuardrailConfig()
    sandbox: SandboxConfig = SandboxConfig()
    max_iterations: int = 50
    sub_agents: list[SubAgentConfig] = []


# Resolve the forward reference: SubAgentConfig.agent_config → AgentConfig
AgentConfig.model_rebuild()
