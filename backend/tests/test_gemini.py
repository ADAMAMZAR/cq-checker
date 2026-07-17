import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from unittest.mock import MagicMock, patch
import pytest
from app.services import gemini

@pytest.fixture
def mock_gemini_model():
    with patch("google.generativeai.GenerativeModel") as mock_model_class:
        mock_model = MagicMock()
        mock_model_class.return_value = mock_model
        yield mock_model

def test_extract_certificate_data_no_key():
    # Test fallback behavior when no API Key is provided
    with patch("app.services.gemini.settings") as mock_settings:
        mock_settings.gemini_api_key = ""
        result = gemini.extract_certificate_data(b"some content", "application/pdf")
        
        assert result["supplierName"] == "MOCK SUPPLIER"
        assert result["expirationDate"] == "2029-12-31"

def test_extract_certificate_data_success(mock_gemini_model):
    with patch("app.services.gemini.settings") as mock_settings:
        mock_settings.gemini_api_key = "fake_key"
        
        # Mock successful Gemini JSON response
        mock_response = MagicMock()
        mock_response.text = '{"supplierName": "Target Supplier Inc", "expirationDate": "2028-06-30"}'
        mock_gemini_model.generate_content.return_value = mock_response
        
        result = gemini.extract_certificate_data(b"pdfbytes", "application/pdf")
        
        assert result["supplierName"] == "Target Supplier Inc"
        assert result["expirationDate"] == "2028-06-30"

def test_extract_certificate_data_failure(mock_gemini_model):
    with patch("app.services.gemini.settings") as mock_settings:
        mock_settings.gemini_api_key = "fake_key"
        
        # Make generate_content throw an exception
        mock_gemini_model.generate_content.side_effect = Exception("API Quota Blocked")
        
        result = gemini.extract_certificate_data(b"pdfbytes", "application/pdf")
        
        # Should return fallback dict containing the error message
        assert result["supplierName"] == "Extraction Failed"
        assert "API Quota Blocked" in result["error"]

def test_run_audit_comparison_success(mock_gemini_model):
    with patch("app.services.gemini.settings") as mock_settings:
        mock_settings.gemini_api_key = "fake_key"
        
        mock_response = MagicMock()
        mock_response.text = '{"result": "Match", "expiration_date": "2028-06-30", "suggested_comment": "Verification OK"}'
        mock_gemini_model.generate_content.return_value = mock_response
        
        result = gemini.run_audit_comparison("qa form data", "extracted document JSON")
        
        assert result["result"] == "Match"
        assert result["expiration_date"] == "2028-06-30"
        assert result["suggested_comment"] == "Verification OK"

def test_run_audit_comparison_failure(mock_gemini_model):
    with patch("app.services.gemini.settings") as mock_settings:
        mock_settings.gemini_api_key = "fake_key"
        
        mock_gemini_model.generate_content.side_effect = Exception("Model Overloaded")
        
        result = gemini.run_audit_comparison("qa form data", "extracted document JSON")
        
        assert result["result"] == "Mismatch"
        assert "Model Overloaded" in result["suggested_comment"]
