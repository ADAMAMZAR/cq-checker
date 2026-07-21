import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from app.regions import Region, RegionConfig, detect_region, get_region_config, is_contractors_questionnaire

logger = logging.getLogger(__name__)


class DocCategory(Enum):
    TECHNICAL_CERTIFICATE = "TECHNICAL_CERTIFICATE"
    PUBLIC_LIABILITY = "PUBLIC_LIABILITY"
    PERSONAL_CERTIFICATE = "PERSONAL_CERTIFICATE"
    OTHER_RECOGNITION = "OTHER_RECOGNITION"
    RECERTIFICATION_LETTER = "RECERTIFICATION_LETTER"
    SSM_PROFILE = "SSM_PROFILE"


class InterceptType(Enum):
    NONE = None
    WRONG_DOC = "WRONG_DOC"
    WRONG_STANDARD = "WRONG_STANDARD"
    SSM_UPLOAD = "SSM_UPLOAD"
    RECERTIFICATION_LETTER = "RECERTIFICATION_LETTER"
    SUPPLIER_MISMATCH = "SUPPLIER_MISMATCH"
    EXPIRED = "EXPIRED"
    PL_INSUFFICIENT = "PL_INSUFFICIENT"
    MULTIPLE_CERTIFICATES = "MULTIPLE_CERTIFICATES"
    FIELD_MISMATCH = "FIELD_MISMATCH"
    PERMANENT_DATE_REVISION = "PERMANENT_DATE_REVISION"


class ExpiryStatus(Enum):
    VALID = "VALID"
    EXPIRED = "EXPIRED"
    NOT_LISTED = "NOT_LISTED"
    PERMANENT_MATCH = "PERMANENT_MATCH"
    PERMANENT_NEEDS_REVISION = "PERMANENT_NEEDS_REVISION"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_text(s: str) -> str:
    if not s:
        return ""
    return re.sub(r'[^\w\s]', '', s).strip().lower()


def _normalize_date(s: str) -> str:
    s = str(s).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return s


def _parse_date(s: str) -> Optional[datetime]:
    s = str(s).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _add_years(dt: datetime, years: int) -> datetime:
    try:
        return dt.replace(year=dt.year + years)
    except ValueError:
        return dt


def _today() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Strict matching (Certificate Numbers) — char-by-char, case-insensitive
# ---------------------------------------------------------------------------

def match_strict(evidence: str, qa: str) -> bool:
    if not evidence or not qa:
        return False
    return evidence.strip().lower() == qa.strip().lower()


# ---------------------------------------------------------------------------
# Supplier name matching — QA (Ariba) is source of truth
# ---------------------------------------------------------------------------

def match_supplier(evidence: str, qa: str) -> bool:
    """Supplier name matching where QA (Ariba data) is the source of truth.
    Bidirectional — extra tokens on either side are allowed as long as
    all meaningful (>1 char) tokens from the shorter value appear in the longer one.
    """
    def _cln(s: str) -> str:
        if not s:
            return ""
        s = str(s).strip().lower()
        if s in ("n/a", "na", "-", "missing", "none", "null", ""):
            return ""
        return s

    ev = _cln(evidence)
    qa = _cln(qa)

    if not ev and not qa:
        return True
    if not ev:
        return True
    if not qa:
        return False

    if ev == qa:
        return True
    if qa in ev or ev in qa:
        return True

    ev_suff = _normalize_suffixes(ev)
    qa_suff = _normalize_suffixes(qa)
    if ev_suff == qa_suff:
        return True
    if qa_suff in ev_suff or ev_suff in qa_suff:
        return True

    ev_tokens = set(w for w in re.sub(r'[^\w\s]', '', ev_suff).split() if len(w) > 1)
    qa_tokens = set(w for w in re.sub(r'[^\w\s]', '', qa_suff).split() if len(w) > 1)

    if ev_tokens and qa_tokens:
        if ev_tokens.issubset(qa_tokens) or qa_tokens.issubset(ev_tokens):
            return True

    return False


# ---------------------------------------------------------------------------
# Flexible matching (Names, Addresses, Issuers)
# ---------------------------------------------------------------------------

SUFFIX_MAP = {
    "pty ltd": "private limited",
    "ptyltd": "private limited",
    "sdn bhd": "sendirian berhad",
    "sdnbhd": "sendirian berhad",
    "limited": "ltd",
    "incorporated": "inc",
}


def _normalize_suffixes(s: str) -> str:
    words = s.split()
    result = []
    i = 0
    while i < len(words):
        bigram = (words[i] + " " + words[i + 1]) if i + 1 < len(words) else None
        trigram = (words[i] + " " + words[i + 1] + " " + words[i + 2]) if i + 2 < len(words) else None
        matched = False
        for variant, canonical in SUFFIX_MAP.items():
            if bigram == variant or trigram == variant:
                result.append(canonical)
                i += len(variant.split())
                matched = True
                break
        if not matched:
            result.append(words[i])
            i += 1
    return " ".join(result)


def match_flexible(evidence: str, qa: str) -> bool:
    def _cln(s: str) -> str:
        if not s:
            return ""
        s = str(s).strip().lower()
        if s in ("n/a", "na", "-", "missing", "none", "null", ""):
            return ""
        return s

    ev = _cln(evidence)
    qa = _cln(qa)

    if not ev and not qa:
        return True
    if not ev:
        return True
    if not qa:
        return False

    # Exact match after normalization
    if ev == qa:
        return True

    # Substring — QA must be contained within evidence (not the reverse)
    if qa in ev:
        return True

    # Normalize suffix variations and retry
    ev_suff = _normalize_suffixes(ev)
    qa_suff = _normalize_suffixes(qa)
    if ev_suff == qa_suff:
        return True
    if qa_suff in ev_suff:
        return True

    # Token subset — evidence is source of truth: QA must be within evidence
    ev_tokens = set(w for w in re.sub(r'[^\w\s]', '', ev_suff).split() if len(w) > 1)
    qa_tokens = set(w for w in re.sub(r'[^\w\s]', '', qa_suff).split() if len(w) > 1)

    if qa_tokens and qa_tokens.issubset(ev_tokens):
        return True

    return False


# ---------------------------------------------------------------------------
# Location matching (MY-specific: regional address satisfies generic)
# ---------------------------------------------------------------------------

def match_location(evidence: str, qa: str) -> bool:
    def _cln(s: str) -> str:
        if not s:
            return ""
        s = str(s).strip().lower()
        if s in ("n/a", "na", "-", "missing", "none", "null", ""):
            return ""
        return s

    ev = _cln(evidence)
    qa = _cln(qa)

    if not ev and not qa:
        return True
    if not ev or not qa:
        return False

    if ev == qa:
        return True
    if qa in ev or ev in qa:
        return True

    return False


# ---------------------------------------------------------------------------
# Document Classification
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Expiry Calculation
# ---------------------------------------------------------------------------

def _is_na(s: str) -> bool:
    return not s or s.strip().lower() in ("n/a", "na", "-", "missing", "none", "null", "not listed", "")


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

    # Treat as permanent if: isPermanent flag is set, OR expiry date is N/A
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


# ---------------------------------------------------------------------------
# Public Liability Amount Parsing
# ---------------------------------------------------------------------------

def parse_pl_amount(raw: Optional[str]) -> Optional[float]:
    if not raw:
        return None
    raw = str(raw).strip()
    if raw.lower() in ("n/a", "na", "-", "missing", "none", "null", ""):
        return None

    raw_clean = raw.replace(",", "").replace(" ", "").lower()
    raw_clean = re.sub(r'[aud$aud\$aud\$]', '', raw_clean, flags=re.IGNORECASE).strip()

    m = re.match(r'^(\d+(?:\.\d+)?)\s*m$', raw_clean)
    if m:
        return float(m.group(1)) * 1_000_000

    m = re.match(r'^(\d+(?:\.\d+)?)$', raw_clean)
    if m:
        return float(m.group(1))

    return None


# ---------------------------------------------------------------------------
# Check Standard Equivalence
# ---------------------------------------------------------------------------

def check_standard_equivalence(
    evidence_cert_type: str,
    qa_cert_type: str,
    region_config: RegionConfig,
) -> bool:
    ev = _normalize_text(evidence_cert_type)
    qa = _normalize_text(qa_cert_type)

    if ev == qa:
        return True

    for alt, canonical in region_config.accepted_standards.items():
        if ev == alt and qa == canonical:
            return True

    return False


# ---------------------------------------------------------------------------
# Main field matching — returns list of Mismatch dicts
# ---------------------------------------------------------------------------

def match_fields(
    extracted_data: dict,
    qa_map: dict,
    supplier_name: str,
    category: DocCategory,
    region_config: RegionConfig,
    region: Region,
) -> list:
    mismatches = []

    field_display = {
        "Certificate Type": "certificate type",
        "Supplier Name": "supplier name",
        "Issuer": "issuer",
        "Year of Publication": "year of publication",
        "Certificate Number": "certificate number",
        "Certificate Location": "certificate location",
        "Effective Date": "effective date",
        "Expiration Date": "expiration date",
    }

    # 1. Certificate Type (flexible match first, then standard equivalence)
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

    # 2. Supplier Name (QA/Ariba is source of truth)
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
            match = re.search(r'\b(20\d\d|19\d\d)\b', eff_date)
            if match:
                ev_yop = match.group(1)
    qa_yop = qa_map.get("year of publication", "N/A")
    ev_yop_stripped = ev_yop.strip() if ev_yop else ""
    qa_yop_stripped = qa_yop.strip() if qa_yop else ""
    # If evidence is N/A (couldn't determine year), accept whatever QA entered
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

    # Add Public Liability Amount row for PL-classified documents
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


def _extract_year(extracted_data: dict) -> str:
    ev = extracted_data.get("yearOfPublication", "N/A")
    if not ev or _is_na(ev):
        eff = extracted_data.get("effectiveDate", "")
        if eff and not _is_na(eff):
            m = re.search(r'\b(20\d\d|19\d\d)\b', eff)
            if m:
                return m.group(1)
    return ev


# ---------------------------------------------------------------------------
# Special Rules
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Comment Builder — uses exact templates from system-instruction.md
# ---------------------------------------------------------------------------

def build_comment_lines(
    intercept: Optional[InterceptType],
    intercept_params: dict,
    mismatches: list,
    special_mismatches: list,
) -> Optional[list]:
    """Return a list of bullet-point lines for this entry, or None if nothing to say.
    Each line should NOT include the leading '- ' — the orchestrator adds it."""
    parts = []

    if intercept == InterceptType.RECERTIFICATION_LETTER:
        parts.append(
            "The submitted document is a recertification letter or confirmation of registration renewal, "
            "which is not acceptable for this item. Please provide the official, valid, and unexpired ISO certificate instead."
        )
    elif intercept == InterceptType.SSM_UPLOAD:
        expected = intercept_params.get("expected_type", "technical certificate")
        parts.append(
            f"The submitted document is an SSM corporate profile registration, which is not acceptable for this item. "
            f"Please remove the SSM profile and upload a valid, unexpired {expected} certificate instead."
        )
    elif intercept == InterceptType.EXPIRED:
        parts.append(
            "The submitted certificate has expired. Please provide a valid, unexpired certificate document."
        )
    elif intercept == InterceptType.PL_INSUFFICIENT:
        parts.append(
            "Stated coverage amount does not meet the minimum requirement. "
            "Please revise the document and provide a certificate with a minimum coverage of AUD 20 million."
        )
    elif intercept == InterceptType.MULTIPLE_CERTIFICATES:
        parts.append(
            "The uploaded file contains two different certificates. To claim recognition for the additional certificate, "
            "please add a new 'Other Recognition' item in Ariba, upload this exact same file, "
            "and fill in the input details according to that second certificate."
        )
    elif intercept == InterceptType.PERMANENT_DATE_REVISION:
        calculated_date = intercept_params.get("calculated_expiry", "")
        parts.append(
            f"Please revise the Expiration Date to \"{calculated_date} (DD/MM/YYYY)\" "
            f"as the certificate is unexpirable/permanent."
        )
    elif intercept == InterceptType.WRONG_DOC:
        extracted_type = intercept_params.get("extracted_type", "unknown")
        parts.append(
            f"The attachment submitted for this item belongs to your {extracted_type} certification context. "
            f"We kindly request that you change the certificate that you attached in this question "
            f"to another relevant certificate, or remove it from this question."
        )
    elif intercept == InterceptType.WRONG_STANDARD:
        ev = intercept_params.get("evidence_type", "unknown")
        qa = intercept_params.get("expected_type", "requested")
        parts.append(
            f"The submitted document shows a {ev} standard. "
            f"Please provide a valid, unexpired certificate specifically covering the requested {qa} standard context."
        )
    elif intercept == InterceptType.SUPPLIER_MISMATCH:
        cert_supplier = intercept_params.get("cert_supplier", "unknown")
        qa_supplier = intercept_params.get("qa_supplier", "unknown")
        cert_type = intercept_params.get("cert_type", "certificate")
        parts.append(
            f"You have submitted a '{cert_type}' for {cert_supplier}. "
            f"Please submit a '{cert_type}' for {qa_supplier} in this item. "
            f"Otherwise, please select 'No' in this item if you do not hold a '{cert_type}' for {qa_supplier}."
        )

    for m in mismatches:
        disp = m["field"]
        ev = m["evidence"]
        # For Supplier Name, QA (Ariba) is the source of truth
        if disp == "Supplier Name":
            qa_val = m["qa"]
            parts.append(f"Please revise the {disp} to \"{qa_val}\"")
        else:
            parts.append(f"Please revise the {disp} to \"{ev}\"")

    for m in special_mismatches:
        if m["field"] == "Public Liability Amount":
            parts.append(
                "Stated coverage amount does not meet the minimum requirement. "
                "Please revise the document and provide a certificate with a minimum coverage of AUD 20 million."
            )
        elif m["field"] == "CIDB Certificate":
            parts.append(
                "A valid CIDB certificate is required for this questionnaire. "
                "Please upload a valid, unexpired CIDB certificate."
            )

    return parts if parts else None


# ---------------------------------------------------------------------------
# Clean question label (strip trailing instructions after dash)
# ---------------------------------------------------------------------------

def clean_question_label(label: Optional[str]) -> str:
    if not label:
        return "General Attachment"
    label = label.strip()
    parts = re.split(r'\s+[-–—]\s*|\s*[-–—]\s+', label, maxsplit=1)
    cleaned = parts[0].strip() if parts else label
    return cleaned or "General Attachment"


# ---------------------------------------------------------------------------
# Orchestrator — Evaluation Precedence Waterfall
# ---------------------------------------------------------------------------

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

    pairs = list(zip(file_contexts, extraction_results))

    def _sort_key(pair):
        label = clean_question_label(pair[0].get("ariba_question_label", "General Attachment"))
        m = re.match(r'^(\d+(?:\.\d+)*)', label)
        if m:
            try:
                return [int(x) for x in m.group(1).split(".")]
            except Exception:
                pass
        return [999]

    pairs.sort(key=_sort_key)

    all_comment_parts = []
    intercept_groups = defaultdict(list)

    for ctx, extracted_data in pairs:
        question_label = clean_question_label(ctx.get("ariba_question_label", "General Attachment"))
        qa_answers_str = ctx.get("ariba_qa_answers", "[]")
        filename = ctx.get("filename", "")

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

        intercept = None
        intercept_params = {}
        expiry_status = None
        local_mismatches = []
        local_special_mismatches = []

        # --- Intercept stage (highest precedence) ---
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
            # Check for Wrong Document / Cross-Upload
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
            # Check Supplier Name Mismatch (for corporate certs)
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

        # --- Metadata stage (always run so comparison rows are complete) ---
        local_mismatches = match_fields(
            extracted_data, qa_map, supplier_name,
            category, region_config, region,
        )

        local_special_mismatches = check_special_rules(
            extracted_data, qa_map, category,
            region_config, region, qa_data_title,
        )

        all_mismatches = local_mismatches + local_special_mismatches
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

        # Build comment for this entry
        has_intercept = intercept and intercept not in (
            InterceptType.NONE, InterceptType.PL_INSUFFICIENT, InterceptType.FIELD_MISMATCH,
        )

        # When an intercept fires, suppress ALL field-level revision messages
        # (comparison table still shows the full picture)
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
                # Groupable intercept — collect for potential merging
                group_key = (intercept.value,) + tuple(sorted(
                    (k, str(v)) for k, v in intercept_params.items()
                ))
                intercept_groups[group_key].append({
                    "label": question_label,
                    "filename": filename,
                    "lines": entry_lines,
                })
            else:
                # Non-intercept entries (field-level, PL_INSUFFICIENT) — keep individual
                label = f"{question_label} ({filename})" if filename else question_label
                block = f"{label}:\n" + "\n".join(f"- {line}" for line in entry_lines)
                all_comment_parts.append(block)

    # Merge groups with the same intercept reason
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

    if not all_comment_parts:
        suggested_comment = "All match."
    else:
        body = "\n\n".join(all_comment_parts)
        suggested_comment = (
            "Dear Sir/Madam,\n\n"
            "We seek for your resubmission for the following in Part 2: Modular Certificates Questionnaire:\n\n"
            f"{body}\n\n"
            "Thank you."
        )

    return overall_verdict, suggested_comment, comparison_table
