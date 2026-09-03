from typing import Optional
from app.region_configs import Region, RegionConfig, is_contractors_questionnaire
from app.services.auditor.types import DocCategory, ExpiryStatus
from app.services.auditor.matchers import (
    RE_PL_M,
    RE_PL_NUM,
    RE_PL_CLEAN,
    _add_years,
    _is_na,
    _parse_date,
    _today,
)


def classify_document(
    extracted_data: dict,
    qa_cert_type: str,
    question_label: str,
    region: Region,
    region_config: RegionConfig,
    issuer: str,
) -> DocCategory:
    qa_type_lower = (qa_cert_type or "").strip().lower()
    q_label_lower = (question_label or "").strip().lower()
    issuer_lower = (issuer or "").strip().lower()
    recert_flag = extracted_data.get("recertificationLetter", False)

    if recert_flag:
        return DocCategory.RECERTIFICATION_LETTER

    if region == Region.MALAYSIA:
        ssm_keywords = {"ssm", "suruhanjaya syarikat malaysia", "e-info", "e info", "company commission"}
        if any(kw in issuer_lower for kw in ssm_keywords):
            return DocCategory.SSM_PROFILE

    if any(
        exempt in issuer_lower
        for exempt in region_config.name_exempt_issuers
    ):
        return DocCategory.PERSONAL_CERTIFICATE

    if qa_type_lower == "other recognition":
        return DocCategory.OTHER_RECOGNITION

    pl_keywords = {"public liability", "insurance", "pl"}
    if any(kw in qa_type_lower or kw in q_label_lower for kw in pl_keywords):
        return DocCategory.PUBLIC_LIABILITY

    return DocCategory.TECHNICAL_CERTIFICATE


def check_expiry(
    extracted_data: dict,
    region_config: RegionConfig,
    qa_expiry: str,
) -> ExpiryStatus:
    is_permanent = extracted_data.get("isPermanent", False)
    eff_raw = extracted_data.get("effectiveDate", "")
    iss_raw = extracted_data.get("issueDate", "") or extracted_data.get("dateOfIssue", "") or ""
    exp_raw = extracted_data.get("expirationDate", "")

    eff_date = _parse_date(eff_raw)
    issue_date = _parse_date(iss_raw)
    effective = eff_date or issue_date
    expiry_date = _parse_date(exp_raw)
    expiry_na = _is_na(exp_raw)

    treat_as_permanent = is_permanent or expiry_na

    if treat_as_permanent:
        if not effective:
            return ExpiryStatus.NOT_LISTED
        capped = _add_years(effective, region_config.validity_cap_years)
        qa_exp_date = _parse_date(qa_expiry) if qa_expiry else None
        if qa_exp_date and qa_exp_date >= _today() and qa_exp_date <= capped:
            return ExpiryStatus.PERMANENT_MATCH
        if qa_exp_date:
            return ExpiryStatus.PERMANENT_NEEDS_REVISION
        return ExpiryStatus.PERMANENT_MATCH

    if not effective:
        if expiry_na:
            return ExpiryStatus.NOT_LISTED
        if expiry_date:
            if expiry_date <= _today():
                return ExpiryStatus.EXPIRED
            return ExpiryStatus.VALID
        return ExpiryStatus.NOT_LISTED

    capped = expiry_date if expiry_date else _add_years(effective, region_config.validity_cap_years)
    actual_cap = min(capped, _add_years(effective, region_config.validity_cap_years))

    if actual_cap <= _today():
        return ExpiryStatus.EXPIRED
    return ExpiryStatus.VALID


def parse_pl_amount(raw: Optional[str]) -> Optional[float]:
    if not raw:
        return None
    raw = str(raw).strip()
    if raw.lower() in ("n/a", "na", "-", "missing", "none", "null", ""):
        return None

    raw_clean = raw.replace(",", "").replace(" ", "").lower()
    raw_clean = RE_PL_CLEAN.sub('', raw_clean).strip()

    m = RE_PL_M.match(raw_clean)
    if m:
        return float(m.group(1)) * 1_000_000

    m = RE_PL_NUM.match(raw_clean)
    if m:
        return float(m.group(1))

    return None


def check_special_rules(
    extracted_data: dict,
    qa_map: dict,
    category: DocCategory,
    region_config: RegionConfig,
    region: Region,
    qa_data_title: str,
) -> list:
    special_mismatches = []

    if category == DocCategory.PUBLIC_LIABILITY:
        pl_raw = extracted_data.get("publicLiabilityAmount", "")
        pl_amount = parse_pl_amount(pl_raw)
        if pl_amount is not None and pl_amount < region_config.pl_min_aud:
            special_mismatches.append({
                "field": "Public Liability Amount",
                "evidence": pl_raw,
                "qa": f"Minimum {region_config.pl_min_aud:,.0f} AUD",
                "mode": "numeric",
            })

    if region == Region.MALAYSIA and is_contractors_questionnaire(qa_data_title):
        if region_config.require_cidb:
            has_cidb = "cidb" in qa_map.get("certificate type", "").lower()
            for label, val in qa_map.items():
                if "cidb" in label.lower():
                    has_cidb = True
            if not has_cidb:
                special_mismatches.append({
                    "field": "CIDB Certificate",
                    "evidence": "Missing",
                    "qa": "Required",
                    "mode": "special",
                })

    return special_mismatches
