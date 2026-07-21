import json
import pytest
from app.services import auditor
from app.regions import Region, detect_region, get_region_config


# ---------------------------------------------------------------------------
# Region detection
# ---------------------------------------------------------------------------

def test_region_detect_au():
    assert detect_region("Certificates Questionnaire (Australia)") == Region.AUSTRALIA


def test_region_detect_my():
    assert detect_region("Professional Services / Malaysia") == Region.MALAYSIA


def test_region_detect_my_contractor():
    assert detect_region("Certificates Questionnaire (Contractors)") == Region.MALAYSIA


def test_region_detect_unknown():
    assert detect_region("Some Other Form") == Region.MALAYSIA


def test_region_detect_none():
    assert detect_region("") == Region.MALAYSIA


# ---------------------------------------------------------------------------
# Strict matching (Certificate Numbers – char-by-char, no normalization)
# ---------------------------------------------------------------------------

def test_strict_match_identical():
    assert auditor.match_strict("ABC/123", "ABC/123") is True


def test_strict_match_O_vs_0():
    assert auditor.match_strict("ABC123", "ABC12O") is False


def test_strict_match_slash_vs_dash():
    assert auditor.match_strict("AB/C", "AB-C") is False


def test_strict_match_whitespace():
    assert auditor.match_strict("  CERT-123  ", "CERT-123") is True


# ---------------------------------------------------------------------------
# Flexible matching (Names, Addresses)
# ---------------------------------------------------------------------------

def test_flexible_match_exact():
    assert auditor.match_flexible("ABC Sdn Bhd", "abc sdn bhd") is True


def test_flexible_match_suffix_tolerant():
    assert auditor.match_flexible("MUDA CONSULT SDN BHD", "MUDA CONSULT") is True


def test_flexible_match_token_subset():
    assert auditor.match_flexible("Lembaga Jurutera Malaysia", "Jurutera Malaysia") is True


def test_flexible_match_na():
    assert auditor.match_flexible("N/A", "-") is True


def test_flexible_match_mismatch():
    assert auditor.match_flexible("QSHE", "BEM") is False


# ---------------------------------------------------------------------------
# Location matching
# ---------------------------------------------------------------------------

def test_location_match_my_state_to_country():
    assert auditor.match_location("Selangor, Malaysia", "Malaysia") is True


def test_location_match_my_outside_country():
    assert auditor.match_location("Singapore", "Malaysia") is False


def test_location_match_exact():
    assert auditor.match_location("Kuala Lumpur, Malaysia", "Kuala Lumpur, Malaysia") is True


# ---------------------------------------------------------------------------
# Public Liability Amount parsing
# ---------------------------------------------------------------------------

def test_pl_amount_20M():
    assert auditor.parse_pl_amount("20M AUD") == 20_000_000.0


def test_pl_amount_20m():
    assert auditor.parse_pl_amount("20m aud") == 20_000_000.0


def test_pl_amount_with_dollar():
    assert auditor.parse_pl_amount("$20M") == 20_000_000.0


def test_pl_amount_fully_numeric():
    assert auditor.parse_pl_amount("20,000,000") == 20_000_000.0


def test_pl_amount_aud_symbol():
    assert auditor.parse_pl_amount("AUD $20,000,000") == 20_000_000.0


def test_pl_amount_none():
    assert auditor.parse_pl_amount(None) is None


def test_pl_amount_na():
    assert auditor.parse_pl_amount("N/A") is None


def test_pl_amount_below_20M():
    val = auditor.parse_pl_amount("10,000,000")
    assert val is not None and val < 20_000_000.0


# ---------------------------------------------------------------------------
# Expiry calculation
# ---------------------------------------------------------------------------

def test_expiry_au_3yr_cap():
    cfg = get_region_config(Region.AUSTRALIA)
    assert cfg.validity_cap_years == 3
    data = {"effectiveDate": "01/01/2024", "isPermanent": False, "expirationDate": "01/01/2030"}
    status = auditor.check_expiry(data, cfg, "")
    assert status == auditor.ExpiryStatus.VALID


def test_expiry_my_10yr_cap():
    cfg = get_region_config(Region.MALAYSIA)
    assert cfg.validity_cap_years == 10
    data = {"effectiveDate": "01/01/2020", "isPermanent": False, "expirationDate": "01/01/2035"}
    status = auditor.check_expiry(data, cfg, "")
    assert status == auditor.ExpiryStatus.VALID


def test_expiry_expired():
    cfg = get_region_config(Region.UNKNOWN)
    data = {"effectiveDate": "01/01/2020", "isPermanent": False, "expirationDate": "01/01/2021"}
    status = auditor.check_expiry(data, cfg, "")
    assert status == auditor.ExpiryStatus.EXPIRED


def test_expiry_not_listed():
    cfg = get_region_config(Region.UNKNOWN)
    data = {"effectiveDate": "", "isPermanent": False, "expirationDate": "N/A"}
    status = auditor.check_expiry(data, cfg, "")
    assert status == auditor.ExpiryStatus.NOT_LISTED


def test_expiry_permanent_kekal_sah():
    cfg = get_region_config(Region.MALAYSIA)
    data = {"effectiveDate": "01/01/2020", "isPermanent": True, "expirationDate": "N/A"}
    status = auditor.check_expiry(data, cfg, "01/01/2030")
    assert status == auditor.ExpiryStatus.PERMANENT_MATCH


def test_expiry_permanent_needs_revision():
    cfg = get_region_config(Region.MALAYSIA)
    data = {"effectiveDate": "01/01/2010", "isPermanent": True, "expirationDate": "N/A"}
    status = auditor.check_expiry(data, cfg, "01/01/2015")
    assert status == auditor.ExpiryStatus.PERMANENT_NEEDS_REVISION


# ---------------------------------------------------------------------------
# Standard equivalence (MS 1722 = ISO 45001 for MY)
# ---------------------------------------------------------------------------

def test_ms1722_equals_iso45001():
    cfg = get_region_config(Region.MALAYSIA)
    assert auditor.check_standard_equivalence("MS 1722", "ISO 45001", cfg) is True


def test_iso45001_equals_itself():
    cfg = get_region_config(Region.MALAYSIA)
    assert auditor.check_standard_equivalence("ISO 45001", "ISO 45001", cfg) is True


def test_different_standards():
    cfg = get_region_config(Region.MALAYSIA)
    assert auditor.check_standard_equivalence("ISO 9001", "ISO 45001", cfg) is False


# ---------------------------------------------------------------------------
# Document classification
# ---------------------------------------------------------------------------

def test_classify_recertification_letter():
    data = {"recertificationLetter": True}
    result = auditor.classify_document(data, "ISO", "1.1", Region.MALAYSIA, get_region_config(Region.MALAYSIA), "Some Body")
    assert result == auditor.DocCategory.RECERTIFICATION_LETTER


def test_classify_ssm_profile_my():
    data = {"recertificationLetter": False}
    result = auditor.classify_document(data, "ISO", "1.1", Region.MALAYSIA, get_region_config(Region.MALAYSIA), "SSM Malaysia")
    assert result == auditor.DocCategory.SSM_PROFILE


def test_classify_personal_cert_bem():
    data = {"recertificationLetter": False}
    cfg = get_region_config(Region.MALAYSIA)
    result = auditor.classify_document(data, "BEM", "1.3", Region.MALAYSIA, cfg, "Lembaga Jurutera Malaysia")
    assert result == auditor.DocCategory.PERSONAL_CERTIFICATE


def test_classify_public_liability():
    data = {"recertificationLetter": False}
    result = auditor.classify_document(data, "Public Liability", "2.1 Insurance", Region.AUSTRALIA, get_region_config(Region.AUSTRALIA), "Some Body")
    assert result == auditor.DocCategory.PUBLIC_LIABILITY


def test_classify_other_recognition():
    data = {"recertificationLetter": False}
    result = auditor.classify_document(data, "Other Recognition", "3.1", Region.UNKNOWN, get_region_config(Region.UNKNOWN), "Some Body")
    assert result == auditor.DocCategory.OTHER_RECOGNITION


# ---------------------------------------------------------------------------
# Intercept: Recertification Letter
# ---------------------------------------------------------------------------

def test_intercept_recert_letter():
    ctx = {"ariba_question_label": "1.1 ISO", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "ISO 45001"}]), "filename": "recert.pdf"}
    extraction = {"certificateType": "ISO 45001", "certificateOwnerName": "ACME Corp", "issuerName": "Some Body", "certificateNumber": "CERT-001", "expirationDate": "N/A", "effectiveDate": "N/A", "certificateLocation": "Malaysia", "yearOfPublication": "N/A", "recertificationLetter": True}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction])
    assert verdict == "Mismatch"
    assert "recertification letter" in comment.lower()
    assert table["tables"][0]["intercept_type"] == "RECERTIFICATION_LETTER"


# ---------------------------------------------------------------------------
# Intercept: SSM Upload (MY only)
# ---------------------------------------------------------------------------

def test_intercept_ssm_profile_my():
    ctx = {"ariba_question_label": "1.1 CIDB", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "CIDB"}]), "filename": "ssm.pdf"}
    extraction = {"certificateType": "CIDB", "certificateOwnerName": "ACME Corp", "issuerName": "Suruhanjaya Syarikat Malaysia (SSM)", "certificateNumber": "SSM-123", "expirationDate": "N/A", "effectiveDate": "N/A", "certificateLocation": "Malaysia", "yearOfPublication": "N/A"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction], qa_data_title="Professional Services / Malaysia")
    assert verdict == "Mismatch"
    assert "SSM" in comment
    assert table["tables"][0]["intercept_type"] == "SSM_UPLOAD"


# ---------------------------------------------------------------------------
# Intercept: Supplier Name Mismatch (corporate cert)
# ---------------------------------------------------------------------------

def test_intercept_supplier_mismatch():
    ctx = {"ariba_question_label": "1.1 ISO", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "ISO 45001"}]), "filename": "cert.pdf"}
    extraction = {"certificateType": "ISO 45001", "certificateOwnerName": "WRONG SUPPLIER LTD", "issuerName": "BSI", "certificateNumber": "CERT-001", "expirationDate": "31/12/2030", "effectiveDate": "01/01/2025", "certificateLocation": "Malaysia", "yearOfPublication": "2025"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction])
    assert verdict == "Mismatch"
    assert "WRONG SUPPLIER" in comment or "supplier" in comment.lower()
    assert table["tables"][0]["intercept_type"] == "SUPPLIER_MISMATCH"


# ---------------------------------------------------------------------------
# Personal Certificate: exempt from corporate supplier name match
# ---------------------------------------------------------------------------

def test_personal_cert_exempt_supplier_name():
    ctx = {"ariba_question_label": "1.3 BEM", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "Board of Engineers Malaysia (BEM)"}, {"label": "Issuer", "value": "Lembaga Jurutera Malaysia"}, {"label": "Certificate Number", "value": "BEM-123"}, {"label": "Certificate Location", "value": "Malaysia"}, {"label": "Effective Date", "value": "01/01/2025"}, {"label": "Expiration Date", "value": "31/12/2030"}, {"label": "Year of publication", "value": "2025"}]), "filename": "bem.pdf"}
    extraction = {"certificateType": "Board of Engineers Malaysia (BEM)", "certificateOwnerName": "Ir. Ahmad Bin Ismail", "issuerName": "Lembaga Jurutera Malaysia", "certificateNumber": "BEM-123", "expirationDate": "31/12/2030", "effectiveDate": "01/01/2025", "certificateLocation": "Selangor, Malaysia", "yearOfPublication": "2025"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction], qa_data_title="Professional Services / Malaysia")
    assert verdict == "Match"
    assert comment == "All match."


# ---------------------------------------------------------------------------
# Expiry: Expired certificate
# ---------------------------------------------------------------------------

def test_expired_certificate():
    ctx = {"ariba_question_label": "1.1 ISO", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "ISO 45001"}]), "filename": "expired.pdf"}
    extraction = {"certificateType": "ISO 45001", "certificateOwnerName": "ACME Corp", "issuerName": "BSI", "certificateNumber": "CERT-001", "expirationDate": "01/01/2020", "effectiveDate": "01/01/2019", "certificateLocation": "Malaysia", "yearOfPublication": "2019"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction])
    assert verdict == "Mismatch"
    assert "expired" in comment.lower()
    assert table["tables"][0]["intercept_type"] == "EXPIRED"


# ---------------------------------------------------------------------------
# PL Insufficient (below 20M AUD)
# ---------------------------------------------------------------------------

def test_pl_insufficient():
    ctx = {"ariba_question_label": "2.1 Public Liability", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "Public Liability"}, {"label": "Public Liability Amount", "value": "20,000,000"}]), "filename": "pl.pdf"}
    extraction = {"certificateType": "Public Liability", "certificateOwnerName": "ACME Corp", "issuerName": "INS Co", "certificateNumber": "PL-001", "expirationDate": "31/12/2030", "effectiveDate": "01/01/2025", "certificateLocation": "Australia", "yearOfPublication": "2025", "publicLiabilityAmount": "10,000,000", "currency": "AUD"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction], qa_data_title="Certificates Questionnaire (Australia)")
    assert verdict == "Mismatch"
    assert "20 million" in comment.lower() or "minimum" in comment.lower()


# ---------------------------------------------------------------------------
# Certificate Type revision: NEVER generate "Please revise the Certificate Type"
# ---------------------------------------------------------------------------

def test_cert_type_revision_never():
    ctx = {"ariba_question_label": "1.1 ISO 9001", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "ISO 9001"}]), "filename": "cert.pdf"}
    extraction = {"certificateType": "ISO 14001", "certificateOwnerName": "ACME Corp", "issuerName": "BSI", "certificateNumber": "CERT-001", "expirationDate": "31/12/2030", "effectiveDate": "01/01/2025", "certificateLocation": "Malaysia", "yearOfPublication": "2025"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction])
    assert verdict == "Mismatch"
    assert "Please revise the Certificate Type" not in comment
    assert table["tables"][0]["intercept_type"] == "WRONG_STANDARD"


# ---------------------------------------------------------------------------
# Year of Publication absent → force Match, no comment
# ---------------------------------------------------------------------------

def test_year_of_publication_not_listed():
    ctx = {"ariba_question_label": "1.1 ISO", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "ISO 45001"}, {"label": "Issuer", "value": "BSI"}, {"label": "Certificate Number", "value": "CERT-001"}, {"label": "Certificate Location", "value": "Malaysia"}, {"label": "Effective Date", "value": "01/01/2025"}, {"label": "Expiration Date", "value": "31/12/2030"}, {"label": "Year of publication", "value": "N/A"}]), "filename": "cert.pdf"}
    extraction = {"certificateType": "ISO 45001", "certificateOwnerName": "ACME Corp", "issuerName": "BSI", "certificateNumber": "CERT-001", "expirationDate": "31/12/2030", "effectiveDate": "01/01/2025", "certificateLocation": "Malaysia", "yearOfPublication": "N/A"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction])
    # Year mismatch should be ignored, all else matches
    assert verdict == "Match"
    assert comment == "All match."


# ---------------------------------------------------------------------------
# Location omitted for AU
# ---------------------------------------------------------------------------

def test_au_omits_location():
    ctx = {"ariba_question_label": "1.1 PL", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "Public Liability"}]), "filename": "au_pl.pdf"}
    extraction = {"certificateType": "Public Liability", "certificateOwnerName": "ACME Corp", "issuerName": "INS Co", "certificateNumber": "PL-001", "expirationDate": "31/12/2030", "effectiveDate": "01/01/2025", "certificateLocation": "Sydney, Australia", "yearOfPublication": "2025", "publicLiabilityAmount": "20,000,000", "currency": "AUD"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction], qa_data_title="Certificates Questionnaire (Australia)")
    rows = table["tables"][0]["comparison_rows"]
    locations = [r for r in rows if r["field_name"] == "Certificate Location"]
    assert len(locations) == 0


# ---------------------------------------------------------------------------
# Certificate Number strict mismatch (O vs 0, / vs -)
# ---------------------------------------------------------------------------

def test_cert_number_O_vs_0():
    ctx = {"ariba_question_label": "1.1 ISO", "ariba_qa_answers": json.dumps([{"label": "Certificate Number", "value": "ABC-123"}]), "filename": "cert.pdf"}
    extraction = {"certificateType": "N/A", "certificateOwnerName": "ACME Corp", "issuerName": "N/A", "certificateNumber": "ABC-12O", "expirationDate": "N/A", "effectiveDate": "N/A", "certificateLocation": "N/A", "yearOfPublication": "N/A"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction])
    assert verdict == "Mismatch"
    cn_row = [r for r in table["tables"][0]["comparison_rows"] if r["field_name"] == "Certificate Number"][0]
    assert cn_row["result"] == "Mismatch"
    assert cn_row["matching_mode"] == "strict"


# ---------------------------------------------------------------------------
# MS 1722 accepted for ISO 45001
# ---------------------------------------------------------------------------

def test_ms1722_accepted_for_iso45001():
    ctx = {"ariba_question_label": "1.1 ISO", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "ISO 45001"}, {"label": "Issuer", "value": "BSI"}, {"label": "Certificate Number", "value": "CERT-001"}, {"label": "Certificate Location", "value": "Malaysia"}, {"label": "Effective Date", "value": "01/01/2025"}, {"label": "Expiration Date", "value": "31/12/2030"}, {"label": "Year of publication", "value": "2025"}]), "filename": "cert.pdf"}
    extraction = {"certificateType": "MS 1722", "certificateOwnerName": "ACME Corp", "issuerName": "BSI", "certificateNumber": "CERT-001", "expirationDate": "31/12/2030", "effectiveDate": "01/01/2025", "certificateLocation": "Malaysia", "yearOfPublication": "2025"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction], qa_data_title="Professional Services / Malaysia")
    assert verdict == "Match"
    assert comment == "All match."


# ---------------------------------------------------------------------------
# Multiple certificates in Other Recognition
# ---------------------------------------------------------------------------

def test_multiple_certs_other_recognition():
    ctx = {"ariba_question_label": "3.1 Other Recognition", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "Other Recognition"}]), "filename": "multi.pdf"}
    extraction = {"certificateType": "ISO 9001", "certificateOwnerName": "ACME Corp", "issuerName": "BSI", "certificateNumber": "CERT-001", "expirationDate": "31/12/2030", "effectiveDate": "01/01/2025", "certificateLocation": "Malaysia", "yearOfPublication": "2025", "hasMultipleCertificates": True, "additionalCertificateType": "ISO 14001"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction])
    assert verdict == "Mismatch"
    assert "two different certificates" in comment.lower()


# ---------------------------------------------------------------------------
# Full audit: all match
# ---------------------------------------------------------------------------

def test_full_audit_all_match():
    ctx = {"ariba_question_label": "1.1 ISO 45001", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "ISO 45001"}, {"label": "Issuer", "value": "BSI"}, {"label": "Year of publication", "value": "2025"}, {"label": "Certificate Number", "value": "CERT-001"}, {"label": "Certificate Location", "value": "Malaysia"}, {"label": "Effective Date", "value": "01/01/2025"}, {"label": "Expiration Date", "value": "31/12/2030"}]), "filename": "cert.pdf"}
    extraction = {"certificateType": "ISO 45001", "certificateOwnerName": "ACME Corp", "issuerName": "BSI", "certificateNumber": "CERT-001", "expirationDate": "31/12/2030", "effectiveDate": "01/01/2025", "certificateLocation": "Selangor, Malaysia", "yearOfPublication": "2025"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction], qa_data_title="Professional Services / Malaysia")
    assert verdict == "Match"
    assert comment == "All match."
    assert len(table["tables"]) == 1
    assert table["tables"][0]["question_label"] == "1.1 ISO 45001"


# ---------------------------------------------------------------------------
# Comparison table JSON structure (backward compat with frontend)
# ---------------------------------------------------------------------------

def test_comparison_table_structure():
    ctx = {"ariba_question_label": "1.1 ISO", "ariba_qa_answers": json.dumps([{"label": "Certificate Type", "value": "ISO 45001"}]), "filename": "cert.pdf"}
    extraction = {"certificateType": "ISO 45001", "certificateOwnerName": "ACME Corp", "issuerName": "BSI", "certificateNumber": "CERT-001", "expirationDate": "N/A", "effectiveDate": "N/A", "certificateLocation": "Malaysia", "yearOfPublication": "N/A"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction])
    assert "supplier_name" in table
    assert "region" in table
    assert "tables" in table
    assert len(table["tables"]) == 1
    t = table["tables"][0]
    assert "question_label" in t
    assert "attached_file" in t
    assert "category" in t
    assert "intercept_type" in t
    assert "comparison_rows" in t
    assert len(t["comparison_rows"]) >= 1
    row = t["comparison_rows"][0]
    assert "field_name" in row
    assert "value_evidence" in row
    assert "value_in_ariba" in row
    assert "result" in row
    assert "matching_mode" in row


# ---------------------------------------------------------------------------
# Comment template: exact phrasing for field revisions
# ---------------------------------------------------------------------------

def test_comment_field_revision_template():
    ctx = {"ariba_question_label": "2.1 Insurance", "ariba_qa_answers": json.dumps([{"label": "Certificate Number", "value": "OLD-001"}]), "filename": "ins.pdf"}
    extraction = {"certificateType": "N/A", "certificateOwnerName": "ACME Corp", "issuerName": "N/A", "certificateNumber": "NEW-999", "expirationDate": "N/A", "effectiveDate": "N/A", "certificateLocation": "N/A", "yearOfPublication": "N/A"}
    verdict, comment, table = auditor.run_full_audit("ACME Corp", [ctx], [extraction])
    assert "Please revise the Certificate Number" in comment
    assert "NEW-999" in comment
