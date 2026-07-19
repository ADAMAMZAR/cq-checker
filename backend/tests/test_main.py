import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
import pytest
from app.main import app
from app.schemas import DocumentEvidence

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

@patch("app.services.sheets.get_audit_logs")
def test_get_logs(mock_get_logs):
    mock_get_logs.return_value = []
    response = client.get("/api/logs")
    assert response.status_code == 200
    assert response.json() == []
    mock_get_logs.assert_called_once()

@patch("app.services.sheets.find_metadata_by_hash")
@patch("app.services.gemini.run_audit_comparison")
@patch("app.services.gemini.extract_certificate_data")
@patch("app.services.sheets.log_audit_run")
def test_run_audit(mock_log_audit, mock_extract, mock_comparison, mock_find_hash):
    mock_find_hash.return_value = None
    mock_log_audit.return_value = "AUDIT_0001"
    mock_extract.return_value = ({
        "certificateOwnerName": "ACME Corp",
        "issuerName": "Issuer Name",
        "certificateType": "QSHE",
        "certificateNumber": "CERT-123456",
        "expirationDate": "31/12/2029",
        "effectiveDate": "01/01/2026",
        "certificateLocation": "Selangor, Malaysia"
    }, 150, 45, 0.00002475)
    
    # Mock files and forms
    files = [
        ("files", ("test_cert.pdf", b"pdfcontent", "application/pdf"))
    ]
    data = {
        "supplier_name": "ACME Corp",
        "workspace_title": "Workspace 123",
        "cert_type": "QSHE",
        "qa_data": '{"question": "answer"}'
    }
    
    response = client.post("/api/audit", data=data, files=files)
    
    assert response.status_code == 200
    json_data = response.json()
    assert "audit_id" in json_data
    assert "supplier_id" in json_data
    assert json_data["supplier_name"] == "ACME Corp"
    assert json_data["result"] == "Extracted"
    assert json_data["expiration_date"] == "31/12/2029"
    assert "test_cert.pdf" in json_data["filename"]
    mock_log_audit.assert_called_once()
    mock_extract.assert_called_once()
    mock_comparison.assert_not_called()

@patch("app.services.sheets.find_metadata_by_hash")
@patch("app.services.gemini.extract_certificate_data")
@patch("app.services.sheets.log_audit_run")
def test_run_audit_cache_hit(mock_log_audit, mock_extract, mock_find_hash):
    mock_find_hash.return_value = {
        "gemini_extracted_supplier_name": "ACME Cached Corp",
        "gemini_extracted_metadata": '{"certificateOwnerName": "ACME Cached Corp", "expirationDate": "01/01/2030"}'
    }
    mock_log_audit.return_value = "AUDIT_0002"
    
    # Mock files and forms
    files = [
        ("files", ("test_cert.pdf", b"pdfcontent", "application/pdf"))
    ]
    data = {
        "supplier_name": "ACME Corp",
        "workspace_title": "Workspace 123",
        "cert_type": "QSHE",
        "qa_data": '{"question": "answer"}'
    }
    
    response = client.post("/api/audit", data=data, files=files)
    
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["audit_id"] == "AUDIT_0002"
    assert json_data["supplier_name"] == "ACME Corp"
    assert json_data["result"] == "Extracted"
    assert json_data["expiration_date"] == "01/01/2030"
    assert json_data["total_run_cost_usd"] == 0.0
    
    mock_log_audit.assert_called_once()
    # extract_certificate_data should NOT be called due to cache hit
    mock_extract.assert_not_called()

@patch("app.services.gemini.extract_certificate_data")
def test_extract_endpoint(mock_extract):
    mock_extract.return_value = ({
        "certificateOwnerName": "ACME Corp",
        "certificateNumber": "CERT-123456"
    }, 150, 45, 0.00002475)
    
    files = {
        "file": ("test_cert.pdf", b"pdfcontent", "application/pdf")
    }
    
    response = client.post("/api/test/extract", files=files)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["extracted_data"]["certificateOwnerName"] == "ACME Corp"
    assert json_data["extracted_data"]["certificateNumber"] == "CERT-123456"
    assert json_data["usage"]["input_tokens"] == 150
    mock_extract.assert_called_once()

@patch("app.services.sheets.get_document_evidence_logs")
def test_get_evidence_endpoint(mock_get_evidence):
    mock_get_evidence.return_value = [
        DocumentEvidence(
            audit_id="audit-123",
            supplier_id=1,
            timestamp="18/07/2026, 11:00:00",
            supplier_name="ACME Corp",
            filename="cert.pdf",
            ariba_question_label="Label",
            ariba_qa_answers="[]",
            gemini_extracted_supplier_name="ACME Corp",
            gemini_extracted_metadata='{"certificateOwnerName": "ACME Corp"}',
            file_content_type="application/pdf",
            input_tokens=100,
            output_tokens=20,
            cost_usd=0.000018
        )
    ]
    response = client.get("/api/evidence")
    assert response.status_code == 200
    json_data = response.json()
    assert len(json_data) == 1
    assert json_data[0]["audit_id"] == "audit-123"
    assert json_data[0]["supplier_name"] == "ACME Corp"
    mock_get_evidence.assert_called_once()

@patch("app.services.sheets.update_document_evidence")
def test_update_evidence_endpoint_success(mock_update):
    mock_update.return_value = True
    payload = {
        "audit_id": "audit-123",
        "filename": "cert.pdf",
        "updated_metadata": {"certificateOwnerName": "New Name"}
    }
    response = client.put("/api/evidence", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    mock_update.assert_called_once_with(
        audit_id="audit-123",
        filename="cert.pdf",
        updated_metadata={"certificateOwnerName": "New Name"}
    )

@patch("app.services.sheets.update_document_evidence")
def test_update_evidence_endpoint_failure(mock_update):
    mock_update.return_value = False
    payload = {
        "audit_id": "audit-123",
        "filename": "cert.pdf",
        "updated_metadata": {"certificateOwnerName": "New Name"}
    }
    response = client.put("/api/evidence", json=payload)
    assert response.status_code == 404
    mock_update.assert_called_once()

