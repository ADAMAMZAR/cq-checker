import pytest
from unittest.mock import patch, MagicMock
from app.services import supplier_search

def test_get_ariba_suppliers_unconfigured():
    """Verify get_ariba_suppliers returns [] gracefully when Ariba credentials are not set."""
    with patch("app.services.supplier_search.settings") as mock_settings:
        mock_settings.ariba_client_id = ""
        mock_settings.ariba_client_secret = ""
        mock_settings.ariba_api_key = ""

        suppliers = supplier_search.get_ariba_suppliers()
        assert suppliers == []

@patch("app.services.supplier_search.step1_get_in_qualification_suppliers")
@patch("app.services.supplier_search.get_oauth_token")
def test_get_ariba_suppliers_success(mock_token, mock_step1):
    """Verify Step 1 supplier search parses Ariba JSON correctly."""
    mock_token.return_value = "mock_token_123"
    mock_step1.return_value = [
        {"SM Vendor ID": "V12345", "Organization Name": "ACME Corp", "qualificationStatus": "InQualification"}
    ]

    with patch("app.services.supplier_search.settings") as mock_settings:
        mock_settings.ariba_client_id = "client_id"
        mock_settings.ariba_client_secret = "secret"
        mock_settings.ariba_api_key = "key"

        suppliers = supplier_search.get_ariba_suppliers()
        assert len(suppliers) == 1
        assert suppliers[0]["sm_vendor_id"] == "V12345"
        assert suppliers[0]["supplier_name"] == "ACME Corp"

@patch("app.services.supplier_search.step3_get_questionnaire_answers")
@patch("app.services.supplier_search.step2_get_questionnaire_doc_id")
@patch("app.services.supplier_search.get_oauth_token")
def test_audit_ariba_supplier_steps_2_and_3(mock_token, mock_step2, mock_step3):
    """Verify Steps 2 & 3 execution returns doc_id and questionnaire answers."""
    mock_token.return_value = "mock_token_123"
    mock_step2.return_value = "doc999"
    mock_step3.return_value = {"questionnaires": [{"id": 1, "answer": "yes"}]}

    with patch("app.services.supplier_search.settings") as mock_settings:
        mock_settings.ariba_client_id = "client_id"
        mock_settings.ariba_client_secret = "secret"
        mock_settings.ariba_api_key = "key"

        res = supplier_search.audit_ariba_supplier("V12345")
        assert res["status"] == "success"
        assert res["doc_id"] == "doc999"
        assert res["sm_vendor_id"] == "V12345"
        assert "qna_data" in res
