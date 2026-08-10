import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

"""Gemini 3.5 Flash Lite certificate extractor (vision, JSON mode).

Accepts a certificate PDF (or image), sends it to Gemini 3.5 Flash Lite to
extract structured fields + per-field confidence (enforced via a response
schema). A single document may contain multiple merged certificates — each one
is extracted into its own item under the `certificates` array. Falls back to
the mock/error shape when the API key is missing or the call fails, so callers
never crash.
"""

import json
import logging
import re
from typing import Any, Dict, Optional

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

# Initialize the new google-genai SDK. Clients are constructed once at module
# load (if an API key is set) and reused. Tests can patch
# `app.services.extractor._client` to swap a MagicMock in.
_client: Optional[genai.Client] = None
if settings.gemini_api_key:
    _client = genai.Client(api_key=settings.gemini_api_key)

_MODEL_NAME = "gemini-3.5-flash-lite"

# Gemini pricing (USD per 1M tokens) — approximate; adjust when the published
# gemini-3.5-flash-lite rates are confirmed.
INPUT_RATE = 0.30 / 1_000_000
OUTPUT_RATE = 2.50 / 1_000_000

# Schema for a single certificate within the `certificates` array.
SINGLE_CERT_SCHEMA = {
    "type": "object",
    "required": [
        "certificateOwnerName", "issuerName", "certificateType",
        "certificateNumber", "expirationDate", "effectiveDate",
        "certificateLocation", "yearOfPublication",
        "confidence",
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
        "confidence": {"type": "number"},
    },
}

EXTRACTION_SCHEMA = {
    "type": "object",
    "required": ["certificates"],
    "properties": {
        "certificates": {
            "type": "array",
            "items": SINGLE_CERT_SCHEMA,
        },
    },
}

MOCK_EXTRACTION = {
    "certificates": [{
        "certificateOwnerName": "MOCK SUPPLIER",
        "issuerName": "MOCK ISSUER",
        "certificateType": "MOCK CERT",
        "certificateNumber": "MOCK-12345",
        "expirationDate": "31/12/2029",
        "effectiveDate": "01/01/2026",
        "certificateLocation": "Selangor, Malaysia",
        "yearOfPublication": "2026",
        "confidence": 0.9,
    }],
}

FAILED_EXTRACTION = {
    "certificates": [{
        "certificateOwnerName": "Extraction Failed",
        "issuerName": "N/A",
        "certificateType": "N/A",
        "certificateNumber": "N/A",
        "expirationDate": "N/A",
        "effectiveDate": "N/A",
        "certificateLocation": "N/A",
        "confidence": 0.0,
    }],
}


def calculate_cost(prompt_tokens: int, output_tokens: int,
                   input_rate: float = INPUT_RATE,
                   output_rate: float = OUTPUT_RATE) -> float:
    return (prompt_tokens * input_rate) + (output_tokens * output_rate)


def _build_prompt(question_label: Optional[str]) -> str:
    return (
        "You are a high-precision certificate OCR extractor. Extract every field exactly as written. "
        "Use 'N/A' for any field not found. Dates must be formatted as DD/MM/YYYY. "
        "yearOfPublication must be the 4-digit year (e.g. 2024); if absent, use the year from effectiveDate. "
        "certificateLocation must be 'State, Country' (e.g. Selangor, Malaysia). "
        "The document may contain one or more distinct certificates. Extract EACH distinct certificate "
        "into its own object inside the 'certificates' array, in the order they appear. "
        "If the document contains only a single certificate, return exactly one object in the array. "
        "Never merge certificates together; a merged multi-page document must yield one object per certificate. "
        "If a public liability/insurance coverage amount appears, extract it under publicLiabilityAmount "
        "(e.g. '20,000,000', '20M'). Extract the currency under currency ('$' alone -> 'AUD'). "
        "If the certificate is permanent/non-expiring (e.g. 'KEKAL SAH', 'NO EXPIRY'), set isPermanent to true. "
        "If it is a recertification/renewal letter (not a full certificate), set recertificationLetter to true. "
        "Output an overall 'confidence' score (0-1) for the whole certificate."
    )


def extract_certificate_data(
    file_bytes: bytes,
    mime_type: str,
    question_label: Optional[str] = None,
) -> tuple[Dict[str, Any], int, int, float]:
    """Extract certificate fields via Gemini 3.5 Flash Lite.

    Returns (extracted_data, input_tokens, output_tokens, cost_usd) where
    extracted_data is ``{"certificates": [ {...}, ... ]}``.
    """
    if not settings.gemini_api_key:
        logger.warning("Gemini API key is not configured. Returning mock extraction data.")
        return dict(MOCK_EXTRACTION), 150, 45, calculate_cost(150, 45)

    try:
        if _client is None:
            raise RuntimeError("Gemini client not initialized (no API key).")

        prompt = _build_prompt(question_label)

        response = _client.models.generate_content(
            model=_MODEL_NAME,
            contents=[
                prompt,
                types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
            ],
            config=types.GenerateContentConfig(
                temperature=0,                            # deterministic OCR — no creativity
                response_mime_type="application/json",
                response_schema=EXTRACTION_SCHEMA,        # enforce exact keys/types
            ),
        )

        data = json.loads(response.text.strip())

        # Fallback yearOfPublication from effectiveDate if missing
        for cert in data.get("certificates", []):
            year_pub = cert.get("yearOfPublication")
            if not year_pub or year_pub == "N/A":
                eff = cert.get("effectiveDate", "")
                m = re.search(r"\b(20\d\d|19\d\d)\b", eff or "")
                if m:
                    cert["yearOfPublication"] = m.group(1)

        usage = response.usage_metadata
        in_tokens = usage.prompt_token_count if usage else 0
        out_tokens = usage.candidates_token_count if usage else 0
        cost = calculate_cost(in_tokens, out_tokens)

        return data, in_tokens, out_tokens, cost
    except Exception as e:
        logger.error(f"Gemini extraction failed: {e}")
        fallback = dict(FAILED_EXTRACTION)
        fallback["certificates"][0]["error"] = str(e)
        return fallback, 0, 0, 0.0

