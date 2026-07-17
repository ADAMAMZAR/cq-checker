from unittest.mock import MagicMock, patch
import pytest
from app.schemas import AuditLogEntry
from app.services import sheets

@pytest.fixture
def mock_sheets_client():
    with patch("app.services.sheets.get_sheets_client") as mock_get_client:
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        yield mock_client

@pytest.fixture
def mock_worksheet():
    with patch("app.services.sheets.get_worksheet") as mock_get_worksheet:
        mock_ws = MagicMock()
        mock_get_worksheet.return_value = mock_ws
        yield mock_ws

def test_append_audit_log_success(mock_sheets_client, mock_worksheet):
    entry = AuditLogEntry(
        timestamp="17/07/2026, 11:00:00",
        supplier_name="ACME Corp",
        workspace_title="Workspace A",
        cert_type="QSHE",
        filename="qshe_cert.pdf",
        result="Match",
        expiration_date="2029-12-31",
        suggested_comment="All match."
    )
    
    mock_worksheet.append_row.return_value = {}
    
    result = sheets.append_audit_log(entry)
    
    assert result is True
    mock_worksheet.append_row.assert_called_once_with([
        "17/07/2026, 11:00:00",
        "ACME Corp",
        "Workspace A",
        "QSHE",
        "qshe_cert.pdf",
        "Match",
        "2029-12-31",
        "All match."
    ])

def test_append_audit_log_failure(mock_sheets_client, mock_worksheet):
    entry = AuditLogEntry(
        timestamp="17/07/2026, 11:00:00",
        supplier_name="ACME Corp",
        workspace_title="Workspace A",
        cert_type="QSHE",
        filename="qshe_cert.pdf",
        result="Match",
        expiration_date="2029-12-31",
        suggested_comment="All match."
    )
    
    mock_worksheet.append_row.side_effect = Exception("Google API Error")
    
    result = sheets.append_audit_log(entry)
    
    assert result is False

def test_get_audit_logs_success(mock_sheets_client, mock_worksheet):
    mock_worksheet.get_all_records.return_value = [
        {
            "Timestamp": "17/07/2026, 11:00:00",
            "Supplier Name": "ACME Corp",
            "Workspace Title": "Workspace A",
            "Certificate Type": "QSHE",
            "Filename": "qshe_cert.pdf",
            "Audit Result (Match/Mismatch)": "Match",
            "Expiration Date": "2029-12-31",
            "Suggested Comments": "All match."
        }
    ]
    
    logs = sheets.get_audit_logs()
    
    assert len(logs) == 1
    assert logs[0].supplier_name == "ACME Corp"
    assert logs[0].result == "Match"
    assert logs[0].expiration_date == "2029-12-31"

def test_get_audit_logs_failure(mock_sheets_client, mock_worksheet):
    mock_worksheet.get_all_records.side_effect = Exception("API Out of Quota")
    
    logs = sheets.get_audit_logs()
    
    assert logs == []
