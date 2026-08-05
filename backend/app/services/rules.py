"""Deterministic certificate rules used by the Qwen judge.

Reuses the battle-tested matchers/checks from `auditor.py` (no duplication) and
exposes a single-document verification helper the judge can call to get a
code-backed verdict + comparison rows. This guarantees the pipeline never
depends solely on LLM judgement.
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.region_configs import detect_region, get_region_config, is_contractors_questionnaire
from app.services import auditor
from app.services.auditor import (
    DocCategory,
    ExpiryStatus,
    check_expiry,
    check_special_rules,
    check_standard_equivalence,
    classify_document,
    match_flexible,
    match_supplier,
    parse_pl_amount,
)
from app.services.legacy_gemini_audit import clean_question_label

logger = logging.getLogger(__name__)


@dataclass
class RuleResult:
    verdict: str                       # "Match" | "Mismatch"
    region: str
    category: Optional[str] = None
    intercept_type: Optional[str] = None
    expiry_status: Optional[str] = None
    comparison_rows: List[dict] = field(default_factory=list)
    reasons: List[str] = field(default_factory=list)


def _parse_qa_map(qa_answers_str: str) -> Dict[str, str]:
    qa_map: Dict[str, str] = {}
    try:
        qa_list = json.loads(qa_answers_str or "[]")
        if isinstance(qa_list, list):
            for item in qa_list:
                label = str(item.get("label", "")).strip().lower()
                qa_map[label] = str(item.get("value", ""))
    except Exception:
        pass
    return qa_map


def verify_document(
    extracted_data: dict,
    supplier_name: str,
    ariba_question_label: Optional[str] = None,
    ariba_qa_answers: Optional[str] = "[]",
    qa_data_title: str = "",
) -> RuleResult:
    """Run the full deterministic rule engine on a single extracted certificate.

    Mirrors the core of `auditor.run_full_audit` for one document, returning a
    structured RuleResult the judge can annotate with Qwen reasoning.
    """
    question_label = clean_question_label(ariba_question_label)
    region = detect_region(qa_data_title or question_label)
    region_config = get_region_config(region)
    qa_map = _parse_qa_map(ariba_qa_answers)

    qa_cert_type = qa_map.get("certificate type", "")
    issuer = extracted_data.get("issuerName", "")

    category = classify_document(
        extracted_data, qa_cert_type, question_label, region, region_config, issuer,
    )

    intercept = None
    intercept_params: dict = {}

    # --- Intercept stage (highest precedence) ---
    if category == DocCategory.RECERTIFICATION_LETTER:
        intercept = auditor.InterceptType.RECERTIFICATION_LETTER
    elif category == DocCategory.SSM_PROFILE:
        intercept = auditor.InterceptType.SSM_UPLOAD
        intercept_params = {"expected_type": qa_cert_type or "technical certificate"}
    elif category == DocCategory.OTHER_RECOGNITION:
        if extracted_data.get("hasMultipleCertificates", False):
            intercept = auditor.InterceptType.MULTIPLE_CERTIFICATES

    if not intercept and qa_cert_type and extracted_data.get("certificateType", "N/A") != "N/A":
        ev_ct = extracted_data.get("certificateType", "")
        if not (match_flexible(ev_ct, qa_cert_type) or check_standard_equivalence(ev_ct, qa_cert_type, region_config)):
            intercept = auditor.InterceptType.WRONG_STANDARD
            intercept_params = {"evidence_type": ev_ct, "expected_type": qa_cert_type}

    if not intercept and category not in (DocCategory.PERSONAL_CERTIFICATE, DocCategory.OTHER_RECOGNITION):
        ev_supplier = extracted_data.get("certificateOwnerName", "")
        if not match_supplier(ev_supplier, supplier_name):
            intercept = auditor.InterceptType.SUPPLIER_MISMATCH
            intercept_params = {
                "cert_supplier": ev_supplier,
                "qa_supplier": supplier_name,
                "cert_type": qa_cert_type or extracted_data.get("certificateType", "certificate"),
            }

    expiry_status = None
    if not intercept:
        qa_expiry = qa_map.get("expiration date", "")
        expiry_status = check_expiry(extracted_data, region_config, qa_expiry)
        if expiry_status == ExpiryStatus.EXPIRED:
            intercept = auditor.InterceptType.EXPIRED
        elif expiry_status == ExpiryStatus.PERMANENT_NEEDS_REVISION:
            effective = extracted_data.get("effectiveDate", "")
            issue = extracted_data.get("issueDate", "") or extracted_data.get("dateOfIssue", "") or ""
            eff_date = auditor._parse_date(effective) or auditor._parse_date(issue)
            if eff_date:
                capped = auditor._add_years(eff_date, region_config.validity_cap_years)
                intercept = auditor.InterceptType.PERMANENT_DATE_REVISION
                intercept_params = {"calculated_expiry": capped.strftime("%d/%m/%Y")}

    # --- Metadata + special rules ---
    local_mismatches = auditor.match_fields(
        extracted_data, qa_map, supplier_name, category, region_config, region,
    )
    local_special = check_special_rules(
        extracted_data, qa_map, category, region_config, region, qa_data_title,
    )
    if any(m.get("field") == "Public Liability Amount" for m in local_special):
        intercept = auditor.InterceptType.PL_INSUFFICIENT

    combined = local_mismatches + local_special
    comparison_rows = auditor.build_comparison_rows(
        extracted_data, qa_map, supplier_name, combined, category, region,
    )

    # --- Verdict ---
    verdict = "Match"
    if intercept:
        verdict = "Mismatch"
    elif any(r["result"] == "Mismatch" for r in comparison_rows):
        verdict = "Mismatch"

    reasons: List[str] = []
    if intercept:
        reasons.append(f"Intercept: {intercept.value}")
    for m in combined:
        reasons.append(f"{m['field']}: expected '{m.get('qa', '')}', got '{m.get('evidence', '')}'")

    return RuleResult(
        verdict=verdict,
        region=region.value,
        category=category.value,
        intercept_type=intercept.value if intercept else None,
        expiry_status=expiry_status.value if expiry_status else None,
        comparison_rows=comparison_rows,
        reasons=reasons,
    )
