"""
infra/settings.py
-----------------
Application settings using pydantic-settings.

This is the single source of truth for all configuration values.

Usage::

    from config.settings import config

    print(config.PORT)
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Locate the project root (two levels up from this file).
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _PROJECT_ROOT / ".env"

class Settings(BaseSettings):
    # load config from .env file in project root, but ignore any extra values (e.g. for other services)
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    PORT: int = 8000
    DATA_API_URL: str = "http://localhost:3000"
    DATA_API_KEY: str = ""

    # Redis settings
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = 0
    REDIS_USERNAME: str = ""
    ENCRYPTION_KEY: str = ""

    # Body size limit
    MAX_BODY_SIZE: int = 10  # 10 MB

    # CORS settings
    ALLOWED_ORIGINS: str = ""
    ALLOWED_METHODS: str = ""
    ALLOWED_HEADERS: str = ""

    # S3 / MinIO for document storage
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "sweai"
    S3_SECRET_KEY: str = "sweai-secret"
    S3_BUCKET: str = "sweai-documents"
    S3_REGION: str = "us-east-1"

    # PostgreSQL connection
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/sweai"


config = Settings()
