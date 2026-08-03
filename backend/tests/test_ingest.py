"""Tests for the document ingestion orchestrator."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.services.ingest import ingest_document, _compute_hash, IngestResult


def test_compute_hash_stable():
    assert _compute_hash(b"abc") == _compute_hash(b"abc")
    assert _compute_hash(b"abc") != _compute_hash(b"abd")


@pytest.mark.asyncio
async def test_ingest_skips_when_hash_exists():
    existing = MagicMock()
    existing.id = "11111111-2222-3333-4444-555555555555"

    mock_session = MagicMock()
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch("app.db.session.get_session_factory", return_value=mock_factory):
        with patch("app.repositories.documents.DocumentRepository.get_by_hash", new_callable=AsyncMock) as m_get:
            m_get.return_value = existing
            result = await ingest_document(b"data", "Manual", "manual.pdf", "application/pdf")

    assert result.status == "skipped"
    assert result.document_id == existing.id


@pytest.mark.asyncio
async def test_ingest_upload_failure_returns_failed():
    mock_session = MagicMock()
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch("app.db.session.get_session_factory", return_value=mock_factory):
        with patch("app.repositories.documents.DocumentRepository.get_by_hash", new_callable=AsyncMock) as m_get:
            m_get.return_value = None
            with patch("app.services.storage.get_storage") as m_storage:
                m_storage.return_value.upload.return_value = None
                result = await ingest_document(b"data", "Manual", "manual.pdf", "application/pdf")

    assert result.status == "failed"
    assert "Upload" in result.message


@pytest.mark.asyncio
async def test_ingest_parse_failure_returns_failed():
    mock_session = MagicMock()
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch("app.db.session.get_session_factory", return_value=mock_factory):
        with patch("app.repositories.documents.DocumentRepository.get_by_hash", new_callable=AsyncMock) as m_get:
            m_get.return_value = None
            with patch("app.services.storage.get_storage") as m_storage:
                m_storage.return_value.upload.return_value = "/api/files/local/m.pdf"
                with patch("app.services.parser.parse_pdf_to_markdown", return_value=([], 0, 0, 0.0)):
                    result = await ingest_document(b"data", "Manual", "manual.pdf", "application/pdf")

    assert result.status == "failed"
    assert "parseable" in result.message.lower()


@pytest.mark.asyncio
async def test_ingest_created_path():
    doc = MagicMock()
    doc.id = "22222222-2222-3333-4444-555555555555"
    parent = MagicMock()
    parent.id = "33333333-2222-3333-4444-555555555555"

    mock_session = MagicMock()
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch("app.db.session.get_session_factory", return_value=mock_factory):
        with patch("app.repositories.documents.DocumentRepository.get_by_hash", new_callable=AsyncMock) as m_get, \
             patch("app.services.storage.get_storage") as m_storage, \
             patch("app.services.parser.parse_pdf_to_markdown") as m_parse, \
             patch("app.services.embeddings.embed_texts") as m_embed, \
             patch("app.repositories.documents.DocumentRepository.create", new_callable=AsyncMock) as m_create, \
             patch("app.repositories.documents.ChunkRepository.create_parent", new_callable=AsyncMock) as m_cp, \
             patch("app.repositories.documents.ChunkRepository.create_child", new_callable=AsyncMock) as m_cc, \
             patch("app.repositories.documents.ChunkRepository.count_by_document", new_callable=AsyncMock) as m_count:
            m_get.return_value = None
            m_storage.return_value.upload.return_value = "/api/files/local/manual.pdf"
            m_parse.return_value = ([{"page_number": 1, "text": "Some manual text here that is long enough for chunking." * 20}], 100, 50, 0.0001)
            m_embed.return_value = [[0.1] * 1536]
            m_create.return_value = doc
            m_cp.return_value = parent
            m_count.return_value = {"parent_chunks": 1, "child_chunks": 1}
            result = await ingest_document(b"data", "Manual", "manual.pdf", "application/pdf")

    assert result.status == "created"
    assert result.document_id == doc.id
    assert result.parent_count == 1
    assert result.child_count == 1


def test_ingest_result_to_dict():
    r = IngestResult("abc", "T", "created", parent_count=2, child_count=3, cost_usd=0.5)
    d = r.to_dict()
    assert d["document_id"] == "abc"
    assert d["parent_count"] == 2
    assert d["child_count"] == 3
