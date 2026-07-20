import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import json
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
        result, in_t, out_t, cost = gemini.extract_certificate_data(b"some content", "application/pdf")
        
        assert result["certificateOwnerName"] == "MOCK SUPPLIER"
        assert result["expirationDate"] == "31/12/2029"
        assert result["certificateLocation"] == "Selangor, Malaysia"
        assert in_t == 150

def test_extract_certificate_data_success(mock_gemini_model):
    with patch("app.services.gemini.settings") as mock_settings:
        mock_settings.gemini_api_key = "fake_key"
        
        # Mock successful Gemini JSON response
        mock_response = MagicMock()
        mock_response.text = '{"certificateOwnerName": "Target Supplier Inc", "expirationDate": "30/06/2028"}'
        mock_gemini_model.generate_content.return_value = mock_response
        
        result, in_t, out_t, cost = gemini.extract_certificate_data(b"pdfbytes", "application/pdf")
        
        assert result["certificateOwnerName"] == "Target Supplier Inc"
        assert result["expirationDate"] == "30/06/2028"

def test_year_of_publication_effective_date_fallback(mock_gemini_model):
    with patch("app.services.gemini.settings") as mock_settings:
        mock_settings.gemini_api_key = "fake_key"
        
        # Mock Gemini returning N/A for yearOfPublication, but valid effectiveDate
        mock_response = MagicMock()
        mock_response.text = '{"certificateOwnerName": "Target Supplier Inc", "effectiveDate": "15/08/2024", "yearOfPublication": "N/A"}'
        mock_gemini_model.generate_content.return_value = mock_response
        
        result, in_t, out_t, cost = gemini.extract_certificate_data(b"pdfbytes", "application/pdf")
        
        # Should extract the 4-digit year '2024' from effectiveDate as fallback
        assert result["yearOfPublication"] == "2024"

def test_extract_certificate_data_failure(mock_gemini_model):
    with patch("app.services.gemini.settings") as mock_settings:
        mock_settings.gemini_api_key = "fake_key"
        
        # Make generate_content throw an exception
        mock_gemini_model.generate_content.side_effect = Exception("API Quota Blocked")
        
        result, in_t, out_t, cost = gemini.extract_certificate_data(b"pdfbytes", "application/pdf")
        
        # Should return fallback dict containing the error message
        assert result["certificateOwnerName"] == "Extraction Failed"
        assert "API Quota Blocked" in result["error"]

# def test_run_audit_comparison_success(mock_gemini_model):
#     with patch("app.services.gemini.settings") as mock_settings:
#         mock_settings.gemini_api_key = "fake_key"
#         
#         mock_response = MagicMock()
#         mock_response.text = '{"result": "Match", "expiration_date": "2028-06-30", "suggested_comment": "Verification OK"}'
#         mock_gemini_model.generate_content.return_value = mock_response
#         
#         result, in_t, out_t, cost = gemini.run_audit_comparison("qa form data", "extracted document JSON")
#         
#         assert result["result"] == "Match"
#         assert result["expiration_date"] == "2028-06-30"
#         assert result["suggested_comment"] == "Verification OK"
# 
# def test_run_audit_comparison_failure(mock_gemini_model):
#     with patch("app.services.gemini.settings") as mock_settings:
#         mock_settings.gemini_api_key = "fake_key"
#         
#         mock_gemini_model.generate_content.side_effect = Exception("Model Overloaded")
#         
#         result, in_t, out_t, cost = gemini.run_audit_comparison("qa form data", "extracted document JSON")
#         
#         assert result["result"] == "Mismatch"
#         assert "Model Overloaded" in result["suggested_comment"]


def test_normalize_date():
    assert gemini.normalize_date("31/12/2026") == "31/12/2026"
    assert gemini.normalize_date("2026-12-31") == "31/12/2026"
    assert gemini.normalize_date("invalid-date") == "invalid-date"


def test_check_keyword_match():
    # Exact Match
    assert gemini.check_keyword_match("QSHE", "QSHE") == "Match"
    # Case Insensitive / whitespace
    assert gemini.check_keyword_match("  qshe  ", "QSHE") == "Match"
    # Substring
    assert gemini.check_keyword_match("MUDA CONSULT SDN BHD", "MUDA CONSULT") == "Match"
    # Token Match
    assert gemini.check_keyword_match("Lembaga Jurutera Malaysia", "Jurutera Malaysia") == "Match"
    # N/A and Empty handling
    assert gemini.check_keyword_match("N/A", "-") == "Match"
    # Mismatch
    assert gemini.check_keyword_match("QSHE", "BEM") == "Mismatch"


def test_run_programmatic_audit():
    supplier_name = "MUDA CONSULT SDN BHD"
    file_contexts = [{
        "ariba_question_label": "1.3 Board of Engineers Malaysia (BEM)",
        "ariba_qa_answers": json.dumps([
            {"label": "Certificate Type", "value": "Board of Engineers Malaysia (BEM)"},
            {"label": "Issuer", "value": "Lembaga Jurutera Malaysia"},
            {"label": "Year of publication", "value": "2026"},
            {"label": "Certificate Number", "value": "2611-BC-1195"},
            {"label": "Certificate Location", "value": "Malaysia"},
            {"label": "Effective Date", "value": "01/01/2026"},
            {"label": "Expiration Date", "value": "31/12/2026"}
        ])
    }]
    extraction_results = [{
        "certificateType": "Board of Engineers Malaysia (BEM)",
        "certificateOwnerName": "MUDA CONSULT SDN BHD",
        "issuerName": "Lembaga Jurutera Malaysia",
        "certificateNumber": "2611-BC-1195",
        "certificateLocation": "Selangor, Malaysia",
        "effectiveDate": "01/01/2026",
        "expirationDate": "31/12/2026"
    }]

    verdict, comment, comp_table = gemini.run_programmatic_audit(supplier_name, file_contexts, extraction_results)

    # Now that year of publication falls back to 4-digit effectiveDate year ('2026'), it matches with QA '2026', making the overall verdict 'Match'
    assert verdict == "Match"
    assert comment == "All match."
    assert comp_table["supplier_name"] == supplier_name
    assert len(comp_table["tables"]) == 1
    assert comp_table["tables"][0]["question_label"] == "1.3 Board of Engineers Malaysia (BEM)"
    assert "attached_file" in comp_table["tables"][0]

def test_run_programmatic_audit_mismatch():
    supplier_name = "MUDA CONSULT SDN BHD"
    file_contexts = [{
        "ariba_question_label": "1.3 Board of Engineers Malaysia (BEM)",
        "filename": "cert_bem.pdf",
        "ariba_qa_answers": json.dumps([
            {"label": "Certificate Type", "value": "Wrong Type"},
            {"label": "Issuer", "value": "Lembaga Jurutera Malaysia"},
            {"label": "Year of publication", "value": "2026"},
            {"label": "Certificate Number", "value": "2611-BC-1195"},
            {"label": "Certificate Location", "value": "Malaysia"},
            {"label": "Effective Date", "value": "01/01/2026"},
            {"label": "Expiration Date", "value": "31/12/2026"}
        ])
    }]
    extraction_results = [{
        "certificateType": "Board of Engineers Malaysia (BEM)",
        "certificateOwnerName": "MUDA CONSULT SDN BHD",
        "issuerName": "Lembaga Jurutera Malaysia",
        "certificateNumber": "2611-BC-9999", # Mismatch!
        "certificateLocation": "Selangor, Malaysia",
        "effectiveDate": "01/01/2026",
        "expirationDate": "31/12/2026"
    }]

    verdict, comment, comp_table = gemini.run_programmatic_audit(supplier_name, file_contexts, extraction_results)

    assert verdict == "Mismatch"
    assert "Dear Sir/Madam," in comment
    assert "We seek for your resubmission for the following in Part 2: Modular Certificates Questionnaire:" in comment
    assert "1.3 Board of Engineers Malaysia (BEM) (cert_bem.pdf)" in comment
    assert '- Please revise the certificate type to "Board of Engineers Malaysia (BEM)"' in comment
    assert '- Please revise the certificate number to "2611-BC-9999"' in comment
    assert "Thank you." in comment

