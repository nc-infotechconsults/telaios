"""Shared DB helpers for integration tests.

Utilities that require no FastAPI / application knowledge — just SQLAlchemy +
testcontainers + Alembic.
"""

from __future__ import annotations

import asyncio

from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from alembic import command


def asyncpg_url(pg: PostgresContainer) -> str:
    """Convert a testcontainers connection URL to the asyncpg dialect."""
    return pg.get_connection_url().replace("postgresql+psycopg2://", "postgresql+asyncpg://")


def apply_migrations(db_url: str) -> None:
    """Run ``alembic upgrade head`` against ``db_url``."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(cfg, "head")


def make_engine(db_url: str) -> AsyncEngine:
    """Create a non-pooled async engine for the test database.

    ``NullPool`` is required because tests call ``asyncio.run()`` multiple
    times (once per ``db()`` invocation and once per ``truncate_all``).
    asyncpg connections are bound to the event loop they were created in, so
    a standard pool would raise ``RuntimeError: got Future attached to a
    different loop`` on the second ``asyncio.run`` call.  With ``NullPool``
    every operation opens and closes a fresh connection in the current loop.
    """
    return create_async_engine(db_url, echo=False, poolclass=NullPool)


def make_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Return an ``async_sessionmaker`` bound to the given engine."""
    return async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


async def _truncate_all(engine: AsyncEngine) -> None:
    """TRUNCATE every ORM-mapped table with CASCADE."""
    # Import models so Base.metadata is fully populated.
    import telaios.db.models  # noqa: F401
    from telaios.db.base import Base

    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(text(f'TRUNCATE "{table.name}" RESTART IDENTITY CASCADE'))


def truncate_all(engine: AsyncEngine) -> None:
    """Synchronous wrapper around :func:`_truncate_all`.

    Safe to call from pytest fixtures (outside a running event loop).
    """
    asyncio.run(_truncate_all(engine))


__all__ = [
    "apply_migrations",
    "asyncpg_url",
    "make_engine",
    "make_sessionmaker",
    "truncate_all",
]
