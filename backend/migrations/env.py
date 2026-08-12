import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

# Import all models so Alembic can detect them for autogenerate
from app.models.tables import (  # noqa: F401
    Document,
    DocumentPage,
    CertificateVerification,
    QueryCache,
    User,
    ChatSession,
    ChatMessage,
    ChatLog,
    Supplier,
    AuditLog,
    DocumentEvidence,
    ObjectStorage,
)
from app.db.session import Base, normalize_database_url

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url():
    """Get the database URL from env or alembic.ini (libpq params normalized for asyncpg)."""
    raw = os.getenv(
        "NEON_DATABASE_URL",
        config.get_main_option("sqlalchemy.url", "postgresql+asyncpg://postgres:postgres@localhost:5432/cq_checker"),
    )
    return normalize_database_url(raw)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode with async engine."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
