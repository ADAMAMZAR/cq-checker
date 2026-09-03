from app.region_configs import Region, RegionConfig
from app.services.auditor.types import DocCategory
from app.services.auditor.matchers import (
    RE_YEAR,
    _is_na,
    _normalize_date,
    check_standard_equivalence,
    match_flexible,
    match_location,
    match_strict,
    match_supplier,
)


def _extract_year(extracted_data: dict) -> str:
    ev = extracted_data.get("yearOfPublication", "N/A")
    if not ev or _is_na(ev):
        eff = extracted_data.get("effectiveDate", "")
        if eff and not _is_na(eff):
            m = RE_YEAR.search(eff)
            if m:
                return m.group(1)
    return ev


def match_fields(
    extracted_data: dict,
    qa_map: dict,
    supplier_name: str,
    category: DocCategory,
    region_config: RegionConfig,
    region: Region,
) -> list:
    mismatches = []

    # 1. Certificate Type
    ev_ct = extracted_data.get("certificateType", "N/A")
    qa_ct = qa_map.get("certificate type", "N/A")
    ct_matched = match_flexible(ev_ct, qa_ct) or check_standard_equivalence(ev_ct, qa_ct, region_config)
    if not ct_matched:
        mismatches.append({
            "field": "Certificate Type",
            "evidence": ev_ct,
            "qa": qa_ct,
            "mode": "flexible",
        })

    # 2. Supplier Name
    ev_sn = extracted_data.get("certificateOwnerName", "N/A")
    if category == DocCategory.PERSONAL_CERTIFICATE or category == DocCategory.OTHER_RECOGNITION:
        pass
    else:
        if not match_supplier(ev_sn, supplier_name):
            mismatches.append({
                "field": "Supplier Name",
                "evidence": ev_sn,
                "qa": supplier_name,
                "mode": "flexible",
            })

    # 3. Issuer
    ev_iss = extracted_data.get("issuerName", "N/A")
    qa_iss = qa_map.get("issuer", "N/A")
    if not match_flexible(ev_iss, qa_iss):
        mismatches.append({
            "field": "Issuer",
            "evidence": ev_iss,
            "qa": qa_iss,
            "mode": "flexible",
        })

    # 4. Year of Publication
    ev_yop = extracted_data.get("yearOfPublication", "N/A")
    if not ev_yop or _is_na(ev_yop):
        eff_date = extracted_data.get("effectiveDate", "")
        if eff_date and not _is_na(eff_date):
            match = RE_YEAR.search(eff_date)
            if match:
                ev_yop = match.group(1)
    qa_yop = qa_map.get("year of publication", "N/A")
    ev_yop_stripped = ev_yop.strip() if ev_yop else ""
    qa_yop_stripped = qa_yop.strip() if qa_yop else ""

    if _is_na(ev_yop_stripped):
        pass
    elif _is_na(qa_yop_stripped):
        pass
    elif ev_yop_stripped != qa_yop_stripped:
        mismatches.append({
            "field": "Year of Publication",
            "evidence": ev_yop_stripped,
            "qa": qa_yop_stripped,
            "mode": "strict",
        })

    # 5. Certificate Number — STRICT matching
    ev_cn = extracted_data.get("certificateNumber", "N/A")
    qa_cn = qa_map.get("certificate number", "N/A")
    if not match_strict(ev_cn, qa_cn):
        mismatches.append({
            "field": "Certificate Number",
            "evidence": ev_cn,
            "qa": qa_cn,
            "mode": "strict",
        })

    # 6. Certificate Location (omit for AU)
    if region != Region.AUSTRALIA:
        ev_loc = extracted_data.get("certificateLocation", "N/A")
        qa_loc = qa_map.get("certificate location", "N/A")
        if not match_location(ev_loc, qa_loc):
            mismatches.append({
                "field": "Certificate Location",
                "evidence": ev_loc,
                "qa": qa_loc,
                "mode": "flexible",
            })

    # 7. Effective Date
    ev_ed = _normalize_date(extracted_data.get("effectiveDate", "N/A"))
    qa_ed = _normalize_date(qa_map.get("effective date", "N/A"))
    if not match_flexible(ev_ed, qa_ed):
        mismatches.append({
            "field": "Effective Date",
            "evidence": ev_ed,
            "qa": qa_ed,
            "mode": "flexible",
        })

    # 8. Expiration Date
    ev_xd = _normalize_date(extracted_data.get("expirationDate", "N/A"))
    qa_xd = _normalize_date(qa_map.get("expiration date", "N/A"))
    if not match_flexible(ev_xd, qa_xd):
        mismatches.append({
            "field": "Expiration Date",
            "evidence": ev_xd,
            "qa": qa_xd,
            "mode": "flexible",
        })

    return mismatches


def build_comparison_rows(
    extracted_data: dict,
    qa_map: dict,
    supplier_name: str,
    mismatches: list,
    category: DocCategory,
    region: Region,
) -> list:
    mismatch_fields = {m["field"] for m in mismatches}

    def _res(field: str) -> str:
        return "Mismatch" if field in mismatch_fields else "Match"

    field_values = [
        ("Certificate Type",
         extracted_data.get("certificateType", "N/A"),
         qa_map.get("certificate type", "N/A")),
        ("Supplier Name",
         extracted_data.get("certificateOwnerName", "N/A"),
         supplier_name),
        ("Issuer",
         extracted_data.get("issuerName", "N/A"),
         qa_map.get("issuer", "N/A")),
        ("Year of Publication",
         _extract_year(extracted_data),
         qa_map.get("year of publication", "N/A")),
        ("Certificate Number",
         extracted_data.get("certificateNumber", "N/A"),
         qa_map.get("certificate number", "N/A")),
        ("Effective Date",
         _normalize_date(extracted_data.get("effectiveDate", "N/A")),
         _normalize_date(qa_map.get("effective date", "N/A"))),
        ("Expiration Date",
         _normalize_date(extracted_data.get("expirationDate", "N/A")),
         _normalize_date(qa_map.get("expiration date", "N/A"))),
    ]

    if region != Region.AUSTRALIA:
        field_values.insert(5, (
            "Certificate Location",
            extracted_data.get("certificateLocation", "N/A"),
            qa_map.get("certificate location", "N/A"),
        ))

    if category == DocCategory.PUBLIC_LIABILITY:
        pl_ev = extracted_data.get("publicLiabilityAmount", "N/A")
        pl_qa = "N/A"
        for m in mismatches:
            if m["field"] == "Public Liability Amount":
                pl_qa = m["qa"]
                break
        field_values.append(("Public Liability Amount", pl_ev, pl_qa))

    rows = []
    for fn, ev, qa in field_values:
        rows.append({
            "field_name": fn,
            "value_evidence": ev,
            "value_in_ariba": qa,
            "result": _res(fn),
            "matching_mode": "strict" if fn == "Certificate Number" else "flexible",
        })
    return rows
