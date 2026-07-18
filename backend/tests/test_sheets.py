from unittest.mock import MagicMock, patch
import pytest
from app.schemas import AuditLogEntry, DocumentEvidence
from app.services import sheets

@pytest.fixture
def mock_sheets_client():
    with patch("app.services.sheets.get_sheets_client") as mock_get_client:
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        yield mock_client

@pytest.fixture
def mock_worksheet():
    with patch("app.services.sheets.get_or_create_worksheet") as mock_get_worksheet:
        mock_ws = MagicMock()
        mock_get_worksheet.return_value = mock_ws
        yield mock_ws

@pytest.fixture
def mock_get_or_create_supplier():
    with patch("app.services.sheets.get_or_create_supplier") as mock_get_supplier:
        mock_get_supplier.return_value = 1
        yield mock_get_supplier

def test_log_audit_run_success(mock_sheets_client, mock_worksheet, mock_get_or_create_supplier):
    doc = DocumentEvidence(
        audit_id="audit-uuid",
        supplier_id=0,
        timestamp="17/07/2026, 11:00:00",
        supplier_name="ACME Corp",
        filename="qshe_cert.pdf",
        ariba_question_label="Please upload QSHE certificate",
        ariba_qa_answers='[]',
        gemini_extracted_supplier_name="ACME Corp",
        gemini_extracted_metadata='{}',
        file_content_type="application/pdf"
    )
    
    entry = AuditLogEntry(
        audit_id="audit-uuid",
        supplier_id=0,
        timestamp="17/07/2026, 11:00:00",
        supplier_name="ACME Corp",
        workspace_title="Workspace A",
        cert_type="QSHE",
        complete_qa_data_dump='[]',
        compiled_extracted_data='[]',
        result="Match",
        expiration_date="2029-12-31",
        suggested_comment="All match.",
        screenshot_url="http://screenshot"
    )
    
    mock_worksheet.get_all_records.return_value = []
    mock_worksheet.append_rows.return_value = {}
    mock_worksheet.append_row.return_value = {}
    
    result = sheets.log_audit_run("ACME Corp", [doc], entry)
    
    assert result == "AUDIT_0001"
    # Verify mock_get_or_create_supplier was executed
    mock_get_or_create_supplier.assert_called_once_with(mock_sheets_client, "ACME Corp")
    # Verify Supplier ID is populated on inputs
    assert doc.supplier_id == 1
    assert entry.supplier_id == 1

def test_log_audit_run_failure(mock_sheets_client, mock_worksheet, mock_get_or_create_supplier):
    mock_get_or_create_supplier.side_effect = Exception("Google API Error")
    result = sheets.log_audit_run("ACME Corp", [], None)
    # Errors should be caught and returned as None
    assert result is None

def test_get_audit_logs_success(mock_sheets_client, mock_worksheet):
    mock_worksheet.get_all_values.return_value = [
        ["Audit ID", "Supplier ID", "Timestamp", "Supplier Name", "Workspace Title", "Certificate Type", "Complete QA Data Dump", "Compiled Extracted Data", "Audit Result Verdict", "Expiration Date", "Suggested Comments", "Screenshot URL"],
        ["audit-uuid", 1, "17/07/2026, 11:00:00", "ACME Corp", "Workspace A", "QSHE", "[]", "[]", "Match", "2029-12-31", "All match.", "http://screenshot"]
    ]
    mock_worksheet.get_all_records.return_value = [
        {
            "Audit ID": "audit-uuid",
            "Supplier ID": 1,
            "Timestamp": "17/07/2026, 11:00:00",
            "Supplier Name": "ACME Corp",
            "Workspace Title": "Workspace A",
            "Certificate Type": "QSHE",
            "Complete QA Data Dump": "[]",
            "Compiled Extracted Data": "[]",
            "Audit Result Verdict": "Match",
            "Expiration Date": "2029-12-31",
            "Suggested Comments": "All match.",
            "Screenshot URL": "http://screenshot"
        }
    ]
    
    logs = sheets.get_audit_logs()
    
    assert len(logs) == 1
    assert logs[0].audit_id == "audit-uuid"
    assert logs[0].supplier_id == 1
    assert logs[0].supplier_name == "ACME Corp"
    assert logs[0].result == "Match"
    assert logs[0].expiration_date == "2029-12-31"

def test_get_audit_logs_failure(mock_sheets_client, mock_worksheet):
    mock_worksheet.get_all_records.side_effect = Exception("API Out of Quota")
    
    logs = sheets.get_audit_logs()
    
    assert logs == []
