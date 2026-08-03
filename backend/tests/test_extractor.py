"""Tests for the DeepSeek V4 Flash extractor."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import MagicMock, patch
from app.services import extractor


def test_extract_mock_when_no_key():
    with patch("app.config.settings.deepseek_api_key", ""):
        data, in_t, out_t, cost = extractor.extract_certificate_data(b"pdf", "application/pdf")
    assert data["certificateOwnerName"] == "MOCK SUPPLIER"
    assert in_t > 0


def test_extract_fallback_on_error():
    mock_resp = MagicMock()
    mock_resp.raise_for_status.side_effect = Exception("API down")
    with patch("app.config.settings.deepseek_api_key", "sk-test"):
        with patch("requests.post", return_value=mock_resp):
            data, in_t, out_t, cost = extractor.extract_certificate_data(b"pdf", "application/pdf")
    assert data["certificateOwnerName"] == "Extraction Failed"
    assert "error" in data


def test_extract_success_parses_json():
    import json
    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    extracted = {
        "certificateOwnerName": "ACME",
        "issuerName": "X",
        "certificateType": "ISO 9001",
        "certificateNumber": "C1",
        "expirationDate": "31/12/2029",
        "effectiveDate": "01/01/2026",
        "certificateLocation": "Selangor, Malaysia",
        "yearOfPublication": "2026",
        "confidence": {"certificateOwnerName": 0.99},
    }
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": json.dumps(extracted)}}],
        "usage": {"prompt_tokens": 500, "completion_tokens": 200},
    }
    with patch("app.config.settings.deepseek_api_key", "sk-test"):
        with patch("app.services.extractor.pdf.pdf_to_data_urls", return_value=["data:image/jpeg;base64,AA=="]):
            with patch("requests.post", return_value=mock_resp):
                data, in_t, out_t, cost = extractor.extract_certificate_data(b"%PDF-x", "application/pdf")
    assert data["certificateOwnerName"] == "ACME"
    assert data["confidence"]["certificateOwnerName"] == 0.99
    assert in_t == 500
    assert out_t == 200
    assert cost > 0


def test_calculate_cost():
    # 1M input tokens * 0.20/M + 1M output * 1.00/M = 1.20
    assert abs(extractor.calculate_cost(1_000_000, 1_000_000) - 1.20) < 1e-9
