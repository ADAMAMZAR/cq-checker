"""Unit tests for cache TTL/hit-count and legacy timestamp conversion."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
import pytest


# ── Cache: TTL filter + hit counting + lazy eviction ─────────────────────────

@pytest.mark.asyncio
async def test_find_cached_adds_ttl_clause():
    from app.repositories.cache import CacheRepository

    mock_session = AsyncMock()
    row = MagicMock()
    row.__getitem__ = lambda self, i: [1, "q", "answer", datetime.now(timezone.utc), 3][i]
    mock_result = MagicMock()
    mock_result.fetchone.return_value = row
    mock_session.execute.return_value = mock_result

    repo = CacheRepository(mock_session)
    found = await repo.find_cached([0.1] * 1536, threshold=0.93, ttl_days=30)

    select_sql = mock_session.execute.call_args_list[0][0][0]
    assert "make_interval(days => :ttl_days)" in str(select_sql)
    assert found.cached_response == "answer"
    assert found.hit_count == 3
    # hit_count increment + commit
    assert mock_session.execute.call_count == 2
    mock_session.commit.assert_called()


@pytest.mark.asyncio
async def test_find_cached_no_ttl_when_none():
    from app.repositories.cache import CacheRepository

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.fetchone.return_value = None
    mock_session.execute.return_value = mock_result

    repo = CacheRepository(mock_session)
    found = await repo.find_cached([0.1] * 1536, threshold=0.93, ttl_days=None)

    sql = mock_session.execute.call_args[0][0]
    assert "make_interval" not in str(sql)
    assert found is None


@pytest.mark.asyncio
async def test_evict_expired_uses_config_ttl():
    from app.repositories.cache import CacheRepository

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.rowcount = 5
    mock_session.execute.return_value = mock_result

    with patch("app.config.settings.query_cache_ttl_days", 30):
        repo = CacheRepository(mock_session)
        n = await repo._evict_expired()

    sql = mock_session.execute.call_args[0][0]
    assert "DELETE FROM query_cache" in str(sql)
    assert "make_interval" in str(sql)
    assert n == 5


# ── Timestamp conversion helpers ─────────────────────────────────────────────

def test_to_db_timestamp_legacy_format_keeps_wallclock():
    from app.services.audit_data_access import _to_db_timestamp, _display_timestamp

    dt = _to_db_timestamp("04/08/2026, 09:30:00")
    assert dt is not None
    assert _display_timestamp(dt) == "04/08/2026, 09:30:00"


def test_to_db_timestamp_iso_format():
    from app.services.audit_data_access import _to_db_timestamp, _display_timestamp

    dt = _to_db_timestamp("2026-07-20T16:29:15+00:00")
    assert dt is not None
    # ISO instant is preserved; display converts to local UTC+8 wall-clock.
    assert _display_timestamp(dt) == "21/07/2026, 00:29:15"


def test_display_timestamp_naive_and_none():
    from app.services.audit_data_access import _display_timestamp

    assert _display_timestamp(None) == ""
    dt = datetime(2026, 8, 4, 9, 30, 0)
    assert _display_timestamp(dt) == "04/08/2026, 09:30:00"
