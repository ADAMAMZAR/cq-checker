"""Region and Multilingual Router for Procurement Assistant.

Classifies user query intent by region (MY, AU, TW, VN, GENERAL) and language,
enforcing strict document isolation and localized output language instructions.
"""

import re
from typing import Dict, List, Optional, Tuple


def detect_document_region(title: str) -> str:
    """Classify a document's region from its title or filename during ingestion."""
    t = (title or "").lower()
    if any(k in t for k in ["vietnam", "vietnamese", "việt nam", "(vn)", "_vn"]):
        return "VN"
    if any(k in t for k in ["taiwan", "taiwanese", "台灣", "臺灣", "(tw)", "_tw"]):
        return "TW"
    if any(k in t for k in ["malaysia", "malaysian", "(my)", "_my"]):
        return "MY"
    if any(k in t for k in ["australia", "australian", "(au)", "_au"]):
        return "AU"
    return "GENERAL"


# Regex patterns for script detection
VIETNAMESE_PATTERN = re.compile(r"[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", re.IGNORECASE)
CHINESE_PATTERN = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")


def classify_query_intent(query_text: str) -> Dict[str, any]:
    """Classify input query intent into target document regions and output language.

    Returns:
        {
            "detected_region": "VN" | "TW" | "MY" | "AU" | "GENERAL",
            "target_regions": ["VN", "GENERAL"] or None,
            "detected_lang": "vi" | "zh-TW" | "en",
            "output_lang_name": "Vietnamese (Tiếng Việt)" | "Traditional Chinese (繁體中文)" | "English",
            "user_asked_in_english": bool,
        }
    """
    q_raw = query_text or ""
    q_lower = q_raw.lower().strip()

    # 1. Detect Script / Language
    has_vietnamese = bool(VIETNAMESE_PATTERN.search(q_raw))
    has_chinese = bool(CHINESE_PATTERN.search(q_raw))

    user_asked_in_english = not (has_vietnamese or has_chinese)

    # 2. Detect Region intent
    detected_region = "GENERAL"
    if has_vietnamese or any(k in q_lower for k in ["vietnam", "vietnamese", "việt nam", " vn"]):
        detected_region = "VN"
    elif has_chinese or any(k in q_lower for k in ["taiwan", "taiwanese", "台灣", "臺灣", " tw"]):
        detected_region = "TW"
    elif any(k in q_lower for k in ["malaysia", "malaysian", "my", "rm", "kuala lumpur", "selangor"]):
        detected_region = "MY"
    elif any(k in q_lower for k in ["australia", "australian", "au", "aud", "sydney", "melbourne"]):
        detected_region = "AU"

    # 3. Determine Target Document Regions Filter
    target_regions: Optional[List[str]] = None
    if detected_region != "GENERAL":
        target_regions = [detected_region, "GENERAL"]

    # 4. Determine Output Language Name for LLM Prompt
    if has_vietnamese:
        output_lang_name = "Vietnamese (Tiếng Việt)"
        detected_lang = "vi"
    elif has_chinese:
        output_lang_name = "Traditional Chinese (繁體中文)"
        detected_lang = "zh-TW"
    else:
        output_lang_name = "English"
        detected_lang = "en"

    return {
        "detected_region": detected_region,
        "target_regions": target_regions,
        "detected_lang": detected_lang,
        "output_lang_name": output_lang_name,
        "user_asked_in_english": user_asked_in_english,
    }
