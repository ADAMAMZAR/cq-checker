"""Tests for the RAG orchestrator."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.services import rag


@pytest.fixture
def mock_factory():
    """A get_session_factory() replacement yielding fresh sessions per call."""

    def _make_session():
        return AsyncMock()

    def _make_cm():
        cm = MagicMock()
        cm.__aenter__ = AsyncMock(side_effect=_make_session)
        cm.__aexit__ = AsyncMock(return_value=None)
        return cm

    factory = MagicMock(side_effect=_make_cm)
    return factory


@pytest.mark.asyncio
async def test_cache_hit_returns_cached(mock_factory):
    factory = mock_factory
    cached = MagicMock()
    cached.cached_response = "Cached answer"
    cached.query_text = "q"

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find:
                m_find.return_value = cached
                result = await rag.answer_query("question")

    assert result["answer"] == "Cached answer"
    assert result["cache_hit"] is True
    assert result["cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_cache_miss_calls_gemini_and_writes(mock_factory):
    factory = mock_factory
    results = [{
        "child_id": "c1", "child_content": "x", "parent_id": "p1",
        "parent_content": "Parent context about safety policy.",
        "page_number": 3, "document_id": "d1", "title": "Safety Manual",
        "combined_score": 0.9,
    }]

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find, \
                 patch("app.services.rag.hybrid_search", new_callable=AsyncMock) as m_search, \
                 patch("app.services.rag._call_gemini") as m_gemini, \
                 patch("app.repositories.cache.CacheRepository.put", new_callable=AsyncMock) as m_put, \
                 patch("app.config.settings.gemini_api_key", "g-test"):
                m_find.return_value = None
                m_search.return_value = results
                m_gemini.return_value = ("Answer from Gemini", 500, 100)

                result = await rag.answer_query("safety policy?")

    assert result["answer"] == "Answer from Gemini"
    assert result["cache_hit"] is False
    assert result["sources"][0]["title"] == "Safety Manual"
    assert result["sources"][0]["page_number"] == 3
    assert result["cost_usd"] > 0
    m_put.assert_awaited_once()


@pytest.mark.asyncio
async def test_fallback_without_gemini_key(mock_factory):
    factory = mock_factory
    results = [{
        "child_id": "c1", "child_content": "x", "parent_id": "p1",
        "parent_content": "Manual content here",
        "page_number": 1, "document_id": "d1", "title": "Manual",
        "combined_score": 0.8,
    }]

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find, \
                 patch("app.services.rag.hybrid_search", new_callable=AsyncMock) as m_search, \
                 patch("app.config.settings.gemini_api_key", ""):
                m_find.return_value = None
                m_search.return_value = results

                result = await rag.answer_query("query")

    assert "Manual" in result["answer"]
    assert result["cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_fallback_no_results(mock_factory):
    factory = mock_factory
    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find, \
                 patch("app.services.rag.hybrid_search", new_callable=AsyncMock) as m_search, \
                 patch("app.config.settings.gemini_api_key", ""):
                m_find.return_value = None
                m_search.return_value = []

                result = await rag.answer_query("query")

    assert "No relevant manuals" in result["answer"]


@pytest.mark.asyncio
async def test_clear_cache(mock_factory):
    factory = mock_factory
    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.repositories.cache.CacheRepository.clear_all", new_callable=AsyncMock) as m_clear:
            m_clear.return_value = 5
            count = await rag.clear_cache()
    assert count == 5


@pytest.mark.asyncio
async def test_get_history(mock_factory):
    factory = mock_factory
    m1 = MagicMock(role="user", content="hi", created_at=None)
    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.repositories.chat.ChatMessageRepository.recent", new_callable=AsyncMock) as m_recent:
            m_recent.return_value = [m1]
            history = await rag.get_history("sess-1")
    assert len(history) == 1
    assert history[0]["role"] == "user"


def _result(**kw):
    data = {
        "child_id": "c1", "child_content": "x", "parent_id": "p1",
        "parent_content": "Parent context about safety policy.",
        "page_number": 3, "document_id": "d1", "title": "Safety Manual",
        "file_url": "/api/files/local/manuals/safety.pdf",
        "combined_score": 0.9,
    }
    data.update(kw)
    return data


@pytest.mark.asyncio
async def test_cache_hit_stream_emits_single_event(mock_factory):
    factory = mock_factory
    cached = MagicMock()
    cached.cached_response = "Cached stream answer"

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find:
                m_find.return_value = cached
                events = [e async for e in rag.answer_query_stream("question")]

    assert events[0]["delta"] == "Cached stream answer"
    assert events[-1]["done"] is True
    assert events[-1]["cache_hit"] is True
    assert events[-1]["cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_stream_emits_deltas_and_sources(mock_factory):
    factory = mock_factory
    results = [_result()]

    stream_chunks = iter([
        ("Hello", None),
        (" world", None),
        ("", {"prompt_tokens": 10, "completion_tokens": 5}),
    ])

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find, \
                 patch("app.services.rag.hybrid_search", new_callable=AsyncMock) as m_search, \
                 patch("app.services.rag._iter_gemini_stream") as m_stream, \
                 patch("app.config.settings.gemini_api_key", "g-test"):
                m_find.return_value = None
                m_search.return_value = results
                m_stream.return_value = stream_chunks

                events = [e async for e in rag.answer_query_stream("safety policy?")]

    deltas = "".join(e["delta"] for e in events if "delta" in e)
    assert deltas == "Hello world"
    final = events[-1]
    assert final["done"] is True
    assert final["cache_hit"] is False
    assert final["cost_usd"] > 0
    assert final["sources"][0]["file_url"] == "/api/files/local/manuals/safety.pdf"
    assert final["sources"][0]["title"] == "Safety Manual"


@pytest.mark.asyncio
async def test_stream_fallback_without_gemini_key(mock_factory):
    factory = mock_factory
    results = [_result(parent_content="Manual content here")]

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find, \
                 patch("app.services.rag.hybrid_search", new_callable=AsyncMock) as m_search, \
                 patch("app.config.settings.gemini_api_key", ""):
                m_find.return_value = None
                m_search.return_value = results

                events = [e async for e in rag.answer_query_stream("query")]
        cm.__aexit__ = AsyncMock(return_value=None)
        return cm

    factory = MagicMock(side_effect=_make_cm)
    return factory


@pytest.mark.asyncio
async def test_cache_hit_returns_cached(mock_factory):
    factory = mock_factory
    cached = MagicMock()
    cached.cached_response = "Cached answer"
    cached.query_text = "q"

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find:
                m_find.return_value = cached
                result = await rag.answer_query("question")

    assert result["answer"] == "Cached answer"
    assert result["cache_hit"] is True
    assert result["cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_cache_miss_calls_gemini_and_writes(mock_factory):
    factory = mock_factory
    results = [{
        "child_id": "c1", "child_content": "x", "parent_id": "p1",
        "parent_content": "Parent context about safety policy.",
        "page_number": 3, "document_id": "d1", "title": "Safety Manual",
        "combined_score": 0.9,
    }]

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find, \
                 patch("app.services.rag.hybrid_search", new_callable=AsyncMock) as m_search, \
                 patch("app.services.rag._call_gemini") as m_gemini, \
                 patch("app.repositories.cache.CacheRepository.put", new_callable=AsyncMock) as m_put, \
                 patch("app.config.settings.gemini_api_key", "g-test"):
                m_find.return_value = None
                m_search.return_value = results
                m_gemini.return_value = ("Answer from Gemini", 500, 100)

                result = await rag.answer_query("safety policy?")

    assert result["answer"] == "Answer from Gemini"
    assert result["cache_hit"] is False
    assert result["sources"][0]["title"] == "Safety Manual"
    assert result["sources"][0]["page_number"] == 3
    assert result["cost_usd"] > 0
    m_put.assert_awaited_once()


@pytest.mark.asyncio
async def test_fallback_without_gemini_key(mock_factory):
    factory = mock_factory
    results = [{
        "child_id": "c1", "child_content": "x", "parent_id": "p1",
        "parent_content": "Manual content here",
        "page_number": 1, "document_id": "d1", "title": "Manual",
        "combined_score": 0.8,
    }]

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find, \
                 patch("app.services.rag.hybrid_search", new_callable=AsyncMock) as m_search, \
                 patch("app.config.settings.gemini_api_key", ""):
                m_find.return_value = None
                m_search.return_value = results

                result = await rag.answer_query("query")

    assert "Manual" in result["answer"]
    assert result["cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_fallback_no_results(mock_factory):
    factory = mock_factory
    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find, \
                 patch("app.services.rag.hybrid_search", new_callable=AsyncMock) as m_search, \
                 patch("app.config.settings.gemini_api_key", ""):
                m_find.return_value = None
                m_search.return_value = []

                result = await rag.answer_query("query")

    assert "No relevant manuals" in result["answer"]


@pytest.mark.asyncio
async def test_clear_cache(mock_factory):
    factory = mock_factory
    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.repositories.cache.CacheRepository.clear_all", new_callable=AsyncMock) as m_clear:
            m_clear.return_value = 5
            count = await rag.clear_cache()
    assert count == 5


@pytest.mark.asyncio
async def test_get_history(mock_factory):
    factory = mock_factory
    m1 = MagicMock(role="user", content="hi", created_at=None)
    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.repositories.chat.ChatMessageRepository.recent", new_callable=AsyncMock) as m_recent:
            m_recent.return_value = [m1]
            history = await rag.get_history("sess-1")
    assert len(history) == 1
    assert history[0]["role"] == "user"


def _result(**kw):
    data = {
        "child_id": "c1", "child_content": "x", "parent_id": "p1",
        "parent_content": "Parent context about safety policy.",
        "page_number": 3, "document_id": "d1", "title": "Safety Manual",
        "file_url": "/api/files/local/manuals/safety.pdf",
        "combined_score": 0.9,
    }
    data.update(kw)
    return data


@pytest.mark.asyncio
async def test_cache_hit_stream_emits_single_event(mock_factory):
    factory = mock_factory
    cached = MagicMock()
    cached.cached_response = "Cached stream answer"

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find:
                m_find.return_value = cached
                events = [e async for e in rag.answer_query_stream("question")]

    assert events[0]["delta"] == "Cached stream answer"
    assert events[-1]["done"] is True
    assert events[-1]["cache_hit"] is True
    assert events[-1]["cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_stream_emits_deltas_and_sources(mock_factory):
    factory = mock_factory
    results = [_result()]

    stream_chunks = iter([
        ("Hello", None),
        (" world", None),
        ("", {"prompt_tokens": 10, "completion_tokens": 5}),
    ])

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find, \
                 patch("app.services.rag.hybrid_search", new_callable=AsyncMock) as m_search, \
                 patch("app.services.rag._iter_gemini_stream") as m_stream, \
                 patch("app.config.settings.gemini_api_key", "g-test"):
                m_find.return_value = None
                m_search.return_value = results
                m_stream.return_value = stream_chunks

                events = [e async for e in rag.answer_query_stream("safety policy?")]

    deltas = "".join(e["delta"] for e in events if "delta" in e)
    assert deltas == "Hello world"
    final = events[-1]
    assert final["done"] is True
    assert final["cache_hit"] is False
    assert final["cost_usd"] > 0
    assert final["sources"][0]["file_url"] == "/api/files/local/manuals/safety.pdf"
    assert final["sources"][0]["title"] == "Safety Manual"


@pytest.mark.asyncio
async def test_stream_fallback_without_gemini_key(mock_factory):
    factory = mock_factory
    results = [_result(parent_content="Manual content here")]

    with patch("app.services.rag.get_session_factory", return_value=factory):
        with patch("app.services.embeddings.embed_text", return_value=[0.1] * 1536):
            with patch("app.repositories.cache.CacheRepository.find_cached", new_callable=AsyncMock) as m_find, \
                 patch("app.services.rag.hybrid_search", new_callable=AsyncMock) as m_search, \
                 patch("app.config.settings.gemini_api_key", ""):
                m_find.return_value = None
                m_search.return_value = results

                events = [e async for e in rag.answer_query_stream("query")]

    assert "Safety Manual" in events[0]["delta"]
    assert events[-1]["cost_usd"] == 0.0


def test_normalize_query():
    assert rag.normalize_query("Can you please tell me how to register a new vendor?") == "how to register a new vendor"
    assert rag.normalize_query("How do I submit an audit request?!") == "submit an audit request"
    assert rag.normalize_query("  what is the process to view certificates?  ") == "view certificates"
    assert rag.normalize_query("") == ""


def test_reindex_citations_deduplication():
    results = [
        {"title": "Safety Manual", "page_number": 3, "parent_content": "P3", "file_url": "/f1"},
        {"title": "Safety Manual", "page_number": 4, "parent_content": "P4", "file_url": "/f2"},
        {"title": "QA Manual", "page_number": 1, "parent_content": "P1", "file_url": "/f3"},
        {"title": "Safety Manual", "page_number": 3, "parent_content": "P3 dup", "file_url": "/f1"},
    ]
    answer = "Refer to [1] and also [4] for details."
    reindexed, sources = rag._reindex_citations(answer, results)

    assert reindexed == "Refer to [1] and also [1] for details."
    assert len(sources) == 1
    assert sources[0]["title"] == "Safety Manual"
    assert sources[0]["page_number"] == 3
