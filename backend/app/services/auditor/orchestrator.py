import json
import re
from collections import defaultdict
from app.region_configs import detect_region, get_region_config
from app.services.auditor.types import DocCategory, ExpiryStatus, InterceptType
from app.services.auditor.matchers import (
    RE_SORT_PREFIX,
    _add_years,
    _parse_date,
    check_standard_equivalence,
    match_flexible,
    match_supplier,
)
from app.services.auditor.rules import (
    check_expiry,
    check_special_rules,
    classify_document,
)
from app.services.auditor.comparison_matrix import (
    build_comparison_rows,
    match_fields,
)
from app.services.auditor.comment_builder import (
    build_comment_lines,
    clean_question_label,
)


def _expected_cert_info(ctx: dict) -> tuple[str, str]:
    qa_answers_str = ctx.get("ariba_qa_answers", "[]")
    q_label = ctx.get("ariba_question_label", "")

    exp_type = ""
    exp_state = ""

    try:
        qa_list = json.loads(qa_answers_str or "[]")
        if isinstance(qa_list, list):
            for item in qa_list:
                lbl = str(item.get("label", "")).strip().lower()
                val = str(item.get("value", "")).strip()
                if "certificate type" in lbl and val:
                    exp_type = val
                elif ("state" in lbl or "location" in lbl) and val:
                    exp_state = val
    except Exception:
        pass

    q_label_lower = q_label.lower()

    if not exp_type:
        if "workers' compensation" in q_label_lower or "workers compensation" in q_label_lower:
            exp_type = "Workers Compensation"
        elif "public liability" in q_label_lower:
            exp_type = "Public Liability"
        elif "professional indemnity" in q_label_lower:
            exp_type = "Professional Indemnity"
        elif "motor vehicle" in q_label_lower:
            exp_type = "Motor Vehicle"
        elif "iso 9001" in q_label_lower:
            exp_type = "ISO 9001"
        elif "iso 14001" in q_label_lower:
            exp_type = "ISO 14001"
        elif "iso 45001" in q_label_lower or "ohsas 18001" in q_label_lower:
            exp_type = "ISO 45001"
        elif "cidb" in q_label_lower:
            exp_type = "CIDB Certificate"
        elif "ssm" in q_label_lower:
            exp_type = "SSM Profile"

    if not exp_state:
        au_states = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]
        for st in au_states:
            if re.search(rf'\b{st}\b', q_label, re.IGNORECASE):
                exp_state = st
                break

    return exp_type, exp_state


def _cert_matches_expected(cert: dict, expected_type: str, expected_state: str, region_config) -> bool:
    ev_ct = str(cert.get("certificateType", "") or "")
    if not ev_ct or ev_ct == "N/A":
        return False

    type_matched = True
    if expected_type:
        type_matched = match_flexible(ev_ct, expected_type) or check_standard_equivalence(ev_ct, expected_type, region_config)

    if not type_matched:
        return False

    if expected_state:
        ev_loc = str(cert.get("certificateLocation", "") or "")
        cert_text = json.dumps(cert).upper()
        st_upper = expected_state.upper()

        state_matched = (
            re.search(rf'\b{st_upper}\b', ev_loc, re.IGNORECASE) is not None
            or re.search(rf'\b{st_upper}\b', cert_text) is not None
        )
        if not state_matched:
            return False

    return True


def run_full_audit(
    supplier_name: str,
    file_contexts: list,
    extraction_results: list,
    qa_data_title: str = "",
) -> tuple:
    overall_verdict = "Match"
    region = detect_region(qa_data_title)
    region_config = get_region_config(region)

    comparison_table = {
        "supplier_name": supplier_name,
        "region": region.value,
        "intercept_type": None,
        "tables": [],
    }

    pairs = []
    for ctx, extracted in zip(file_contexts, extraction_results):
        certs = extracted.get("certificates") if isinstance(extracted, dict) else None
        if isinstance(certs, list) and len(certs) > 1:
            exp_type, exp_state = _expected_cert_info(ctx)
            selected_with_idx = [
                (i, c) for i, c in enumerate(certs, start=1)
                if _cert_matches_expected(c, exp_type, exp_state, region_config)
            ]
            if not selected_with_idx and exp_type:
                selected_with_idx = [
                    (i, c) for i, c in enumerate(certs, start=1)
                    if match_flexible(str(c.get("certificateType", "")), exp_type)
                    or check_standard_equivalence(str(c.get("certificateType", "")), exp_type, region_config)
                ]
            if not selected_with_idx:
                selected_with_idx = [(1, certs[0])]

            for i, cert in selected_with_idx:
                pairs.append((ctx, cert, i))
        elif isinstance(certs, list) and len(certs) == 1:
            pairs.append((ctx, certs[0], None))
        else:
            pairs.append((ctx, extracted, None))

    def _sort_key(pair):
        label = clean_question_label(pair[0].get("ariba_question_label", "General Attachment"))
        m = RE_SORT_PREFIX.match(label)
        if m:
            try:
                return [int(x) for x in m.group(1).split(".")]
            except Exception:
                pass
        return [999]

    pairs.sort(key=_sort_key)

    all_comment_parts = []
    intercept_groups = defaultdict(list)

    for ctx, extracted_data, cert_index in pairs:
        question_label = clean_question_label(ctx.get("ariba_question_label", "General Attachment"))
        qa_answers_str = ctx.get("ariba_qa_answers", "[]")
        filename = ctx.get("filename", "")
        cert_suffix = f" [Cert {cert_index}]" if cert_index else ""

        qa_answers_list = []
        try:
            if qa_answers_str:
                qa_answers_list = json.loads(qa_answers_str)
        except Exception:
            pass

        qa_map = {}
        for item in qa_answers_list:
            label = item.get("label", "").strip().lower()
            val = item.get("value", "")
            qa_map[label] = val

        qa_cert_type = qa_map.get("certificate type", "")
        issuer = extracted_data.get("issuerName", "")

        # Step 1: Classify
        category = classify_document(
            extracted_data, qa_cert_type, question_label,
            region, region_config, issuer,
        )

        table_entry = {
            "question_label": question_label,
            "attached_file": filename,
            "category": category.value,
            "intercept_type": None,
            "expiry_status": None,
            "comparison_rows": [],
        }
        if cert_index:
            table_entry["certificate_index"] = cert_index

        intercept = None
        intercept_params = {}
        expiry_status = None
        local_mismatches = []
        local_special_mismatches = []

        # --- Intercept stage ---
        if category == DocCategory.RECERTIFICATION_LETTER:
            intercept = InterceptType.RECERTIFICATION_LETTER
        elif category == DocCategory.SSM_PROFILE:
            intercept = InterceptType.SSM_UPLOAD
            intercept_params = {"expected_type": qa_cert_type or "technical certificate"}
        elif category == DocCategory.OTHER_RECOGNITION:
            has_multiple = extracted_data.get("hasMultipleCertificates", False)
            if has_multiple:
                intercept = InterceptType.MULTIPLE_CERTIFICATES

        if not intercept:
            if qa_cert_type and extracted_data.get("certificateType", "N/A") != "N/A":
                ev_ct = extracted_data.get("certificateType", "")
                qa_ct = qa_cert_type
                ct_matched = match_flexible(ev_ct, qa_ct) or check_standard_equivalence(ev_ct, qa_ct, region_config)
                if not ct_matched:
                    intercept = InterceptType.WRONG_STANDARD
                    intercept_params = {
                        "evidence_type": ev_ct,
                        "expected_type": qa_ct,
                    }

        if not intercept:
            if category not in (DocCategory.PERSONAL_CERTIFICATE, DocCategory.OTHER_RECOGNITION):
                ev_supplier = extracted_data.get("certificateOwnerName", "")
                if not match_supplier(ev_supplier, supplier_name):
                    intercept = InterceptType.SUPPLIER_MISMATCH
                    intercept_params = {
                        "cert_supplier": ev_supplier,
                        "qa_supplier": supplier_name,
                        "cert_type": qa_cert_type or extracted_data.get("certificateType", "certificate"),
                    }

        # --- Expiry stage ---
        if not intercept:
            qa_expiry = qa_map.get("expiration date", "")
            expiry_status = check_expiry(extracted_data, region_config, qa_expiry)

            if expiry_status == ExpiryStatus.EXPIRED:
                intercept = InterceptType.EXPIRED
            elif expiry_status == ExpiryStatus.PERMANENT_NEEDS_REVISION:
                effective = extracted_data.get("effectiveDate", "")
                issue = extracted_data.get("issueDate", "") or extracted_data.get("dateOfIssue", "") or ""
                eff_date = _parse_date(effective) or _parse_date(issue)
                if eff_date:
                    capped = _add_years(eff_date, region_config.validity_cap_years)
                    intercept = InterceptType.PERMANENT_DATE_REVISION
                    intercept_params = {
                        "calculated_expiry": capped.strftime("%d/%m/%Y"),
                    }
            elif expiry_status == ExpiryStatus.NOT_LISTED:
                pass
            elif expiry_status == ExpiryStatus.PERMANENT_MATCH:
                pass

        # --- Metadata stage ---
        local_mismatches = match_fields(
            extracted_data, qa_map, supplier_name,
            category, region_config, region,
        )

        local_special_mismatches = check_special_rules(
            extracted_data, qa_map, category,
            region_config, region, qa_data_title,
        )

        if any(m.get("field") in ("Public Liability Amount",) for m in local_special_mismatches):
            intercept = InterceptType.PL_INSUFFICIENT

        combined = local_mismatches + local_special_mismatches
        table_entry["comparison_rows"] = build_comparison_rows(
            extracted_data, qa_map, supplier_name,
            combined, category, region,
        )

        table_entry["intercept_type"] = intercept.value if intercept else None
        table_entry["expiry_status"] = expiry_status.value if expiry_status else None

        if intercept:
            overall_verdict = "Mismatch"

        table_entry_has_mismatch = any(
            r["result"] == "Mismatch" for r in table_entry["comparison_rows"]
        )
        if table_entry_has_mismatch:
            overall_verdict = "Mismatch"

        comparison_table["tables"].append(table_entry)

        has_intercept = intercept and intercept not in (
            InterceptType.NONE, InterceptType.PL_INSUFFICIENT, InterceptType.FIELD_MISMATCH,
        )

        comment_mismatches = local_mismatches[:]
        if intercept:
            comment_mismatches = []

        entry_lines = None
        if has_intercept or comment_mismatches or local_special_mismatches:
            entry_lines = build_comment_lines(
                intercept, intercept_params,
                comment_mismatches, local_special_mismatches,
            )

        if entry_lines:
            if has_intercept:
                group_key = (intercept.value,) + tuple(sorted(
                    (k, str(v)) for k, v in intercept_params.items()
                ))
                intercept_groups[group_key].append({
                    "label": question_label + cert_suffix,
                    "filename": filename,
                    "lines": entry_lines,
                })
            else:
                label = (f"{question_label} ({filename})" if filename else question_label) + cert_suffix
                block = f"{label}:\n" + "\n".join(f"- {line}" for line in entry_lines)
                all_comment_parts.append(block)

    for entries in intercept_groups.values():
        if len(entries) >= 2:
            labels = [e["label"] for e in entries]
            message = entries[0]["lines"][0]
            all_comment_parts.append(f"{', '.join(labels)} - {message}")
        else:
            entry = entries[0]
            label = f"{entry['label']} ({entry['filename']})" if entry["filename"] else entry["label"]
            block = f"{label}:\n" + "\n".join(f"- {line}" for line in entry["lines"])
            all_comment_parts.append(block)

    def _comment_sort_key(comment_block: str) -> list[int]:
        m = RE_SORT_PREFIX.search(comment_block)
        if m:
            try:
                return [int(x) for x in m.group(1).split(".")]
            except Exception:
                pass
        return [9999]

    all_comment_parts.sort(key=_comment_sort_key)

    if not all_comment_parts:
        suggested_comment = "All match."
    else:
        suggested_comment = "\n\n".join(all_comment_parts)

    return overall_verdict, suggested_comment, comparison_table
