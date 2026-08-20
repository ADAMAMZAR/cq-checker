import re
from datetime import datetime, timezone
from typing import Optional
from app.region_configs import RegionConfig

# Pre-compiled regex patterns for maximum matching performance
RE_NON_ALPHANUM = re.compile(r'[^\w\s]')
RE_YEAR = re.compile(r'\b(20\d\d|19\d\d)\b')
RE_PL_M = re.compile(r'^(\d+(?:\.\d+)?)\s*m$')
RE_PL_NUM = re.compile(r'^(\d+(?:\.\d+)?)$')
RE_PL_CLEAN = re.compile(r'[aud$aud\$aud\$]', re.IGNORECASE)
RE_SORT_PREFIX = re.compile(r'^(\d+(?:\.\d+)*)')

SUFFIX_MAP = {
    "pty ltd": "private limited",
    "ptyltd": "private limited",
    "sdn bhd": "sendirian berhad",
    "sdnbhd": "sendirian berhad",
    "limited": "ltd",
    "incorporated": "inc",
}

DATE_FORMATS = ("%d/%m/%Y", "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y")


def _is_na(s: str) -> bool:
    return not s or str(s).strip().lower() in ("n/a", "na", "-", "missing", "none", "null", "not listed", "")


def _normalize_text(s: str) -> str:
    if not s:
        return ""
    return RE_NON_ALPHANUM.sub('', s).strip().lower()


def _normalize_date(s: str) -> str:
    s = str(s).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return s


def _parse_date(s: str) -> Optional[datetime]:
    s = str(s).strip()
    for fmt in DATE_FORMATS:
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


def match_strict(evidence: str, qa: str) -> bool:
    if not evidence or not qa:
        return False
    return evidence.strip().lower() == qa.strip().lower()


def match_supplier(evidence: str, qa: str) -> bool:
    """Supplier name matching where QA (Ariba data) is the source of truth."""
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

    ev_tokens = set(w for w in RE_NON_ALPHANUM.sub('', ev_suff).split() if len(w) > 1)
    qa_tokens = set(w for w in RE_NON_ALPHANUM.sub('', qa_suff).split() if len(w) > 1)

    if ev_tokens and qa_tokens:
        if ev_tokens.issubset(qa_tokens) or qa_tokens.issubset(ev_tokens):
            return True

    return False


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

    if ev == qa:
        return True

    if qa in ev:
        return True

    ev_suff = _normalize_suffixes(ev)
    qa_suff = _normalize_suffixes(qa)
    if ev_suff == qa_suff:
        return True
    if qa_suff in ev_suff:
        return True

    ev_tokens = set(w for w in RE_NON_ALPHANUM.sub('', ev_suff).split() if len(w) > 1)
    qa_tokens = set(w for w in RE_NON_ALPHANUM.sub('', qa_suff).split() if len(w) > 1)

    if qa_tokens and qa_tokens.issubset(ev_tokens):
        return True

    return False


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
