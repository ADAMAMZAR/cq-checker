"""Qwen Reasoning judge for certificate verification.

Takes the extracted JSON + the deterministic RuleResult, asks Qwen to produce a
CoT reasoning trace and a PASS / FAIL / REQUIRES_HUMAN_REVIEW verdict. If Qwen
is unreachable, falls back to the deterministic rules so the pipeline never
hard-fails.
"""

import json
import logging
from typing import Any, Dict, Optional

import requests

from app.config import settings
from app.services.rules import RuleResult, verify_document

logger = logging.getLogger(__name__)

VALID_STATUSES = ("PASS", "FAIL", "REQUIRES_HUMAN_REVIEW")


def _derive_status_from_rules(rule: RuleResult) -> str:
    """Map the deterministic verdict to a status without calling Qwen."""
    if rule.verdict == "Match":
        return "PASS"
    # Intercepts that are unambiguous → FAIL; borderline → human review
    hard_intercepts = {
        "RECERTIFICATION_LETTER", "SSM_UPLOAD", "EXPIRED",
        "PL_INSUFFICIENT", "WRONG_STANDARD", "SUPPLIER_MISMATCH", "WRONG_DOC",
    }
    if rule.intercept_type in hard_intercepts:
        return "FAIL"
    if rule.expiry_status == "PERMANENT_NEEDS_REVISION":
        return "FAIL"
    return "REQUIRES_HUMAN_REVIEW"


def judge_certificate(
    extracted_data: Dict[str, Any],
    supplier_name: str,
    ariba_question_label: Optional[str] = None,
    ariba_qa_answers: Optional[str] = "[]",
    qa_data_title: str = "",
) -> Dict[str, Any]:
    """Run the deterministic rules + Qwen CoT reasoning.

    Returns a dict:
        {
          "status": "PASS"|"FAIL"|"REQUIRES_HUMAN_REVIEW",
          "reasoning_trace": str,
          "confidence": float,
          "rule_result": {...},
          "judge_source": "qwen"|"rules"
        }
    """
    rule = verify_document(
        extracted_data, supplier_name,
        ariba_question_label=ariba_question_label,
        ariba_qa_answers=ariba_qa_answers,
        qa_data_title=qa_data_title,
    )

    rule_payload = {
        "verdict": rule.verdict,
        "region": rule.region,
        "category": rule.category,
        "intercept_type": rule.intercept_type,
        "expiry_status": rule.expiry_status,
        "reasons": rule.reasons[:10],
        "comparison_rows": rule.comparison_rows,
    }

    try:
        if not settings.qwen_api_key:
            raise RuntimeError("QWEN_API_KEY not configured")

        url = settings.qwen_base_url.rstrip("/") + "/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.qwen_api_key}",
            "Content-Type": "application/json",
        }
        prompt = (
            "You are a meticulous certificate compliance judge. Review the EXTRACTED_DATA and the "
            "DETERMINISTIC_RULE_RESULT below. "
            "Produce a strict Chain-of-Thought reasoning trace, then a final verdict.\n"
            "Rules: PASS when the certificate satisfies all compliance checks; "
            "FAIL when an unambiguous violation exists (expired, wrong standard, wrong supplier, "
            "insufficient coverage, recertification letter, SSM profile); "
            "REQUIRES_HUMAN_REVIEW when borderline, missing data, or low confidence prevents a clear decision.\n"
            "Respond ONLY with a JSON object: "
            '{"status": "PASS"|"FAIL"|"REQUIRES_HUMAN_REVIEW", "reasoning_trace": "...", "confidence": 0.0-1.0}'
            f"\n\nEXTRACTED_DATA:\n{json.dumps(extracted_data, indent=2)}"
            f"\n\nDETERMINISTIC_RULE_RESULT:\n{json.dumps(rule_payload, indent=2)}"
        )
        payload = {
            "model": settings.qwen_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        body = resp.json()
        content = body["choices"][0]["message"]["content"]

        # Strip markdown fences if present
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        result = json.loads(content)
        status = result.get("status", _derive_status_from_rules(rule))
        if status not in VALID_STATUSES:
            status = _derive_status_from_rules(rule)
        confidence = float(result.get("confidence", 0.5))

        return {
            "status": status,
            "reasoning_trace": str(result.get("reasoning_trace", "")),
            "confidence": round(confidence, 3),
            "rule_result": rule_payload,
            "judge_source": "qwen",
        }
    except Exception as e:
        logger.warning(f"Qwen judge failed ({e}) — falling back to deterministic rules.")
        status = _derive_status_from_rules(rule)
        return {
            "status": status,
            "reasoning_trace": "Deterministic rules only (Qwen unavailable). " + "; ".join(rule.reasons[:8]),
            "confidence": 0.9 if status == "PASS" else 0.7,
            "rule_result": rule_payload,
            "judge_source": "rules",
        }
