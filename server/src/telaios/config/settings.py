"""Application settings — single source of truth for configuration.

Loads values from environment variables and the project-root ``.env`` file.

Usage::

    from telaios.config.settings import settings

    print(settings.PORT)
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root = three levels up from src/telaios/config/settings.py
#   .../server/src/telaios/config/settings.py
#   parents[0] = config/
#   parents[1] = telaios/
#   parents[2] = src/
#   parents[3] = server/
#   parents[4] = <repo root>
_REPO_ROOT = Path(__file__).resolve().parents[4]
_ENV_FILE = _REPO_ROOT / ".env"


class Settings(BaseSettings):
    """Merged settings for the telaios monolith.

    Sources (legacy):
      - ``data-api/.env`` (TS backend): DATABASE_URL, JWT_SECRET, INTERNAL_API_KEY, S3_*, ENCRYPTION_KEY, ADMIN_*, ALLOWED_ORIGIN
      - ``agent-service/.env`` (Python service): REDIS_URL, AGENT_SERVICE_PORT, LLM_*, EMBEDDING_*, WORKSPACES_ROOT, AGENT_POOL_SIZE
    """

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # ─── Runtime ──────────────────────────────────────────────────────────
    ENVIRONMENT: str = Field(default="development")
    LOG_LEVEL: str = Field(default="INFO")
    PORT: int = Field(
        default=8000,
        validation_alias=AliasChoices("PORT", "AGENT_SERVICE_PORT"),
    )
    ALLOWED_ORIGINS: str = Field(
        default="http://localhost:5173",
        validation_alias=AliasChoices("ALLOWED_ORIGINS", "ALLOWED_ORIGIN"),
    )

    # Slim-deploy: comma-separated list of modules to mount.
    # Empty string = mount all available modules.
    TELAIOS_MODULES: str = Field(default="")

    # ─── Auth & crypto ────────────────────────────────────────────────────
    JWT_SECRET: str = Field(default="change-me-in-production-use-env-var")  # ≥ 32 bytes
    JWT_ALGORITHM: str = Field(default="HS256")
    JWT_EXPIRES_IN_SECONDS: int = Field(default=7 * 24 * 60 * 60)  # 7 days
    INTERNAL_API_KEY: str = Field(default="")
    ENCRYPTION_KEY: str = Field(default="")

    # First-run admin seeding (used by Phase 4 user bootstrap).
    ADMIN_EMAIL: str = Field(default="admin@telaios.dev")
    ADMIN_PASSWORD: str = Field(default="admin1234")
    ADMIN_DISPLAY_NAME: str = Field(default="Admin")

    # ─── Database ─────────────────────────────────────────────────────────
    # SQLAlchemy async URL — driver must be asyncpg.
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://telaios:telaios@localhost:5432/telaios",
    )
    DATABASE_ECHO: bool = Field(default=False)
    DATABASE_POOL_SIZE: int = Field(default=10)
    DATABASE_MAX_OVERFLOW: int = Field(default=20)

    # ─── Redis ────────────────────────────────────────────────────────────
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # ─── S3 / MinIO ───────────────────────────────────────────────────────
    S3_ENDPOINT: str = Field(default="http://localhost:9000")
    S3_ACCESS_KEY: str = Field(default="telaios")
    S3_SECRET_KEY: str = Field(default="telaios-secret")
    S3_BUCKET: str = Field(default="telaios-documents")
    S3_REGION: str = Field(default="us-east-1")
    S3_FORCE_PATH_STYLE: bool = Field(default=True)

    # ─── LLM (planning agent fallback) ────────────────────────────────────
    LLM_PROVIDER: str = Field(default="openai")
    LLM_MODEL: str = Field(default="gpt-4o")
    LLM_API_KEY: str = Field(default="")
    LLM_BASE_URL: str | None = Field(default=None)

    # ─── Embeddings ───────────────────────────────────────────────────────
    EMBEDDING_PROVIDER: str = Field(default="")
    EMBEDDING_MODEL: str = Field(default="BAAI/bge-small-en-v1.5")
    EMBEDDING_API_KEY: str | None = Field(default=None)
    EMBEDDING_BASE_URL: str | None = Field(default=None)
    # pgvector dimension for ``document_chunks.embedding``.
    # Defaults match BAAI/bge-small-en-v1.5 (fastembed) at 384. Set to:
    #   384  — BAAI/bge-small-en-v1.5
    #   768  — BAAI/bge-base-en-v1.5
    #   1024 — voyage-3-lite / voyage-3.5-lite
    #   1536 — text-embedding-3-small, text-embedding-ada-002 (OpenAI)
    #   3072 — text-embedding-3-large (OpenAI)
    # Changing this requires a manual ALTER TABLE + HNSW rebuild (see legacy migration 1777200000000).
    EMBEDDING_DIM: int = Field(default=384)

    # ─── Workspaces / agents ──────────────────────────────────────────────
    WORKSPACES_ROOT: str = Field(default="/tmp/telaios-workspaces")
    AGENT_POOL_SIZE: int = Field(default=3)
    MAX_CONCURRENT_TASKS: int = Field(default=1)

    # ─── Container infra ──────────────────────────────────────────────────
    DOCKER_HOST: str | None = Field(default=None)
    KUBECONFIG: str | None = Field(default=None)
    HELM_BIN: str = Field(default="helm")

    # ─── Skills ───────────────────────────────────────────────────────────
    SKILLS_DIRECTORY: str = Field(default=str(_REPO_ROOT / "skills"))
    SKILLS_AUTOLOAD: bool = Field(default=True)
    SKILLS_EXTRA_PATHS: str = Field(default="")

    # ─── Validators ───────────────────────────────────────────────────────
    @field_validator("MAX_CONCURRENT_TASKS", "AGENT_POOL_SIZE", mode="before")
    @classmethod
    def _clamp_positive(cls, v: int | str) -> int:
        return max(1, int(v))

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def _normalize_env(cls, v: str) -> str:
        return str(v).lower().strip() or "development"

    @field_validator("LOG_LEVEL", mode="before")
    @classmethod
    def _normalize_log_level(cls, v: str) -> str:
        return str(v).upper().strip() or "INFO"

    # ─── Derived helpers ──────────────────────────────────────────────────
    @property
    def allowed_origins_list(self) -> list[str]:
        """Return ALLOWED_ORIGINS as a parsed, stripped list."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached settings singleton.

    Use this inside FastAPI dependencies. Tests can clear the cache via
    ``get_settings.cache_clear()``.
    """
    return Settings()


# Convenience module-level singleton for non-DI access.
settings: Settings = get_settings()
