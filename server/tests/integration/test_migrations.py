"""Integration tests for Alembic migrations.

Spins up a temporary PostgreSQL container (via testcontainers), applies
``upgrade head``, asserts all 28 expected tables exist, then runs
``downgrade base`` and asserts they are gone.

Marked with ``integration`` so they can be skipped in fast-only runs:
    pytest -m "not integration"
"""

from __future__ import annotations

import asyncio

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from testcontainers.postgres import PostgresContainer

from alembic import command

# ---------------------------------------------------------------------------
# The 28 application tables that the baseline migration must create.
# ---------------------------------------------------------------------------
EXPECTED_TABLES: set[str] = {
    "document_activities",
    "document_chunks",
    "document_comments",
    "document_favorites",
    "document_folders",
    "document_tags",
    "document_templates",
    "document_versions",
    "documents",
    "environments",
    "helm_releases",
    "library_agents",
    "library_mcps",
    "library_skill_files",
    "library_skills",
    "messages",
    "plans",
    "project_agents",
    "project_members",
    "projects",
    "repositories",
    "settings",
    "task_artifacts",
    "task_dependencies",
    "task_repositories",
    "tasks",
    "users",
    "workspaces",
}


@pytest.fixture(scope="module")
def pg_container():
    """Start a pgvector-enabled PostgreSQL container for the test module."""
    with PostgresContainer("pgvector/pgvector:pg16") as pg:
        yield pg


def _asyncpg_url(pg: PostgresContainer) -> str:
    """Build an asyncpg-dialect URL from the container's JDBC-style connection."""
    # get_connection_url() returns postgresql+psycopg2://...; swap the driver.
    return pg.get_connection_url().replace("postgresql+psycopg2://", "postgresql+asyncpg://")


def _alembic_cfg(asyncpg_url: str) -> Config:
    """Build an Alembic Config pointing at the test database."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", asyncpg_url)
    return cfg


def _get_tables(asyncpg_url: str) -> set[str]:
    """Return the set of table names visible in the public schema."""

    async def _fetch() -> set[str]:
        engine = create_async_engine(asyncpg_url, echo=False)
        async with engine.connect() as conn:
            result = await conn.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            )
            tables = {row[0] for row in result.fetchall()}
        await engine.dispose()
        return tables

    return asyncio.run(_fetch())


def _index_exists(asyncpg_url: str, index_name: str, table_name: str) -> bool:
    """Return True if the named index exists on the given table."""

    async def _fetch() -> bool:
        engine = create_async_engine(asyncpg_url, echo=False)
        async with engine.connect() as conn:
            result = await conn.execute(
                text("SELECT 1 FROM pg_indexes WHERE tablename = :t AND indexname = :i"),
                {"t": table_name, "i": index_name},
            )
            found = result.fetchone() is not None
        await engine.dispose()
        return found

    return asyncio.run(_fetch())


@pytest.mark.integration
def test_upgrade_creates_all_tables(pg_container: PostgresContainer) -> None:
    """upgrade head must create every expected table."""
    url = _asyncpg_url(pg_container)
    command.upgrade(_alembic_cfg(url), "head")

    existing = _get_tables(url)
    assert existing >= EXPECTED_TABLES, (
        f"Missing tables after upgrade: {EXPECTED_TABLES - existing}"
    )


@pytest.mark.integration
def test_hnsw_index_created(pg_container: PostgresContainer) -> None:
    """The HNSW vector index must exist after upgrade head."""
    url = _asyncpg_url(pg_container)
    assert _index_exists(url, "idx_document_chunks_embedding", "document_chunks"), (
        "HNSW index idx_document_chunks_embedding not found after upgrade"
    )


@pytest.mark.integration
def test_downgrade_removes_all_tables(pg_container: PostgresContainer) -> None:
    """downgrade base must remove every application table."""
    url = _asyncpg_url(pg_container)
    command.downgrade(_alembic_cfg(url), "base")

    existing = _get_tables(url)
    leftover = EXPECTED_TABLES & existing
    assert not leftover, f"Tables still present after downgrade: {leftover}"
