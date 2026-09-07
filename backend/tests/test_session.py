import pytest
from app.db.session import get_engine, close_engine


@pytest.mark.asyncio
async def test_database_engine_pool_settings():
    """Verify that SQLAlchemy engine pool is tuned for Neon serverless auto-suspend."""
    await close_engine()
    engine = get_engine()
    pool = engine.pool

    # Verify right-sized connection count
    assert pool.size() == 3
    assert pool._max_overflow == 5

    # Verify 5-minute auto-suspend recycle and liveness pre-ping
    assert pool._recycle == 300
    assert pool._pre_ping is True

    await close_engine()
