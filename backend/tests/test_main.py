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

@patch("app.services.sheets.append_audit_log")
def test_run_audit(mock_append_log):
    mock_append_log.return_value = True
    
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
    assert json_data["supplier_name"] == "ACME Corp"
    assert json_data["result"] == "Match"
    assert "test_cert.pdf" in json_data["filename"]
    mock_append_log.assert_called_once()
