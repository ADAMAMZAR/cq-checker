"""Async database session factory for Neon PostgreSQL."""

from urllib.parse import urlsplit, urlunsplit, parse_qsl

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


def normalize_database_url(url: str) -> str:
    """Convert libpq-style URL params to asyncpg-compatible ones.

    Neon's dashboard connection string ships libpq-only params such as
    ``?sslmode=require`` and ``?channel_binding=require``, which the asyncpg
    driver rejects. asyncpg only understands ``ssl=require``. We drop all
    query params and keep just SSL when it was requested.
    """
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    params = []
    if any(k in query for k in ("sslmode", "ssl", "sslcert")) or "ssl" in query:
        params.append("ssl=require")
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "&".join(params), parts.fragment))


_engine = None
_session_factory = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            normalize_database_url(
                settings.neon_database_url or "postgresql+asyncpg://postgres:postgres@localhost:5432/cq_checker"
            ),
            echo=False,
            pool_size=3,
            max_overflow=5,
            pool_recycle=300,
            pool_pre_ping=True,
        )
    return _engine


def get_session_factory():

    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_db() -> AsyncSession:
    """FastAPI dependency: yield an async session, ensure close on exit."""
    factory = get_session_factory()
    async with factory() as session:
        yield session


async def close_engine():
    """Dispose of the engine pool (useful for test teardown)."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
