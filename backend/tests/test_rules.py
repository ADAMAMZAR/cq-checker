"""Tests for the deterministic certificate rules (reusing auditor.py logic)."""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.modules['google._upb._message'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

from app.services.rules import verify_document


def _valid_cert(**overrides):
    data = {
        "certificateOwnerName": "ACME Corp",
        "issuerName": "Certifier Ltd",
        "certificateType": "ISO 9001",
        "certificateNumber": "CERT-123",
        "expirationDate": "31/12/2029",
        "effectiveDate": "01/01/2026",
        "certificateLocation": "Selangor, Malaysia",
        "yearOfPublication": "2026",
    }
    data.update(overrides)
    return data


def _full_qa() -> str:
    return (
        '[{"label": "Certificate Type", "value": "ISO 9001"},'
        '{"label": "Issuer", "value": "Certifier Ltd"},'
        '{"label": "Year of Publication", "value": "2026"},'
        '{"label": "Certificate Number", "value": "CERT-123"},'
        '{"label": "Certificate Location", "value": "Selangor, Malaysia"},'
        '{"label": "Effective Date", "value": "01/01/2026"},'
        '{"label": "Expiration Date", "value": "31/12/2029"}]'
    )


def test_valid_certificate_matches():
    result = verify_document(
        _valid_cert(),
        "ACME Corp",
        ariba_question_label="1.1 ISO 9001",
        ariba_qa_answers=_full_qa(),
    )
    assert result.verdict == "Match"


def test_expired_certificate_fails():
    result = verify_document(
        _valid_cert(expirationDate="01/01/2020"),
        "ACME Corp",
        ariba_question_label="1.1 ISO 9001",
    )
    assert result.verdict == "Mismatch"
    assert result.intercept_type == "EXPIRED"


def test_wrong_supplier_fails():
    result = verify_document(
        _valid_cert(certificateOwnerName="Another Company"),
        "ACME Corp",
        ariba_question_label="1.1 ISO 9001",
    )
    assert result.verdict == "Mismatch"
    assert result.intercept_type == "SUPPLIER_MISMATCH"


def test_wrong_standard_fails():
    result = verify_document(
        _valid_cert(certificateType="ISO 14001"),
        "ACME Corp",
        ariba_question_label="1.1 ISO 9001",
        ariba_qa_answers='[{"label": "Certificate Type", "value": "ISO 9001"}]',
    )
    assert result.verdict == "Mismatch"
    assert result.intercept_type == "WRONG_STANDARD"


def test_recertification_letter_intercepts():
    result = verify_document(
        _valid_cert(recertificationLetter=True),
        "ACME Corp",
        ariba_question_label="1.1 ISO 9001",
    )
    assert result.intercept_type == "RECERTIFICATION_LETTER"


def test_pl_insufficient_intercepts():
    result = verify_document(
        {
            "certificateOwnerName": "ACME Corp",
            "issuerName": "Insurer Ltd",
            "certificateType": "Public Liability",
            "certificateNumber": "PL-1",
            "expirationDate": "31/12/2029",
            "effectiveDate": "01/01/2026",
            "certificateLocation": "NSW, Australia",
            "yearOfPublication": "2026",
            "publicLiabilityAmount": "5,000,000",
        },
        "ACME Corp",
        ariba_question_label="2.11 Certificate of Currency for Public Liability",
        ariba_qa_answers='[{"label": "Certificate Type", "value": "Public Liability"}]',
        qa_data_title="(Australia) 2.11 Certificate of Currency for Public Liability",
    )
    assert result.intercept_type == "PL_INSUFFICIENT"
    assert result.verdict == "Mismatch"


def test_comparison_rows_populated():
    result = verify_document(
        _valid_cert(),
        "ACME Corp",
        ariba_question_label="1.1 ISO 9001",
        ariba_qa_answers=_full_qa(),
    )
    assert len(result.comparison_rows) >= 7
    assert all(r["result"] in ("Match", "Mismatch") for r in result.comparison_rows)
