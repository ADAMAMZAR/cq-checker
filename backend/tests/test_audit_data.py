"""Unit tests for the audit_data service (pure logic + mocked DB session)."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.schemas import AuditLogEntry, DocumentEvidence


@pytest.fixture
def mock_session():
    """Context manager yielding a mocked async session."""
    session = AsyncMock()
    return session


def make_log_entry() -> AuditLogEntry:
    return AuditLogEntry(
        audit_id="AUDIT_0001",
        supplier_id=1,
        created_at="01/01/2026, 10:00:00",
        timestamp="01/01/2026, 10:00:00",
        supplier_name="ACME Corp",
        workspace_title="Workspace",
        cert_type="QSHE",
        complete_qa_data_dump="[]",
        compiled_extracted_data='[{"extracted_data": {"expirationDate": "31/12/2029", "certificateType": "QSHE"}}]',
        result="Match",
        suggested_comment="OK",
    )


def test_to_audit_log_entry_extracts_expiry():
    """_to_audit_log_entry should pull expirationDate/certType from compiled data."""
    from app.services.audit_data_access import _to_audit_log_entry
    from app.models.tables import AuditLog

    model = AuditLog(
        audit_id="AUDIT_0001",
        supplier_id=1,
        created_at="01/01/2026, 10:00:00",
        supplier_name="ACME Corp",
        compiled_extracted_data='[{"extracted_data": {"expirationDate": "31/12/2029", "certificateType": "ISO 9001"}}]',
        result="Match",
        suggested_comment="OK",
    )
    entry = _to_audit_log_entry(model)
    assert entry.expiration_date == "31/12/2029"
    assert entry.cert_type == "ISO 9001"
    assert entry.audit_id == "AUDIT_0001"


def test_to_document_evidence():
    from app.services.audit_data_access import _to_document_evidence
    from app.models.tables import DocumentEvidence as NeonDocumentEvidence

    model = NeonDocumentEvidence(
        audit_id="AUDIT_0001",
        supplier_id=1,
        created_at="now",
        supplier_name="ACME Corp",
        filename="cert.pdf",
        ariba_question_label="1.1",
        ariba_qa_answers="[]",
        gemini_extracted_supplier_name="ACME Corp",
        gemini_extracted_metadata="{}",
        file_content_type="application/pdf",
        input_tokens=100,
        output_tokens=20,
        cost_usd=5,
        file_hash="abc",
        file_url="http://x/y.pdf",
    )
    ev = _to_document_evidence(model)
    assert ev.audit_id == "AUDIT_0001"
    assert ev.filename == "cert.pdf"
    assert ev.file_url == "http://x/y.pdf"


@pytest.mark.asyncio
async def test_get_audit_logs_with_id():
    """get_audit_logs(audit_id) returns a single mapped entry or [] when missing."""
    from app.services import audit_data_access as audit_data

    # Missing -> []
    with patch("app.services.audit_data_access.get_session_factory") as mock_factory:
        mock_factory.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
        mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
        # repo.get_by_audit_id returns None
        with patch("app.services.audit_data_access.AuditLogRepository.get_by_audit_id", new_callable=AsyncMock) as m:
            m.return_value = None
            res = await audit_data.get_audit_logs(audit_id="NOPE")
            assert res == []
            m.assert_called_once_with("NOPE")


@pytest.mark.asyncio
async def test_get_next_audit_id_increments():
    from app.services import audit_data_access as audit_data
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.__iter__ = MagicMock(return_value=iter([
        ["AUDIT_0001"], ["AUDIT_0003"], ["NOT_AUDIT"]
    ]))
    mock_session.execute.return_value = mock_result
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
    with patch("app.services.audit_data_access.get_session_factory", return_value=mock_factory):
        result = await audit_data.get_next_audit_id()
    assert result == "AUDIT_0004"


@pytest.mark.asyncio
async def test_get_next_audit_id_starts_at_0001():
    from app.services import audit_data_access as audit_data
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.fetchall.return_value = []
    mock_session.execute.return_value = mock_result
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
    with patch("app.services.audit_data_access.get_session_factory", return_value=mock_factory):
        result = await audit_data.get_next_audit_id()
    assert result == "AUDIT_0001"


@pytest.mark.asyncio
async def test_get_cost_analytics_aggregates():
    from app.services import audit_data_access as audit_data
    from app.models.tables import DocumentEvidence as NeonDocumentEvidence

    recs = [
        NeonDocumentEvidence(audit_id="A1", supplier_id=1, created_at="t", supplier_name="ACME",
                             filename="a.pdf", ariba_question_label="q", ariba_qa_answers="[]",
                             gemini_extracted_supplier_name="ACME", gemini_extracted_metadata="{}",
                             file_content_type="pdf", cost_usd=2),
        NeonDocumentEvidence(audit_id="A2", supplier_id=1, created_at="t", supplier_name="ACME",
                             filename="b.pdf", ariba_question_label="q", ariba_qa_answers="[]",
                             gemini_extracted_supplier_name="ACME", gemini_extracted_metadata="{}",
                             file_content_type="pdf", cost_usd=3),
    ]
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = recs
    mock_session.execute.return_value = mock_result
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
    with patch("app.services.audit_data_access.get_session_factory", return_value=mock_factory):
        stats = await audit_data.get_cost_analytics()
    assert stats["total_documents"] == 2
    assert stats["total_cost_myr"] == round((2 + 3) * 4.70, 4)
    assert stats["breakdown"][0]["document_count"] == 2


@pytest.mark.asyncio
async def test_log_audit_run_writes_evidence_and_log():
    """log_audit_run creates supplier, evidence rows, and an audit log."""
    from app.services import audit_data_access as audit_data
    from app.models.tables import Supplier

    supplier = Supplier(id=7, supplier_name="ACME Corp")

    mock_session = AsyncMock()
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch("app.services.audit_data_access.get_session_factory", return_value=mock_factory):
        with patch("app.services.audit_data_access.get_or_create_supplier", new_callable=AsyncMock) as m_get:
            m_get.return_value = 7
            with patch("app.services.audit_data_access.AuditLogRepository.get_by_audit_id", new_callable=AsyncMock) as m_by_id:
                m_by_id.return_value = None
                audit_id = await audit_data.log_audit_run(
                    "ACME Corp",
                    [DocumentEvidence(
                        audit_id="TEMP_x", supplier_id=0, created_at="now", timestamp="now",
                        supplier_name="ACME Corp", filename="cert.pdf",
                        ariba_question_label="1.1", ariba_qa_answers="[]",
                        gemini_extracted_supplier_name="ACME Corp",
                        gemini_extracted_metadata="{}",
                        file_content_type="application/pdf",
                    )],
                    make_log_entry(),
                )
    assert audit_id == "AUDIT_0001"


@pytest.mark.asyncio
async def test_log_audit_run_handles_failure():
    """log_audit_run returns None when an exception occurs."""
    from app.services import audit_data_access as audit_data

    with patch("app.services.audit_data_access.get_or_create_supplier", new_callable=AsyncMock) as m_get:
        m_get.side_effect = RuntimeError("db down")
        result = await audit_data.log_audit_run("ACME", [], None)
    assert result is None
