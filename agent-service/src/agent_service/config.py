from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


AGENT_SERVICE_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = AGENT_SERVICE_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PORT: int = Field(
        default=8000, validation_alias=AliasChoices("PORT", "AGENT_SERVICE_PORT")
    )
    DATA_API_URL: str = "http://localhost:3000"
    DATA_API_KEY: str = ""
    REDIS_URL: str = "redis://localhost:6379"
    ENCRYPTION_KEY: str = ""
    # Comma-separated list of allowed frontend origins for CORS.
    # Example: "http://localhost:5173,https://app.example.com"
    ALLOWED_ORIGINS: str = Field(
        default="",
        validation_alias=AliasChoices("ALLOWED_ORIGINS", "ALLOWED_ORIGIN"),
    )
    WORKSPACES_ROOT: str = "/tmp/telaios-workspaces"
    AGENT_POOL_SIZE: int = 3
    LLM_PROVIDER: str = "openai"
    LLM_MODEL: str = "gpt-4o"
    LLM_API_KEY: str = ""
    LLM_BASE_URL: Optional[str] = None

    # S3 / MinIO for document storage
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "sweai"
    S3_SECRET_KEY: str = "sweai-secret"
    S3_BUCKET: str = "sweai-documents"
    S3_REGION: str = "us-east-1"

    # Embeddings model (OpenAI-compatible or local fastembed)
    # Default: BAAI/bge-small-en-v1.5 (384-dim, no API key required)
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    # Optional separate API key / base URL for embeddings
    EMBEDDING_API_KEY: Optional[str] = None
    EMBEDDING_BASE_URL: Optional[str] = None
    # Embedding provider: "openai" | "voyage" | "" (auto-detect from key)
    # When using Voyage AI, set EMBEDDING_MODEL to the desired Voyage model
    # (e.g. "voyage-3-lite" for 512-dim or "voyage-3" for 1024-dim) and
    # set EMBEDDING_DIMENSION in data-api to the matching value.
    EMBEDDING_PROVIDER: str = ""

    MAX_CONCURRENT_TASKS: int = 1

    # PostgreSQL connection string — used by LangGraph AsyncPostgresSaver for plan checkpointing
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/sweai"

    @field_validator("MAX_CONCURRENT_TASKS", mode="before")
    @classmethod
    def _clamp_concurrent(cls, v: int) -> int:
        return max(1, int(v))


config = Settings()
