"""Tests for hybrid retrieval SQL (mocked session)."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import AsyncMock, MagicMock
import pytest
from app.repositories.retrieval import hybrid_search


def _row(**kw):
    defaults = {
        "child_id": "c1", "child_content": "child text",
        "parent_id": "p1", "parent_content": "parent text",
        "page_number": 2, "document_id": "d1", "title": "Manual",
        "file_url": "/api/files/local/manuals/manual.pdf",
        "combined_score": 0.85,
    }
    defaults.update(kw)
    return MagicMock(**{k: v for k, v in defaults.items()})


@pytest.mark.asyncio
async def test_hybrid_search_returns_rows():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.__iter__ = MagicMock(return_value=iter([
        _row(), _row(child_id="c2", combined_score=0.7)
    ]))
    mock_session.execute.return_value = mock_result

    rows = await hybrid_search(mock_session, [0.1] * 1536, "what is policy", k=3)
    assert len(rows) == 2
    assert rows[0]["title"] == "Manual"
    assert rows[0]["page_number"] == 2
    assert rows[0]["file_url"] == "/api/files/local/manuals/manual.pdf"
    assert rows[0]["combined_score"] == 0.85


@pytest.mark.asyncio
async def test_hybrid_search_empty():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.__iter__ = MagicMock(return_value=iter([]))
    mock_session.execute.return_value = mock_result

    rows = await hybrid_search(mock_session, [0.1] * 1536, "nothing", k=3)
    assert rows == []
