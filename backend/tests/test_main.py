import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import MagicMock, patch, PropertyMock, AsyncMock
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas import DocumentEvidence

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

@patch("app.services.audit_data.get_audit_logs")
def test_get_logs(mock_get_logs):
    mock_get_logs.return_value = []
    response = client.get("/api/logs")
    assert response.status_code == 200
    assert response.json() == []
    mock_get_logs.assert_called_once()

@patch("app.services.storage.LocalDiskStorage.upload")
@patch("app.services.audit_data.find_metadata_by_hash")
@patch("app.services.gemini.extract_certificate_data")
@patch("app.services.audit_data.log_audit_run")
def test_run_audit(mock_log_audit, mock_extract, mock_find_hash, mock_upload):
    mock_upload.return_value = "http://127.0.0.1:8000/mock/test_cert.pdf"
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
    assert json_data["result"] == "Mismatch"
    assert json_data["expiration_date"] == "31/12/2029"
    assert "test_cert.pdf" in json_data["filename"]
    mock_log_audit.assert_called_once()
    mock_extract.assert_called_once()

@patch("app.services.storage.LocalDiskStorage.upload")
@patch("app.services.audit_data.find_metadata_by_hash")
@patch("app.services.gemini.extract_certificate_data")
@patch("app.services.audit_data.log_audit_run")
def test_run_audit_cache_hit(mock_log_audit, mock_extract, mock_find_hash, mock_upload):
    mock_upload.return_value = "http://127.0.0.1:8000/mock/test_cert.pdf"
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
    assert json_data["result"] == "Mismatch"
    assert json_data["expiration_date"] == "01/01/2030"
    assert json_data["total_run_cost_usd"] == 0.0
    
    mock_log_audit.assert_called_once()
    # extract_certificate_data should NOT be called due to cache hit
    mock_extract.assert_not_called()

@patch("app.services.storage.LocalDiskStorage.upload")
@patch("app.services.audit_data.find_metadata_by_hash")
@patch("app.services.gemini.extract_certificate_data")
@patch("app.services.audit_data.log_audit_run")
def test_run_audit_duplicate_file_different_questions(mock_log_audit, mock_extract, mock_find_hash, mock_upload):
    import json
    mock_upload.return_value = "http://127.0.0.1:8000/mock/test_cert.pdf"
    mock_find_hash.return_value = None
    mock_log_audit.return_value = "AUDIT_0003"
    
    mock_extract.side_effect = [
        ({
            "certificateOwnerName": "ACME Corp",
            "issuerName": "CIDB Issuer",
            "certificateType": "CIDB",
            "certificateNumber": "CIDB-111",
            "expirationDate": "31/12/2029",
            "effectiveDate": "01/01/2026",
            "certificateLocation": "Selangor"
        }, 100, 20, 0.000015),
        ({
            "certificateOwnerName": "ACME Corp",
            "issuerName": "BEM Issuer",
            "certificateType": "BEM",
            "certificateNumber": "BEM-222",
            "expirationDate": "30/06/2028",
            "effectiveDate": "01/01/2025",
            "certificateLocation": "Kuala Lumpur"
        }, 100, 20, 0.000015)
    ]
    
    files = [
        ("files", ("test_cert.pdf", b"pdfcontent", "application/pdf"))
    ]
    qa_list = [
        {
            "questionLabel": "1.1 CIDB",
            "attachedFile": "test_cert.pdf",
            "answers": [{"label": "certificate type", "value": "CIDB"}]
        },
        {
            "questionLabel": "1.2 BEM",
            "attachedFile": "test_cert.pdf",
            "answers": [{"label": "certificate type", "value": "BEM"}]
        }
    ]
    data = {
        "supplier_name": "ACME Corp",
        "workspace_title": "Workspace 123",
        "cert_type": "QSHE",
        "qa_data": json.dumps(qa_list)
    }
    
    response = client.post("/api/audit", data=data, files=files)
    
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["audit_id"] == "AUDIT_0003"
    assert mock_extract.call_count == 1

    first_call_args = mock_extract.call_args_list[0][0]
    assert first_call_args[2] == "1.1 CIDB"

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

@patch("app.services.audit_data.get_document_evidence_logs")
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

@patch("app.services.auditor.run_full_audit")
@patch("app.services.audit_data.update_document_evidence")
@patch("app.services.audit_data.get_document_evidence_logs")
def test_update_evidence_endpoint_success(mock_get_logs, mock_update, mock_audit):
    mock_get_logs.return_value = [
        DocumentEvidence(
            audit_id="audit-123", supplier_id=1, timestamp="now",
            supplier_name="ACME Corp", filename="cert.pdf",
            ariba_question_label="1.1 Certificate", ariba_qa_answers="[]",
            gemini_extracted_supplier_name="ACME Corp",
            gemini_extracted_metadata='{"certificateOwnerName":"ACME Corp"}',
            file_content_type="application/pdf",
            input_tokens=100, output_tokens=20, cost_usd=0.000018,
        )
    ]
    mock_update.return_value = True
    mock_audit.return_value = ("Match", "All match.", {"tables": []})
    payload = {
        "audit_id": "audit-123",
        "filename": "cert.pdf",
        "updated_metadata": {"certificateOwnerName": "New Name"}
    }
    response = client.put("/api/evidence", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert response.json()["audit_result"] == "Match"
    mock_update.assert_called_once_with(
        audit_id="audit-123",
        filename="cert.pdf",
        updated_metadata={"certificateOwnerName": "New Name"}
    )


@patch("app.services.audit_data.update_document_evidence")
@patch("app.services.audit_data.get_document_evidence_logs")
def test_update_evidence_endpoint_failure(mock_get_logs, mock_update):
    mock_get_logs.return_value = [
        DocumentEvidence(
            audit_id="audit-123", supplier_id=1, timestamp="now",
            supplier_name="ACME Corp", filename="cert.pdf",
            ariba_question_label="1.1 Certificate", ariba_qa_answers="[]",
            gemini_extracted_supplier_name="ACME Corp",
            gemini_extracted_metadata='{"certificateOwnerName":"ACME Corp"}',
            file_content_type="application/pdf",
            input_tokens=100, output_tokens=20, cost_usd=0.000018,
        )
    ]
    mock_update.return_value = False
    payload = {
        "audit_id": "audit-123",
        "filename": "cert.pdf",
        "updated_metadata": {"certificateOwnerName": "New Name"}
    }
    response = client.put("/api/evidence", json=payload)
    assert response.status_code == 500
    assert "failed" in response.json()["detail"].lower()


@patch("app.services.storage.LocalDiskStorage.upload")
@patch("app.services.judge.judge_certificate")
@patch("app.services.extractor.extract_certificate_data")
def test_verify_certificate_endpoint(mock_extract, mock_judge, mock_upload):
    mock_upload.return_value = "/api/files/local/ACME/cert.pdf"
    mock_extract.return_value = ({
        "certificateOwnerName": "ACME Corp",
        "issuerName": "Issuer",
        "certificateType": "ISO 9001",
        "certificateNumber": "C1",
        "expirationDate": "31/12/2029",
        "effectiveDate": "01/01/2026",
        "certificateLocation": "Selangor, Malaysia",
        "yearOfPublication": "2026",
    }, 500, 200, 0.0005)
    mock_judge.return_value = {
        "status": "PASS",
        "reasoning_trace": "All match.",
        "confidence": 0.95,
        "judge_source": "rules",
        "rule_result": {"verdict": "Match"},
    }

    mock_record = MagicMock()
    mock_record.id = "11111111-2222-3333-4444-555555555555"

    with patch("app.repositories.certificates.CertificateRepository") as mock_repo:
        mock_repo.return_value.create = AsyncMock(return_value=mock_record)
        with patch("app.db.session.get_session_factory") as mock_factory:
            mock_session = MagicMock()
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
            files = {"file": ("cert.pdf", b"%PDF-1.4 fake", "application/pdf")}
            data = {"supplier_name": "ACME Corp"}
            response = client.post("/api/certificates/verify", files=files, data=data)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PASS"
    assert body["extracted_data"]["certificateOwnerName"] == "ACME Corp"
    assert body["record_id"] is not None


@patch("app.services.extractor.extract_certificate_data")
def test_verify_certificate_endpoint_extraction_failure(mock_extract):
    mock_extract.return_value = ({"certificateOwnerName": "Extraction Failed"}, 0, 0, 0.0)
    files = {"file": ("cert.pdf", b"%PDF-1.4 fake", "application/pdf")}
    data = {"supplier_name": "ACME Corp"}
    response = client.post("/api/certificates/verify", files=files, data=data)
    assert response.status_code == 502


@patch("app.repositories.certificates.CertificateRepository")
def test_list_certificates_endpoint(mock_repo):
    mock_record = MagicMock()
    mock_record.id = "11111111-2222-3333-4444-555555555555"
    mock_record.file_url = "http://x/c.pdf"
    mock_record.extracted_data = {"certificateOwnerName": "ACME", "confidence": 0.9}
    mock_record.status = "PASS"
    mock_record.judge_reasoning = "OK"
    mock_record.created_at = None
    mock_repo.return_value.list_all = AsyncMock(return_value=[mock_record])

    with patch("app.db.session.get_session_factory") as mock_factory:
        mock_session = MagicMock()
        mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
        response = client.get("/api/certificates")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["status"] == "PASS"


@patch("app.services.ingest.ingest_document")
def test_upload_document_endpoint(mock_ingest):
    result = MagicMock()
    result.status = "created"
    result.to_dict.return_value = {
        "document_id": "doc-123",
        "title": "manual.pdf",
        "status": "created",
        "parent_count": 10,
        "child_count": 40,
        "cost_usd": 0.0,
        "message": "",
    }
    mock_ingest.return_value = result

    files = {"file": ("manual.pdf", b"%PDF-1.4 fake", "application/pdf")}
    response = client.post("/api/documents/upload", files=files)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "created"
    assert body["parent_count"] == 10
    assert body["child_count"] == 40


@patch("app.services.ingest.ingest_document")
def test_upload_document_endpoint_failure(mock_ingest):
    result = MagicMock()
    result.status = "failed"
    result.message = "No parseable text found."
    mock_ingest.return_value = result

    files = {"file": ("manual.pdf", b"%PDF-1.4 fake", "application/pdf")}
    response = client.post("/api/documents/upload", files=files)
    assert response.status_code == 502


@patch("app.repositories.documents.DocumentRepository")
@patch("app.repositories.documents.ChunkRepository")
def test_list_documents_endpoint(mock_chunk_repo, mock_doc_repo):
    doc = MagicMock()
    doc.id = "doc-123"
    doc.title = "Manual"
    doc.file_url = "/api/files/local/manual.pdf"
    doc.created_at = None
    mock_doc_repo.return_value.list_all = AsyncMock(return_value=[doc])
    mock_chunk_repo.return_value.count_by_document = AsyncMock(
        return_value={"parent_chunks": 2, "child_chunks": 5}
    )

    with patch("app.db.session.get_session_factory") as mock_factory:
        mock_session = MagicMock()
        mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
        response = client.get("/api/documents")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["title"] == "Manual"
    assert body[0]["parent_count"] == 2
    assert body[0]["child_count"] == 5



