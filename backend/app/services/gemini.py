import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import json
import logging
from typing import Dict, Any, Optional
import google.generativeai as genai
from app.config import settings

logger = logging.getLogger(__name__)

# Initialize the Gemini SDK
if settings.gemini_api_key:
    genai.configure(api_key=settings.gemini_api_key)

DEFAULT_SYSTEM_INSTRUCTION = """
You are a High-Precision Document Auditor. Your task is to audit extracted certificate details against Ariba QA form data.
Compare the fields and identify matches or mismatches.

Check the following:
1. Supplier Name: Verify the name on the certificate matches the Ariba Supplier Name.
2. Expiration Date: Verify the certificate is current and not expired.
3. Regional Compliance Rules:
   - Malaysia certificates: 10-year maximum validity cap.
   - Australia certificates: 3-year maximum validity cap.
4. If there is any mismatch, generate a standard suggested comment (e.g. "Wrong Standard", "SSM Upload Mismatch", "Supplier Name Mismatch", "Certificate Expired").

CRITICAL CONSTRAINT: You must never request a text revision of the 'Certificate Type' field; you may only flag mismatched categories.

Return strictly as a JSON object matching these exact keys:
{
  "result": "Match" or "Mismatch",
  "expiration_date": "YYYY-MM-DD" (or the date format in certificate, or "Expired", or "N/A"),
  "suggested_comment": "concise suggested comments detailing any issues or confirming approval",
  "comparison_table": "markdown comparison table comparing Supplier Name, Expiration Date, etc. (headers: Field Name, QA Value, Certificate Value, Status)"
}
"""

def extract_certificate_data(file_bytes: bytes, mime_type: str) -> Dict[str, Any]:
    """
    Calls Gemini 2.5 Flash to perform OCR and extract certificate data as JSON.
    """
    if not settings.gemini_api_key:
        logger.warning("Gemini API key is not configured. Returning empty structure.")
        return {
            "supplierName": "MOCK SUPPLIER",
            "issuerName": "MOCK ISSUER",
            "certificateType": "MOCK CERT",
            "certificateNumber": "MOCK-12345",
            "expirationDate": "2029-12-31",
            "effectiveDate": "2026-01-01"
        }

    try:
        # Use gemini-2.5-flash for fast document extraction
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        prompt = (
            "Extract the following details from this certificate: "
            "Certificate Owner Name, Issuer, Certificate Type, Certificate Number, Expiration Date, Effective Date. "
            "Return strictly as a JSON object matching these keys: "
            "certificateOwnerName, issuerName, certificateType, certificateNumber, expirationDate, effectiveDate."
        )
        
        response = model.generate_content(
            [
                prompt,
                {
                    "mime_type": mime_type,
                    "data": file_bytes
                }
            ],
            generation_config={"response_mime_type": "application/json"}
        )
        
        # Parse the JSON response
        data = json.loads(response.text.strip())
        return data
    except Exception as e:
        logger.error(f"Error during Gemini certificate extraction: {e}")
        # Return fallback mock structure to prevent pipeline crash
        return {
            "supplierName": "Extraction Failed",
            "issuerName": "N/A",
            "certificateType": "N/A",
            "certificateNumber": "N/A",
            "expirationDate": "N/A",
            "effectiveDate": "N/A",
            "error": str(e)
        }

def run_audit_comparison(qa_text: str, compiled_json_text: str) -> Dict[str, Any]:
    """
    Calls Gemini 3.5 Flash to compare extracted certificate metadata with QA input fields, returning structured results.
    """
    if not settings.gemini_api_key:
        logger.warning("Gemini API key is not configured. Returning mock comparison report.")
        return {
            "result": "Match",
            "expiration_date": "2029-12-31",
            "suggested_comment": "Audit passed. Document matches questionnaire requirements (Mock API Mode).",
            "comparison_table": (
                "| Field Name | QA Form Value | Certificate Value | Status |\n"
                "|---|---|---|---|\n"
                "| Supplier Name | Mock Supplier Ltd | Mock Supplier Ltd | Match |\n"
                "| Certificate Type | QSHE | QSHE | Match |\n"
                "| Expiration Date | 2029-12-31 | 2029-12-31 | Match |"
            )
        }

    try:
        # Using gemini-3.5-flash for the text auditing comparison
        model = genai.GenerativeModel(
            "gemini-3.5-flash",
            system_instruction=DEFAULT_SYSTEM_INSTRUCTION
        )
        
        prompt = (
            f"Please compare the following QA Data Form and Evidence Document JSON:\n\n"
            f"QA Data Form:\n{qa_text}\n\n"
            f"Evidence Document JSON:\n{compiled_json_text}"
        )
        
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        
        return json.loads(response.text.strip())
    except Exception as e:
        logger.error(f"Error during Gemini audit comparison: {e}")
        return {
            "result": "Mismatch",
            "expiration_date": "N/A",
            "suggested_comment": f"Audit comparison failed due to server error: {e}",
            "comparison_table": "| Status |\n|---|\n| Error running comparison |"
        }

