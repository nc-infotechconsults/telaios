"""Async SQLAlchemy engine and session management.

Exports:
  - :func:`get_engine`     — cached ``AsyncEngine`` singleton
  - :func:`get_sessionmaker` — cached ``async_sessionmaker``
  - :func:`get_session`    — FastAPI dependency yielding an ``AsyncSession``
  - :func:`dispose_engine` — call from app shutdown lifespan

The DATABASE_URL must use the ``postgresql+asyncpg://`` dialect.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from telaios.config.settings import settings


@lru_cache(maxsize=1)
def get_engine() -> AsyncEngine:
    """Return the process-wide async engine singleton."""
    return create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DATABASE_ECHO,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        pool_pre_ping=True,
        future=True,
    )


@lru_cache(maxsize=1)
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Return the process-wide ``async_sessionmaker`` singleton."""
    return async_sessionmaker(
        bind=get_engine(),
        expire_on_commit=False,
        autoflush=False,
        class_=AsyncSession,
    )


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency that yields a transactional ``AsyncSession``.

    Commits on success, rolls back on exception, always closes.
    """
    sm = get_sessionmaker()
    async with sm() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()


async def dispose_engine() -> None:
    """Dispose the engine — call this from FastAPI lifespan shutdown."""
    engine = get_engine()
    await engine.dispose()
    get_engine.cache_clear()
    get_sessionmaker.cache_clear()
