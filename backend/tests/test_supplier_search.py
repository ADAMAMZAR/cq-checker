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

@patch("app.services.supplier_search.get_in_qualification_suppliers")
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

@patch("app.services.supplier_search.get_questionnaire_answers")
@patch("app.services.supplier_search.get_all_questionnaires")
@patch("app.services.supplier_search.get_oauth_token")
def test_audit_ariba_supplier_steps_2_and_3(mock_token, mock_get_q, mock_get_answers):
    """Verify Steps 2 & 3 execution returns questionnaire answers."""
    mock_token.return_value = "mock_token_123"
    mock_get_q.return_value = [{"questionnaireId": "doc999", "docTitle": "Safety Cert", "hasCertificates": True}]
    mock_get_answers.return_value = {"questionnaires": [{"id": 1, "answer": "yes"}]}

    with patch("app.services.supplier_search.settings") as mock_settings:
        mock_settings.ariba_client_id = "client_id"
        mock_settings.ariba_client_secret = "secret"
        mock_settings.ariba_api_key = "key"

        res = supplier_search.audit_ariba_supplier("V12345")
        assert res["status"] == "success"
        assert res["sm_vendor_id"] == "V12345"
        assert len(res["audit_results"]) == 1
        assert res["audit_results"][0]["doc_id"] == "doc999"
        assert "qna_data" in res["audit_results"][0]

