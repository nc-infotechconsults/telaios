"""Alembic environment — async SQLAlchemy + telaios settings.

Resolves the DB URL from :mod:`telaios.config.settings` and uses
``async_engine_from_config`` per Alembic's async cookbook recipe. Models are
imported via :mod:`telaios.db.models` so ``Base.metadata`` is fully populated.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Importing the registry attaches every ORM class to ``Base.metadata``.
import telaios.db.models  # noqa: F401  (side-effect import)
from alembic import context
from telaios.config.settings import settings
from telaios.db.base import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Inject the runtime DB URL.
# Allow tests or external callers to override by pre-setting `sqlalchemy.url`
# on the config object; only fall back to application settings when unset.
_configured_url = config.get_main_option("sqlalchemy.url")
config.set_main_option(
    "sqlalchemy.url",
    _configured_url if _configured_url else settings.DATABASE_URL,
)

target_metadata = Base.metadata


def _include_object(object_: object, name: str | None, type_: str, *_args: object) -> bool:
    """Skip pgvector's internal helper tables, if any leak into autogenerate."""
    return not (type_ == "table" and name and name.startswith("pg_"))


def run_migrations_offline() -> None:
    """Generate SQL without a live DB connection."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=_include_object,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=_include_object,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def _run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(_do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(_run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
