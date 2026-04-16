from __future__ import annotations

import os
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PORT: int = 8000
    DATA_API_URL: str = "http://localhost:3000"
    DATA_API_KEY: str = ""
    REDIS_URL: str = "redis://localhost:6379"
    ENCRYPTION_KEY: str = "default-key-change-in-production!"
    WORKSPACES_ROOT: str = "/tmp/swe-ai-workspaces"
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

    MAX_CONCURRENT_TASKS: int = 1

    @field_validator("MAX_CONCURRENT_TASKS", mode="before")
    @classmethod
    def _clamp_concurrent(cls, v: int) -> int:
        return max(1, int(v))


config = Settings()
