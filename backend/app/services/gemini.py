import sys
# Force python to raise ImportError when attempting to load the incompatible C-extension
sys.modules['google._upb._message'] = None

import os
# Force pure Python implementation of Protobuf to bypass Python 3.14 C-extension incompatibilities
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import json
import logging
import re
from datetime import datetime
from typing import Dict, Any, Optional, List
import google.generativeai as genai
from app.config import settings

logger = logging.getLogger(__name__)

# Initialize the Gemini SDK
if settings.gemini_api_key:
    genai.configure(api_key=settings.gemini_api_key)

# Gemini API Pricing (USD per 1 Million tokens)
# gemini-2.5-flash-lite  — used for OCR extraction
EXTRACTION_INPUT_RATE  = 0.10 / 1_000_000
EXTRACTION_OUTPUT_RATE = 0.40 / 1_000_000
# # gemini-3.5-flash — used for audit comparison (kept for accuracy)
# COMPARISON_INPUT_RATE  = 1.50 / 1_000_000
# COMPARISON_OUTPUT_RATE = 9.00 / 1_000_000

def calculate_cost(prompt_tokens: int, candidates_tokens: int,
                   input_rate: float = EXTRACTION_INPUT_RATE,
                   output_rate: float = EXTRACTION_OUTPUT_RATE) -> float:
    return (prompt_tokens * input_rate) + (candidates_tokens * output_rate)

# ---------------------------------------------------------------------------
# JSON Schemas — enforce exact keys/types so backend key-access can't crash
# ---------------------------------------------------------------------------
EXTRACTION_SCHEMA = {
    "type": "object",
    "required": [
        "certificateOwnerName", "issuerName", "certificateType",
        "certificateNumber", "expirationDate", "effectiveDate", "certificateLocation", "yearOfPublication"
    ],
    "properties": {
        "certificateOwnerName": {"type": "string"},
        "issuerName":           {"type": "string"},
        "certificateType":      {"type": "string"},
        "certificateNumber":    {"type": "string"},
        "expirationDate":       {"type": "string"},
        "effectiveDate":        {"type": "string"},
        "certificateLocation":  {"type": "string"},
        "yearOfPublication":    {"type": "string"},
    }
}

# COMPARISON_SCHEMA = {
#     "type": "object",
#     "required": ["result", "expiration_date", "suggested_comment", "comparison_table"],
#     "properties": {
#         "result": {
#             "type": "string",
#             "enum": ["Match", "Mismatch"]
#         },
#         "expiration_date": {"type": "string"},
#         "suggested_comment": {"type": "string"},
#         "comparison_table": {"type": "string"},
#     }
# }
# 
# 
# DEFAULT_SYSTEM_INSTRUCTION = """
# You are a High-Precision Document Auditor. Your task is to audit extracted certificate details against Ariba QA form data.
# Compare the fields and identify matches or mismatches.
# 
# Check the following:
# 1. Supplier Name: Verify the name on the certificate matches the Ariba Supplier Name.
# 2. Expiration Date: Verify the certificate is current and not expired.
# 3. Regional Compliance Rules:
#    - Malaysia certificates: 10-year maximum validity cap.
#    - Australia certificates: 3-year maximum validity cap.
# 4. If there is any mismatch, generate a standard suggested comment (e.g. "Wrong Standard", "SSM Upload Mismatch", "Supplier Name Mismatch", "Certificate Expired").
# 
# CRITICAL CONSTRAINT: You must never request a text revision of the 'Certificate Type' field; you may only flag mismatched categories.
# 
# For expiration_date return: the certificate's expiry in YYYY-MM-DD, 'Expired' if already expired, or 'N/A' if absent.
# For comparison_table return: a markdown table with headers (Field Name | QA Value | Certificate Value | Status).
# """

def extract_certificate_data(file_bytes: bytes, mime_type: str, question_label: Optional[str] = None) -> tuple[Dict[str, Any], int, int, float]:
    """
    Calls Gemini 2.5 Flash to perform OCR and extract certificate data as JSON.
    Returns: (extracted_data_dict, input_tokens, output_tokens, cost_usd)
    """
    if not settings.gemini_api_key:
        logger.warning("Gemini API key is not configured. Returning empty structure.")
        mock_data = {
            "certificateOwnerName": "MOCK SUPPLIER",
            "issuerName": "MOCK ISSUER",
            "certificateType": "MOCK CERT",
            "certificateNumber": "MOCK-12345",
            "expirationDate": "31/12/2029",
            "effectiveDate": "01/01/2026",
            "certificateLocation": "Selangor, Malaysia",
            "yearOfPublication": "2026"
        }
        return mock_data, 150, 45, calculate_cost(150, 45)

    try:
        # Use gemini-2.5-flash-lite for cost-efficient OCR extraction
        model = genai.GenerativeModel("gemini-2.5-flash-lite")
        
        section_context = f" for the section '{question_label}'" if question_label else ""
        merged_instruction = (
            f"\nNote: If this document contains multiple different certificates merged together, "
            f"only extract the metadata for the specific certificate relevant to '{question_label}'."
        ) if question_label else ""
        
        prompt = (
            f"OCR this certificate{section_context}. Extract every field exactly as written. "
            "Use 'N/A' for any field not found. "
            "Dates must be formatted as DD/MM/YYYY. "
            "yearOfPublication must be the 4-digit year (e.g. 2024). If no year of publication is found on the document, use the 4-digit year from effectiveDate. "
            f"certificateLocation must be 'State, Country' (e.g. Selangor, Malaysia).{merged_instruction}"
        )
        
        response = model.generate_content(
            [
                prompt,
                {
                    "mime_type": mime_type,
                    "data": file_bytes
                }
            ],
            generation_config={
                "temperature": 0,                        # deterministic OCR — no creativity
                "response_mime_type": "application/json",
                "response_schema": EXTRACTION_SCHEMA     # enforce exact keys/types
            }
        )
        
        # Parse the JSON response
        data = json.loads(response.text.strip())

        # Fallback yearOfPublication from effectiveDate if missing or N/A
        year_pub = data.get("yearOfPublication", "N/A")
        if not year_pub or year_pub == "N/A":
            eff_date = data.get("effectiveDate", "")
            if eff_date and eff_date != "N/A":
                match = re.search(r'\b(20\d\d|19\d\d)\b', eff_date)
                if match:
                    data["yearOfPublication"] = match.group(1)
        
        # Extract usage metadata
        usage = response.usage_metadata
        in_tokens = usage.prompt_token_count if usage else 0
        out_tokens = usage.candidates_token_count if usage else 0
        cost = calculate_cost(in_tokens, out_tokens, EXTRACTION_INPUT_RATE, EXTRACTION_OUTPUT_RATE)
        
        return data, in_tokens, out_tokens, cost
    except Exception as e:
        logger.error(f"Error during Gemini certificate extraction: {e}")
        fallback_data = {
            "certificateOwnerName": "Extraction Failed",
            "issuerName": "N/A",
            "certificateType": "N/A",
            "certificateNumber": "N/A",
            "expirationDate": "N/A",
            "effectiveDate": "N/A",
            "certificateLocation": "N/A",
            "error": str(e)
        }
        return fallback_data, 0, 0, 0.0

# def run_audit_comparison(qa_text: str, compiled_json_text: str) -> tuple[Dict[str, Any], int, int, float]:
#     """
#     Calls Gemini 3.5 Flash to compare extracted certificate metadata with QA input fields, returning structured results.
#     Returns: (comparison_dict, input_tokens, output_tokens, cost_usd)
#     """
#     if not settings.gemini_api_key:
#         logger.warning("Gemini API key is not configured. Returning mock comparison report.")
#         mock_data = {
#             "result": "Match",
#             "expiration_date": "2029-12-31",
#             "suggested_comment": "Audit passed. Document matches questionnaire requirements (Mock API Mode).",
#             "comparison_table": (
#                 "| Field Name | QA Form Value | Certificate Value | Status |\n"
#                 "|---|---|---|---|\n"
#                 "| Supplier Name | Mock Supplier Ltd | Mock Supplier Ltd | Match |\n"
#                 "| Certificate Type | QSHE | QSHE | Match |\n"
#                 "| Expiration Date | 2029-12-31 | 2029-12-31 | Match |"
#             )
#         }
#         return mock_data, 450, 120, calculate_cost(450, 120)
# 
#     try:
#         # Using gemini-3.5-flash for the text auditing comparison
#         model = genai.GenerativeModel(
#             "gemini-3.5-flash",
#             system_instruction=DEFAULT_SYSTEM_INSTRUCTION
#         )
#         
#         prompt = (
#             f"Please compare the following QA Data Form and Evidence Document JSON:\n\n"
#             f"QA Data Form:\n{qa_text}\n\n"
#             f"Evidence Document JSON:\n{compiled_json_text}"
#         )
#         
#         response = model.generate_content(
#             prompt,
#             generation_config={
#                 "temperature": 0.3,                      # slight flexibility for natural comment phrasing
#                 "response_mime_type": "application/json",
#                 "response_schema": COMPARISON_SCHEMA,    # enforce result enum + required keys
#             }
#         )
#         
#         data = json.loads(response.text.strip())
#         
#         # Extract usage metadata
#         usage = response.usage_metadata
#         in_tokens = usage.prompt_token_count if usage else 0
#         out_tokens = usage.candidates_token_count if usage else 0
#         cost = calculate_cost(in_tokens, out_tokens, COMPARISON_INPUT_RATE, COMPARISON_OUTPUT_RATE)
#         
#         return data, in_tokens, out_tokens, cost
#     except Exception as e:
#         logger.error(f"Error during Gemini audit comparison: {e}")
#         fallback_data = {
#             "result": "Mismatch",
#             "expiration_date": "N/A",
#             "suggested_comment": f"Audit comparison failed due to server error: {e}",
#             "comparison_table": "| Status |\n|---|\n| Error running comparison |"
#         }
#         return fallback_data, 0, 0, 0.0


def check_keyword_match(val_evidence: str, val_qa: str) -> str:
    def clean(s: str) -> str:
        if not s:
            return ""
        s = str(s).strip().lower()
        if s in ("n/a", "na", "-", "missing", "none", "null"):
            return ""
        return s

    ev_clean = clean(val_evidence)
    qa_clean = clean(val_qa)

    if not ev_clean and not qa_clean:
        return "Match"
    if not ev_clean or not qa_clean:
        return "Mismatch"

    # Exact, substring, or reverse substring match
    if ev_clean == qa_clean or ev_clean in qa_clean or qa_clean in ev_clean:
        return "Match"

    # Token/word inclusion match
    def get_words(s: str):
        words = re.sub(r'[^\w\s]', '', s).split()
        return [w for w in words if len(w) > 1]

    ev_words = get_words(ev_clean)
    qa_words = get_words(qa_clean)

    if ev_words and all(w in qa_clean for w in ev_words):
        return "Match"
    if qa_words and all(w in ev_clean for w in qa_words):
        return "Match"

    return "Mismatch"


def normalize_date(s: str) -> str:
    s = str(s).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%d/%m/%Y")
        except ValueError:
            continue
    return s


def run_programmatic_audit(supplier_name: str, file_contexts: List[Dict[str, Any]], extraction_results: List[Dict[str, Any]]) -> tuple[str, str, dict]:
    """
    Programmatically compares extracted document metadata with QA answers using keyword matching.
    Returns: (overall_verdict, suggested_comment, comparison_table_dict)
    """
    overall_verdict = "Match"
    comment_lines = [f"Supplier: {supplier_name}"]
    
    comparison_table_dict = {
        "supplier_name": supplier_name,
        "tables": []
    }

    # Sort comparison pairs by question label number prefix (e.g. 1.1, 1.2, 1.3)
    pairs = list(zip(file_contexts, extraction_results))
    def get_sort_key(pair):
        label = pair[0].get("ariba_question_label", "General Attachment").strip()
        match = re.match(r'^(\d+(?:\.\d+)*)', label)
        if match:
            try:
                return [int(x) for x in match.group(1).split('.')]
            except Exception:
                pass
        return [999]
    pairs.sort(key=get_sort_key)

    for ctx, extracted_data in pairs:
        question_label = ctx.get("ariba_question_label", "General Attachment")
        qa_answers_str = ctx.get("ariba_qa_answers", "[]")

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

        # Compare the 8 fields in the requested sequence
        table_rows = []

        # 1. certificate type
        ev_val = extracted_data.get("certificateType", "N/A")
        qa_val = qa_map.get("certificate type", "N/A")
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Certificate Type", ev_val, qa_val, res))

        # 2. supplier name
        ev_val = extracted_data.get("certificateOwnerName", "N/A")
        qa_val = supplier_name
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Supplier Name", ev_val, qa_val, res))

        # 3. issuer
        ev_val = extracted_data.get("issuerName", "N/A")
        qa_val = qa_map.get("issuer", "N/A")
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Issuer", ev_val, qa_val, res))

        # 4. year of publication
        ev_val = extracted_data.get("yearOfPublication", "N/A")
        if not ev_val or ev_val == "N/A":
            eff_date = extracted_data.get("effectiveDate", "")
            if eff_date and eff_date != "N/A":
                match = re.search(r'\b(20\d\d|19\d\d)\b', eff_date)
                if match:
                    ev_val = match.group(1)
        qa_val = qa_map.get("year of publication", "N/A")
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Year of Publication", ev_val, qa_val, res))

        # 5. certificate number
        ev_val = extracted_data.get("certificateNumber", "N/A")
        qa_val = qa_map.get("certificate number", "N/A")
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Certificate Number", ev_val, qa_val, res))

        # 6. certificate location
        ev_val = extracted_data.get("certificateLocation", "N/A")
        qa_val = qa_map.get("certificate location", "N/A")
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Certificate Location", ev_val, qa_val, res))

        # 7. effective date
        ev_val = normalize_date(extracted_data.get("effectiveDate", "N/A"))
        qa_val = normalize_date(qa_map.get("effective date", "N/A"))
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Effective Date", ev_val, qa_val, res))

        # 8. expiration date
        ev_val = normalize_date(extracted_data.get("expirationDate", "N/A"))
        qa_val = normalize_date(qa_map.get("expiration date", "N/A"))
        res = check_keyword_match(ev_val, qa_val)
        if res == "Mismatch":
            overall_verdict = "Mismatch"
        table_rows.append(("Expiration Date", ev_val, qa_val, res))

        # Build markdown table
        table_lines = [
            f"\n{question_label}",
            "| Field | Value in Evidence | Value in QA Data | Result |",
            "|---|---|---|---|"
        ]
        for field, ev, qa, r in table_rows:
            table_lines.append(f"| {field} | {ev} | {qa} | {r} |")

        comment_lines.append("\n".join(table_lines))

        # Build structured JSON dict for frontend
        table_dict = {
            "question_label": question_label,
            "attached_file": ctx.get("filename", ""),
            "comparison_rows": []
        }
        for field, ev, qa, r in table_rows:
            table_dict["comparison_rows"].append({
                "field_name": field,
                "value_evidence": ev,
                "value_qa": qa,
                "result": r
            })
        comparison_table_dict["tables"].append(table_dict)

    suggested_comment = "\n\n".join(comment_lines)
    return overall_verdict, suggested_comment, comparison_table_dict


