"""Pytest fixtures for modules integration tests.

One session-scoped PostgreSQL (pgvector) container is started per test run.
Alembic migrations are applied once.  Each test function gets all tables
cleared via an autouse ``clean_db`` fixture.

The ``client`` fixture provides a Starlette ``TestClient`` with
``get_session`` overridden to use the test database, and the user-loader
disabled (Phase 1 JWT-claims fallback) so tests don't need a live
production DB URL.

Usage in a test module::

    def test_register(client, db):
        res = client.post("/auth/register", json={...})
        assert res.status_code == 201
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable, Iterator

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from starlette.testclient import TestClient
from testcontainers.postgres import PostgresContainer

from telaios.auth.dependencies import set_user_loader
from telaios.db.session import get_session
from tests.helpers.db import (
    apply_migrations,
    asyncpg_url,
    make_engine,
    make_sessionmaker,
    truncate_all,
)

# ─── Container + schema setup (session-scoped) ────────────────────────────


@pytest.fixture(scope="session")
def pg_url() -> Iterator[str]:
    """Start a pgvector container and apply migrations once per test session."""
    with PostgresContainer("pgvector/pgvector:pg16") as pg:
        url = asyncpg_url(pg)
        apply_migrations(url)
        yield url


@pytest.fixture(scope="session")
def db_engine(pg_url: str) -> AsyncEngine:
    """Session-scoped async engine for the test database (NullPool)."""
    return make_engine(pg_url)


@pytest.fixture(scope="session")
def db_sessionmaker(db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Session-scoped ``async_sessionmaker`` for the test database."""
    return make_sessionmaker(db_engine)


# ─── Per-test isolation ───────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def clean_db(db_engine: AsyncEngine) -> None:
    """Truncate all tables before each test (mirrors TS ``beforeEach(clearAllTables)``)."""
    truncate_all(db_engine)


# ─── Sync DB helper ───────────────────────────────────────────────────────


@pytest.fixture
def db(db_sessionmaker: async_sessionmaker[AsyncSession]) -> Callable[..., object]:
    """Return a helper that runs an async factory coroutine synchronously.

    Usage::

        user = db(lambda s: create_user(s, email="alice@test.com"))
        project = db(lambda s: create_project(s, owner_id=user.id))
    """

    def _run(coro_fn: Callable[[AsyncSession], object]) -> object:
        async def _exec() -> object:
            async with db_sessionmaker() as session:
                result = await coro_fn(session)
                await session.commit()
                return result

        return asyncio.run(_exec())

    return _run


# ─── HTTP test client ─────────────────────────────────────────────────────


@pytest.fixture
def client(db_sessionmaker: async_sessionmaker[AsyncSession]) -> Iterator[TestClient]:
    """TestClient with ``get_session`` overridden to use the test database.

    The user-loader is disabled so JWT claims are resolved without a DB
    round-trip on every request (Phase 1 fallback).  Services still reach the
    test DB through the overridden ``get_session`` dependency.
    """

    async def _override_get_session() -> AsyncIterator[AsyncSession]:
        async with db_sessionmaker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
            else:
                await session.commit()

    from telaios.main import create_app

    app = create_app()
    app.dependency_overrides[get_session] = _override_get_session
    # Disable DB-backed user validation for tests; JWT claims are trusted.
    set_user_loader(None)

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
