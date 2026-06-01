"""Centralized domain enumerations.

All ``StrEnum`` types live here so that every layer (``core``, ``db``,
``modules``, ``infra``) imports from a single source of truth.

Previously these were scattered as ``Literal[...]`` type aliases across
``db/models/*.py`` and duplicated in ``modules/*/schemas.py``.
"""

from __future__ import annotations

from enum import StrEnum

# ── Core / AI ──────────────────────────────────────────────────────────────────


class MessageRole(StrEnum):
    SYSTEM = "system"
    HUMAN = "human"
    AI = "ai"
    TOOL = "tool"


class StreamEventType(StrEnum):
    TEXT_CHUNK = "text_chunk"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    AGENT_START = "agent_start"
    AGENT_END = "agent_end"
    ERROR = "error"


class GuardrailAction(StrEnum):
    ALLOW = "allow"
    BLOCK = "block"
    REDACT = "redact"
    WARN = "warn"


class GraphStoreProvider(StrEnum):
    NEO4J = "neo4j"
    NETWORKX = "networkx"
    FALKORDB = "falkordb"
    MEMGRAPH = "memgraph"


class RelevanceTier(StrEnum):
    """Normalized RRF relevance bucket for API/UI consumers.

    Derived from the normalized RRF score [0, 1]:
      HIGH   >= 0.70  — ranked near the top by both dense and sparse retrieval
      MEDIUM >= 0.35  — solid match in at least one retriever
      LOW    <  0.35  — weak or single-retriever match
    """

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RagStrategy(StrEnum):
    SIMPLE = "simple"
    GRAPH = "graph"
    AGENTIC = "agentic"
    HYBRID = "hybrid"
    CRAG = "crag"
    SELF_RAG = "self_rag"


class LLMProvider(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"


# ── Planning ───────────────────────────────────────────────────────────────────


class PlanningSessionStatus(StrEnum):
    """Status of a planner-agent interview session (distinct from PlanStatus)."""

    PENDING = "pending"
    INTERVIEWING = "interviewing"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    ACCEPTED = "accepted"
    REFUSED = "refused"


# ── Task ───────────────────────────────────────────────────────────────────────


class TaskType(StrEnum):
    CODE = "code"
    TEST = "test"
    REVIEW = "review"
    GENERAL = "general"
    KNOWLEDGE = "knowledge"
    INFRA = "infra"


class TaskStatus(StrEnum):
    PENDING = "pending"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"

    @property
    def is_terminal(self) -> bool:
        """True when no further progress is possible."""
        return self in (
            TaskStatus.DONE,
            TaskStatus.FAILED,
            TaskStatus.CANCELLED,
            TaskStatus.SKIPPED,
        )

    @property
    def is_retryable(self) -> bool:
        """True when the task can be retried."""
        return self in (TaskStatus.FAILED, TaskStatus.CANCELLED)

    @property
    def is_cancellable(self) -> bool:
        """True when the task can still be cancelled."""
        return self not in (TaskStatus.DONE, TaskStatus.CANCELLED, TaskStatus.SKIPPED)

    @property
    def is_skippable(self) -> bool:
        """True when a downstream task can be force-skipped."""
        return self in (TaskStatus.PENDING, TaskStatus.READY)


class ArtifactType(StrEnum):
    DIFF = "diff"
    TEST_RESULT = "test_result"
    REVIEW = "review"
    LOG = "log"
    FILE = "file"
    LINK = "link"


# ── Project ────────────────────────────────────────────────────────────────────


class ProjectStatus(StrEnum):
    PLANNING = "planning"
    EXECUTING = "executing"
    DONE = "done"


class ProjectRole(StrEnum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class PlanStatus(StrEnum):
    """Lifecycle status of an execution plan (the DB entity)."""

    DRAFT = "draft"
    CONFIRMED = "confirmed"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"


class PlanMessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


# ── Document ───────────────────────────────────────────────────────────────────


class DocumentFileType(StrEnum):
    PDF = "pdf"
    DOCX = "docx"
    XLSX = "xlsx"
    MD = "md"
    TXT = "txt"
    CSV = "csv"
    JSON = "json"
    OTHER = "other"


class DocumentStatus(StrEnum):
    UPLOADING = "uploading"
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


class DocumentActivityAction(StrEnum):
    CREATED = "created"
    VIEWED = "viewed"
    EDITED = "edited"
    COMMENTED = "commented"
    SHARED = "shared"
    DELETED = "deleted"
    RESTORED = "restored"
    VERSION_CREATED = "version_created"


class DocumentCommentAnchorType(StrEnum):
    PAGE = "page"
    CELL = "cell"
    TEXT_RANGE = "text_range"
    GENERAL = "general"


# ── User / Auth ────────────────────────────────────────────────────────────────


class SystemRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


# ── Repository ─────────────────────────────────────────────────────────────────


class RepositoryProviderType(StrEnum):
    GITHUB = "github"
    GITLAB = "gitlab"
    BITBUCKET = "bitbucket"
    GIT = "git"
    S3 = "s3"


class RepositoryAuthType(StrEnum):
    NONE = "none"
    TOKEN = "token"
    SSH = "ssh"


class RepositoryStatus(StrEnum):
    UNCONFIGURED = "unconfigured"
    CLONING = "cloning"
    READY = "ready"
    ERROR = "error"


# ── Workspace ──────────────────────────────────────────────────────────────────


class WorkspaceStatus(StrEnum):
    IDLE = "idle"
    STARTING = "starting"
    RUNNING = "running"
    SLEEPING = "sleeping"
    ERROR = "error"


# ── Environment ────────────────────────────────────────────────────────────────


class EnvironmentType(StrEnum):
    KUBERNETES = "kubernetes"
    DOCKER = "docker"


class EnvironmentStatus(StrEnum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"


class HelmReleaseStatus(StrEnum):
    PENDING = "pending"
    DEPLOYED = "deployed"
    FAILED = "failed"
    UNINSTALLED = "uninstalled"


# ── Agent / Library ────────────────────────────────────────────────────────────


class AgentRole(StrEnum):
    PLANNER = "planner"
    CODER = "coder"
    REVIEWER = "reviewer"
    TESTER = "tester"
    INFRA = "infra"
    KNOWLEDGE = "knowledge"
    CUSTOM = "custom"
    DOCUMENT_COPILOT = "document-copilot"


class AgentType(StrEnum):
    SYSTEM = "system"
    CUSTOM = "custom"


class SystemPromptMode(StrEnum):
    APPEND = "append"
    OVERRIDE = "override"
    EXTEND = "extend"


class McpTransport(StrEnum):
    STDIO = "stdio"
    STREAMABLE_HTTP = "streamable-http"


class McpToolPermission(StrEnum):
    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    REQUIRE_CONFIRMATION = "require-confirmation"


# ── Design Chat ────────────────────────────────────────────────────────────────


class DesignSessionStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class MessageSenderType(StrEnum):
    USER = "user"
    AGENT = "agent"


class ConversationSpecialist(StrEnum):
    QA = "qa"
    EXPLORER = "explorer"
    REVERSE = "reverse"
    PLANNER = "planner"
    CODER = "coder"
    DESIGNER = "designer"
    REVIEWER = "reviewer"


class DesignLayerType(StrEnum):
    ER_DIAGRAM = "er_diagram"
    UI_INTERFACE = "ui_interface"
    SYSTEM_ARCHITECTURE = "system_architecture"
    DATA_FLOW = "data_flow"
    API_SPEC = "api_spec"
    SEQUENCE_DIAGRAM = "sequence_diagram"
    GENERAL = "general"


class DesignMessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


# ── Infrastructure ─────────────────────────────────────────────────────────────


class K8sResourceKind(StrEnum):
    PODS = "pods"
    SERVICES = "services"
    DEPLOYMENTS = "deployments"
    CONFIGMAPS = "configmaps"
    SECRETS = "secrets"
    INGRESSES = "ingresses"
    PERSISTENT_VOLUME_CLAIMS = "persistentvolumeclaims"
    NAMESPACES = "namespaces"
    REPLICASETS = "replicasets"
    STATEFULSETS = "statefulsets"
    DAEMONSETS = "daemonsets"
    JOBS = "jobs"
    CRONJOBS = "cronjobs"


# ── UI Theme ───────────────────────────────────────────────────────────────────


class ThemeRadius(StrEnum):
    NONE = "none"
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"
    FULL = "full"


class ThemeShadow(StrEnum):
    NONE = "none"
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"


class ThemeFontFamily(StrEnum):
    SYSTEM = "system"
    INTER = "inter"
    ROBOTO = "roboto"
    HELVETICA = "helvetica"
    GEORGIA = "georgia"
    MONO = "mono"


class ThemePreset(StrEnum):
    DEFAULT = "default"
    CORPORATE = "corporate"
    MIDNIGHT = "midnight"
    WARM = "warm"
    MINIMAL = "minimal"
    OCEAN = "ocean"
    FOREST = "forest"
    SUNSET = "sunset"
