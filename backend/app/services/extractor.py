"""DeepSeek V4 Flash certificate extractor (vision, JSON mode).

Accepts a certificate PDF (or image), renders PDF pages to images locally, and
asks DeepSeek V4 Flash to extract structured fields + per-field confidence.
Falls back to the Gemini mock/error shape when the API key is missing or the
call fails, so callers never crash.
"""

import base64
import json
import logging
from typing import Any, Dict, List, Optional

import requests

from app.config import settings
from app.services import pdf

logger = logging.getLogger(__name__)

# DeepSeek pricing (USD per 1M tokens) — approximate; cache/off-peak may lower it
INPUT_RATE = 0.20 / 1_000_000
OUTPUT_RATE = 1.00 / 1_000_000

EXTRACTION_SCHEMA = {
    "type": "object",
    "required": [
        "certificateOwnerName", "issuerName", "certificateType",
        "certificateNumber", "expirationDate", "effectiveDate",
        "certificateLocation", "yearOfPublication",
    ],
    "properties": {
        "certificateOwnerName": {"type": "string"},
        "issuerName": {"type": "string"},
        "certificateType": {"type": "string"},
        "certificateNumber": {"type": "string"},
        "expirationDate": {"type": "string"},
        "effectiveDate": {"type": "string"},
        "certificateLocation": {"type": "string"},
        "yearOfPublication": {"type": "string"},
        "publicLiabilityAmount": {"type": "string"},
        "currency": {"type": "string"},
        "hasMultipleCertificates": {"type": "boolean"},
        "additionalCertificateType": {"type": "string"},
        "isPermanent": {"type": "boolean"},
        "recertificationLetter": {"type": "boolean"},
        "confidence": {
            "type": "object",
            "properties": {
                "certificateOwnerName": {"type": "number"},
                "issuerName": {"type": "number"},
                "certificateType": {"type": "number"},
                "certificateNumber": {"type": "number"},
                "expirationDate": {"type": "number"},
            },
            "required": [
                "certificateOwnerName", "issuerName", "certificateType",
                "certificateNumber", "expirationDate",
            ],
        },
    },
}

MOCK_EXTRACTION = {
    "certificateOwnerName": "MOCK SUPPLIER",
    "issuerName": "MOCK ISSUER",
    "certificateType": "MOCK CERT",
    "certificateNumber": "MOCK-12345",
    "expirationDate": "31/12/2029",
    "effectiveDate": "01/01/2026",
    "certificateLocation": "Selangor, Malaysia",
    "yearOfPublication": "2026",
}

FAILED_EXTRACTION = {
    "certificateOwnerName": "Extraction Failed",
    "issuerName": "N/A",
    "certificateType": "N/A",
    "certificateNumber": "N/A",
    "expirationDate": "N/A",
    "effectiveDate": "N/A",
    "certificateLocation": "N/A",
}


def calculate_cost(prompt_tokens: int, output_tokens: int,
                   input_rate: float = INPUT_RATE,
                   output_rate: float = OUTPUT_RATE) -> float:
    return (prompt_tokens * input_rate) + (output_tokens * output_rate)


def _estimate_tokens(message_count: int) -> int:
    """Rough token estimate: ~150 tokens per image page + 300 for text."""
    return (message_count * 150) + 300


def _build_messages(file_bytes: bytes, mime_type: str, question_label: Optional[str]) -> List[dict]:
    """Build an OpenAI-compatible messages payload from a PDF or image."""
    if pdf.is_pdf(mime_type) or file_bytes[:4] == b"%PDF":
        image_urls = pdf.pdf_to_data_urls(file_bytes)
    else:
        # Single image upload — send as-is
        image_urls = [pdf.image_to_data_url(file_bytes)]

    section_note = (
        f"\nNote: If this document contains multiple different certificates merged together, "
        f"only extract the metadata for the specific certificate relevant to '{question_label}'."
    ) if question_label else ""

    prompt = (
        "You are a high-precision certificate OCR extractor. Extract every field exactly as written. "
        "Use 'N/A' for any field not found. Dates must be formatted as DD/MM/YYYY. "
        "yearOfPublication must be the 4-digit year (e.g. 2024); if absent, use the year from effectiveDate. "
        "certificateLocation must be 'State, Country' (e.g. Selangor, Malaysia)."
        f"{section_note} "
        "If a public liability/insurance coverage amount appears, extract it under publicLiabilityAmount "
        "(e.g. '20,000,000', '20M'). Extract the currency under currency ('$' alone -> 'AUD'). "
        "If TWO OR MORE distinct certificates are present, set hasMultipleCertificates to true and describe the "
        "additional type under additionalCertificateType. "
        "If the certificate is permanent/non-expiring (e.g. 'KEKAL SAH', 'NO EXPIRY'), set isPermanent to true. "
        "If it is a recertification/renewal letter (not a full certificate), set recertificationLetter to true. "
        "For each core field, output a confidence score between 0 and 1 under 'confidence'."
    )

    content: List[dict] = []
    for url in image_urls:
        content.append({"type": "image_url", "image_url": {"url": url}})
    content.append({"type": "text", "text": prompt})

    return [{"role": "user", "content": content}]


def extract_certificate_data(
    file_bytes: bytes,
    mime_type: str,
    question_label: Optional[str] = None,
) -> tuple[Dict[str, Any], int, int, float]:
    """Extract certificate fields via DeepSeek V4 Flash.

    Returns (extracted_data, input_tokens, output_tokens, cost_usd).
    """
    if not settings.deepseek_api_key:
        logger.warning("DeepSeek API key is not configured. Returning mock extraction data.")
        return dict(MOCK_EXTRACTION), 150, 45, calculate_cost(150, 45)

    try:
        messages = _build_messages(file_bytes, mime_type, question_label)
        if not messages[0]["content"]:
            return dict(FAILED_EXTRACTION), 0, 0, 0.0

        url = settings.deepseek_base_url.rstrip("/") + "/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.deepseek_model,
            "messages": messages,
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }

        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        body = resp.json()

        content = body["choices"][0]["message"]["content"]
        data = json.loads(content)

        usage = body.get("usage", {})
        in_tokens = int(usage.get("prompt_tokens", 0))
        out_tokens = int(usage.get("completion_tokens", 0))
        cost = calculate_cost(in_tokens, out_tokens)

        # Fallback yearOfPublication from effectiveDate if missing
        if not data.get("yearOfPublication") or data.get("yearOfPublication") == "N/A":
            import re
            eff = data.get("effectiveDate", "")
            m = re.search(r"\b(20\d\d|19\d\d)\b", eff or "")
            if m:
                data["yearOfPublication"] = m.group(1)

        return data, in_tokens, out_tokens, cost
    except Exception as e:
        logger.error(f"DeepSeek extraction failed: {e}")
        fallback = dict(FAILED_EXTRACTION)
        fallback["error"] = str(e)
        return fallback, 0, 0, 0.0
