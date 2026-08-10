"""Tests for the Gemini 3.5 Flash Lite extractor."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import json
from unittest.mock import MagicMock, patch
import pytest
from app.services import extractor


@pytest.fixture
def mock_gemini_model():
    """Patches the google-genai Client that extractor constructed at import
    time. Yields `mock_client.models` so tests can configure
    `mock_gemini_model.generate_content.return_value / .side_effect`.
    """
    from app.services import extractor as _extractor_mod

    mock_client = MagicMock()
    with patch.object(_extractor_mod, "_client", mock_client):
        yield mock_client.models


def test_model_name_is_gemini_35_flash_lite():
    assert extractor._MODEL_NAME == "gemini-3.5-flash-lite"


def test_extract_mock_when_no_key():
    with patch("app.config.settings.gemini_api_key", ""):
        data, in_t, out_t, cost = extractor.extract_certificate_data(b"pdf", "application/pdf")
    assert data["certificates"][0]["certificateOwnerName"] == "MOCK SUPPLIER"
    assert in_t > 0


def test_extract_fallback_on_error(mock_gemini_model):
    mock_gemini_model.generate_content.side_effect = Exception("API down")
    with patch("app.config.settings.gemini_api_key", "fake-key"):
        data, in_t, out_t, cost = extractor.extract_certificate_data(b"pdf", "application/pdf")
    assert data["certificates"][0]["certificateOwnerName"] == "Extraction Failed"
    assert "error" in data["certificates"][0]


def test_extract_success_parses_json(mock_gemini_model):
    extracted = {
        "certificates": [{
            "certificateOwnerName": "ACME",
            "issuerName": "X",
            "certificateType": "ISO 9001",
            "certificateNumber": "C1",
            "expirationDate": "31/12/2029",
            "effectiveDate": "01/01/2026",
            "certificateLocation": "Selangor, Malaysia",
            "yearOfPublication": "2026",
            "confidence": 0.95,
        }],
    }
    mock_response = MagicMock()
    mock_response.text = json.dumps(extracted)
    mock_usage = MagicMock()
    mock_usage.prompt_token_count = 500
    mock_usage.candidates_token_count = 200
    mock_response.usage_metadata = mock_usage
    mock_gemini_model.generate_content.return_value = mock_response

    with patch("app.config.settings.gemini_api_key", "fake-key"):
        data, in_t, out_t, cost = extractor.extract_certificate_data(b"%PDF-x", "application/pdf")
    assert data["certificates"][0]["certificateOwnerName"] == "ACME"
    assert data["certificates"][0]["confidence"] == 0.95
    assert in_t == 500
    assert out_t == 200
    assert cost > 0


def test_extract_multiple_certificates_preserved(mock_gemini_model):
    extracted = {
        "certificates": [
            {
                "certificateOwnerName": "ACME",
                "certificateType": "ISO 9001",
                "certificateNumber": "C1",
                "effectiveDate": "01/01/2026",
                "expirationDate": "31/12/2029",
                "issuerName": "X",
                "certificateLocation": "Selangor, Malaysia",
                "yearOfPublication": "2026",
            },
            {
                "certificateOwnerName": "ACME",
                "certificateType": "BEM",
                "certificateNumber": "C2",
                "effectiveDate": "01/01/2026",
                "expirationDate": "31/12/2026",
                "issuerName": "LJM",
                "certificateLocation": "Selangor, Malaysia",
                "yearOfPublication": "2026",
            },
        ],
    }
    mock_response = MagicMock()
    mock_response.text = json.dumps(extracted)
    mock_response.usage_metadata = None
    mock_gemini_model.generate_content.return_value = mock_response

    with patch("app.config.settings.gemini_api_key", "fake-key"):
        data, in_t, out_t, cost = extractor.extract_certificate_data(b"pdf", "application/pdf")
    assert len(data["certificates"]) == 2
    assert data["certificates"][0]["certificateNumber"] == "C1"
    assert data["certificates"][1]["certificateNumber"] == "C2"


def test_year_of_publication_effective_date_fallback(mock_gemini_model):
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "certificates": [{
            "certificateOwnerName": "ACME",
            "effectiveDate": "15/08/2024",
            "yearOfPublication": "N/A",
        }],
    })
    mock_response.usage_metadata = None
    mock_gemini_model.generate_content.return_value = mock_response

    with patch("app.config.settings.gemini_api_key", "fake-key"):
        data, in_t, out_t, cost = extractor.extract_certificate_data(b"pdf", "application/pdf")
    assert data["certificates"][0]["yearOfPublication"] == "2024"


def test_calculate_cost():
    # 1M input tokens * 0.30/M + 1M output * 2.50/M = 2.80
    assert abs(extractor.calculate_cost(1_000_000, 1_000_000) - 2.80) < 1e-9
