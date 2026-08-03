"""Tests for chat session/message/log repositories (mocked session)."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import AsyncMock, MagicMock
import pytest
from app.repositories.chat import (
    ChatSessionRepository, ChatMessageRepository, ChatLogRepository,
)


@pytest.mark.asyncio
async def test_get_or_create_creates_new():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    repo = ChatSessionRepository(mock_session)
    record = await repo.get_or_create("sess-1")
    assert record.session_id == "sess-1"
    mock_session.add.assert_called_once()


@pytest.mark.asyncio
async def test_get_or_create_returns_existing():
    existing = MagicMock()
    existing.session_id = "sess-1"
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing
    mock_session.execute.return_value = mock_result

    repo = ChatSessionRepository(mock_session)
    record = await repo.get_or_create("sess-1")
    assert record.session_id == "sess-1"
    mock_session.add.assert_not_called()


@pytest.mark.asyncio
async def test_add_message():
    mock_session = AsyncMock()
    repo = ChatMessageRepository(mock_session)
    msg = await repo.add("sess-1", "user", "hello")
    assert msg.role == "user"
    assert msg.content == "hello"
    mock_session.add.assert_called_once()


@pytest.mark.asyncio
async def test_recent_messages():
    m1 = MagicMock(role="user", content="hi", created_at=None)
    m2 = MagicMock(role="assistant", content="hello!", created_at=None)
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [m1, m2]
    mock_session.execute.return_value = mock_result

    repo = ChatMessageRepository(mock_session)
    msgs = await repo.recent("sess-1", limit=10)
    assert len(msgs) == 2


@pytest.mark.asyncio
async def test_add_log():
    mock_session = AsyncMock()
    repo = ChatLogRepository(mock_session)
    log = await repo.add("q", 100, 50, 0.0001, cache_hit=True, latency_ms=120)
    assert log.cache_hit == 1
    assert log.input_tokens == 100
    mock_session.add.assert_called_once()
